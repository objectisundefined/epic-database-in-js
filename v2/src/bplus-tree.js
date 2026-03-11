'use strict'

/**
 * Disk-based B+ Tree
 * ==================
 * Every node lives in exactly one page managed by a Pager instance.
 *
 * Page layout (PAGE_SIZE = 4096 bytes):
 *
 *   ┌────────────────── 16-byte header ──────────────────┐
 *   │ [0]    type      uint8    NODE_INTERNAL / NODE_LEAF  │
 *   │ [1-2]  keyCount  uint16LE  number of keys stored     │
 *   │ [3]    flags     uint8    (reserved, currently 0)    │
 *   │ [4-7]  nextLeaf  uint32LE  page-id of next leaf      │
 *   │ [8-11] prevLeaf  uint32LE  page-id of prev leaf      │
 *   │ [12-15]          reserved                            │
 *   └────────────────────────────────────────────────────┘
 *   then DATA_AREA (4080 bytes):
 *
 *   Internal node data area:
 *     child₀, key₀, child₁, key₁, …, keyₙ₋₁, childₙ
 *     Each child  = 4-byte uint32LE page-id
 *     Each key    = 4-byte int32LE  primary key
 *     Capacity    = 509 keys  (floor((4080-4)/8))
 *
 *   Leaf node data area:
 *     (key₀, value₀), (key₁, value₁), …
 *     Each key   = 4-byte int32LE
 *     Each value = `recordSize` bytes
 *     Capacity   = floor(4080 / (4 + recordSize))
 */

const NULL_PAGE = 0          // sentinel: "no such page"
const NODE_INTERNAL = 1
const NODE_LEAF = 2

// ── Header field offsets (within a page) ─────────────────────────────────────
const OFF_TYPE       = 0   // uint8
const OFF_KEY_COUNT  = 1   // uint16LE
const OFF_FLAGS      = 3   // uint8
const OFF_NEXT_LEAF  = 4   // uint32LE  (leaf only)
const OFF_PREV_LEAF  = 8   // uint32LE  (leaf only)
const HEADER_SIZE    = 16

// ── Internal-node geometry ────────────────────────────────────────────────────
const CHILD_SZ  = 4          // uint32LE
const IKEY_SZ   = 4          // int32LE
const IENTRY_SZ = CHILD_SZ + IKEY_SZ   // 8 bytes per key slot
// Layout: child[0], key[0], child[1], key[1], …, key[N-1], child[N]
// Size = (N+1)*4 + N*4 = 8N+4  ≤ DATA_AREA
const DATA_AREA = 4096 - HEADER_SIZE    // 4080
// Physical capacity = floor((4080-4)/8) = 509.
// We use capacity-1 (508) as the split threshold so that when we insert one
// more entry into a "full" node (keyCount == 508) the shift loop writes
// child[509] at offset 16+509*8=4088, which is safely within the 4096-byte page.
const INTERNAL_MAX_KEYS = Math.floor((DATA_AREA - CHILD_SZ) / IENTRY_SZ) - 1  // 508

// ── Leaf-node geometry ────────────────────────────────────────────────────────
const LKEY_SZ = 4            // int32LE

// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {number} n
 * @param {number} pageId
 * @param {number} childIndex  index of the child edge in the internal node
 */
function pathEntry (pageId, childIndex) {
  return { pageId, childIndex }
}

// ─────────────────────────────────────────────────────────────────────────────

class BPlusTree {
  /**
   * @param {import('./pager').Pager} pager
   * @param {number} recordSize  fixed bytes per stored value (schema.recordSize)
   */
  constructor (pager, recordSize) {
    if (recordSize < 1) throw new Error('recordSize must be >= 1')

    this.pager      = pager
    this.recordSize = recordSize

    this._leafEntrySize = LKEY_SZ + recordSize
    // Physical capacity: how many entries physically fit in the data area.
    // We use (capacity - 1) as the split threshold so the shift-right during
    // insert (which temporarily needs one extra slot) stays within page bounds.
    const leafCapacity   = Math.floor(DATA_AREA / this._leafEntrySize)
    this._leafMaxKeys    = leafCapacity - 1
    this._leafMinKeys    = Math.ceil(this._leafMaxKeys / 2)
    this._internalMaxKeys = INTERNAL_MAX_KEYS
    this._internalMinKeys = Math.ceil(INTERNAL_MAX_KEYS / 2)

    if (this._leafMaxKeys < 2) {
      throw new Error(
        `recordSize (${recordSize}) is too large for a ${4096}-byte page. ` +
        `Maximum is ${Math.floor(DATA_AREA / 2) - LKEY_SZ}.`
      )
    }
  }

  /**
   * Initialise a brand-new, empty tree.
   * Returns the page-id of the (empty leaf) root.
   */
  async create () {
    const rootId = await this.pager.allocatePage()
    const page   = await this.pager.getPage(rootId)
    this._initLeaf(page)
    this.pager.markDirty(rootId)
    this.pager.rootPageId = rootId
    return rootId
  }

  get rootPageId ()    { return this.pager.rootPageId }
  set rootPageId (id)  { this.pager.rootPageId = id }

  // ── Public API ───────────────────────────────────────────────────────────────

  /** @returns {Buffer|null} */
  async get (key) {
    let pageId = this.rootPageId
    while (true) {
      const page = await this.pager.getPage(pageId)
      if (page.readUInt8(OFF_TYPE) === NODE_LEAF) {
        return this._leafGet(page, key)
      }
      pageId = this._iChild(page, this._iFindChildIdx(page, key))
    }
  }

  /**
   * Insert or update a key-value pair.
   * @returns {boolean}  true if key was new (INSERT), false if updated (UPDATE)
   */
  async set (key, value) {
    const { leafId, path } = await this._findLeafWithPath(key)
    const page = await this.pager.getPage(leafId)
    const isNew = this._leafSet(page, key, value)
    this.pager.markDirty(leafId)

    if (page.readUInt16LE(OFF_KEY_COUNT) > this._leafMaxKeys) {
      await this._splitLeaf(leafId, path)
    }
    return isNew
  }

  /**
   * Delete a key.
   * @returns {boolean}  true if key existed
   */
  async delete (key) {
    const { leafId, path } = await this._findLeafWithPath(key)
    const page = await this.pager.getPage(leafId)
    const deleted = this._leafDelete(page, key)
    if (!deleted) return false

    this.pager.markDirty(leafId)

    if (leafId !== this.rootPageId &&
        page.readUInt16LE(OFF_KEY_COUNT) < this._leafMinKeys) {
      await this._fixLeafUnderflow(leafId, path)
    }
    return true
  }

  /**
   * Return all entries with minKey ≤ key ≤ maxKey (pass null for open bounds).
   * @returns {{ key: number, value: Buffer }[]}
   */
  async range (minKey, maxKey) {
    const results = []
    const startKey = minKey !== null && minKey !== undefined ? minKey : -Infinity
    let pageId = await this._findLeafForKey(startKey)

    while (pageId !== NULL_PAGE) {
      const page    = await this.pager.getPage(pageId)
      const keyCount = page.readUInt16LE(OFF_KEY_COUNT)
      let done = false

      for (let i = 0; i < keyCount; i++) {
        const k = this._lKey(page, i)
        if (minKey !== null && minKey !== undefined && k < minKey) continue
        if (maxKey !== null && maxKey !== undefined && k > maxKey) { done = true; break }
        results.push({ key: k, value: this._lVal(page, i) })
      }
      if (done) break
      pageId = page.readUInt32LE(OFF_NEXT_LEAF)
    }
    return results
  }

  /** Return all entries in key order. */
  async scan () {
    return this.range(null, null)
  }

  /** Count all entries. */
  async count () {
    let total = 0
    let pageId = await this._findLeafForKey(-Infinity)
    while (pageId !== NULL_PAGE) {
      const page = await this.pager.getPage(pageId)
      total += page.readUInt16LE(OFF_KEY_COUNT)
      pageId = page.readUInt32LE(OFF_NEXT_LEAF)
    }
    return total
  }

  // ── Internal-node helpers ─────────────────────────────────────────────────────

  /** Offset of child[i] within a page */
  _iChildOffset (i) { return HEADER_SIZE + i * IENTRY_SZ }
  /** Offset of key[i] within a page */
  _iKeyOffset   (i) { return HEADER_SIZE + CHILD_SZ + i * IENTRY_SZ }

  _iChild (page, i)   { return page.readUInt32LE(this._iChildOffset(i)) }
  _iKey   (page, i)   { return page.readInt32LE (this._iKeyOffset(i))  }

  _iSetChild (page, i, v) { page.writeUInt32LE(v, this._iChildOffset(i)) }
  _iSetKey   (page, i, v) { page.writeInt32LE (v, this._iKeyOffset(i))  }

  /**
   * Return the index of the child to follow for `key`.
   * Returns i such that key < keys[i] (first key strictly greater).
   */
  _iFindChildIdx (page, key) {
    const n = page.readUInt16LE(OFF_KEY_COUNT)
    let lo = 0, hi = n - 1, pos = n
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this._iKey(page, mid) <= key) { lo = mid + 1 }
      else { pos = mid; hi = mid - 1 }
    }
    return pos
  }

  // ── Leaf helpers ──────────────────────────────────────────────────────────────

  _lEntryOffset (i)       { return HEADER_SIZE + i * this._leafEntrySize }
  _lKeyOffset   (i)       { return this._lEntryOffset(i) }
  _lValOffset   (i)       { return this._lEntryOffset(i) + LKEY_SZ }

  _lKey (page, i)  { return page.readInt32LE (this._lKeyOffset(i)) }
  _lVal (page, i)  {
    const o   = this._lValOffset(i)
    const buf = Buffer.alloc(this.recordSize)
    page.copy(buf, 0, o, o + this.recordSize)
    return buf
  }

  _lBinarySearch (page, key) {
    const n = page.readUInt16LE(OFF_KEY_COUNT)
    let lo = 0, hi = n - 1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      const k   = this._lKey(page, mid)
      if (k === key) return { found: true, pos: mid }
      if (k < key)  lo = mid + 1
      else          hi = mid - 1
    }
    return { found: false, pos: lo }
  }

  /** Return value Buffer or null */
  _leafGet (page, key) {
    const { found, pos } = this._lBinarySearch(page, key)
    return found ? this._lVal(page, pos) : null
  }

  /** Insert or update in leaf.  Returns true if new. */
  _leafSet (page, key, value) {
    const { found, pos } = this._lBinarySearch(page, key)
    const n   = page.readUInt16LE(OFF_KEY_COUNT)
    const esz = this._leafEntrySize

    if (found) {
      // Update value in-place
      value.copy(page, this._lValOffset(pos))
      return false
    }

    // Shift entries [pos..n) right by one
    const from = HEADER_SIZE + pos * esz
    const to   = HEADER_SIZE + n   * esz
    page.copy(page, from + esz, from, to)

    // Write new entry
    page.writeInt32LE(key, this._lKeyOffset(pos))
    value.copy(page, this._lValOffset(pos))
    page.writeUInt16LE(n + 1, OFF_KEY_COUNT)
    return true
  }

  /** Remove key from leaf.  Returns true if found. */
  _leafDelete (page, key) {
    const { found, pos } = this._lBinarySearch(page, key)
    if (!found) return false

    const n   = page.readUInt16LE(OFF_KEY_COUNT)
    const esz = this._leafEntrySize
    const from = HEADER_SIZE + pos * esz

    page.copy(page, from, from + esz, HEADER_SIZE + n * esz)
    page.writeUInt16LE(n - 1, OFF_KEY_COUNT)
    return true
  }

  // ── Page initialisation ────────────────────────────────────────────────────────

  _initLeaf (page) {
    page.fill(0)
    page.writeUInt8(NODE_LEAF, OFF_TYPE)
    page.writeUInt16LE(0, OFF_KEY_COUNT)
    page.writeUInt32LE(NULL_PAGE, OFF_NEXT_LEAF)
    page.writeUInt32LE(NULL_PAGE, OFF_PREV_LEAF)
  }

  _initInternal (page) {
    page.fill(0)
    page.writeUInt8(NODE_INTERNAL, OFF_TYPE)
    page.writeUInt16LE(0, OFF_KEY_COUNT)
  }

  // ── Path traversal ────────────────────────────────────────────────────────────

  /** Traverse from root to leaf, collecting path entries (for splits/merges). */
  async _findLeafWithPath (key) {
    const path = []
    let pageId = this.rootPageId

    while (true) {
      const page = await this.pager.getPage(pageId)
      if (page.readUInt8(OFF_TYPE) === NODE_LEAF) return { leafId: pageId, path }

      const ci = this._iFindChildIdx(page, key)
      path.push(pathEntry(pageId, ci))
      pageId = this._iChild(page, ci)
    }
  }

  async _findLeafForKey (key) {
    const { leafId } = await this._findLeafWithPath(
      key === -Infinity ? Number.MIN_SAFE_INTEGER : key
    )
    // Walk back to very first leaf if key is -Infinity
    if (key === -Infinity) return await this._firstLeaf()
    return leafId
  }

  async _firstLeaf () {
    let pageId = this.rootPageId
    while (true) {
      const page = await this.pager.getPage(pageId)
      if (page.readUInt8(OFF_TYPE) === NODE_LEAF) return pageId
      pageId = this._iChild(page, 0)
    }
  }

  // ── Split logic ───────────────────────────────────────────────────────────────

  async _splitLeaf (leafId, path) {
    const lPage  = await this.pager.getPage(leafId)
    const n      = lPage.readUInt16LE(OFF_KEY_COUNT)
    const mid    = Math.ceil(n / 2)  // left keeps [0..mid), right gets [mid..n)
    const esz    = this._leafEntrySize

    const rId    = await this.pager.allocatePage()
    const rPage  = await this.pager.getPage(rId)
    this._initLeaf(rPage)

    // Copy right half
    const rCount = n - mid
    lPage.copy(rPage, HEADER_SIZE, HEADER_SIZE + mid * esz, HEADER_SIZE + n * esz)
    rPage.writeUInt16LE(rCount, OFF_KEY_COUNT)

    // Update linked list: lPage ↔ rPage ↔ old-next
    const oldNext = lPage.readUInt32LE(OFF_NEXT_LEAF)
    lPage.writeUInt32LE(rId, OFF_NEXT_LEAF)
    lPage.writeUInt16LE(mid, OFF_KEY_COUNT)

    rPage.writeUInt32LE(oldNext,  OFF_NEXT_LEAF)
    rPage.writeUInt32LE(leafId,   OFF_PREV_LEAF)

    if (oldNext !== NULL_PAGE) {
      const onPage = await this.pager.getPage(oldNext)
      onPage.writeUInt32LE(rId, OFF_PREV_LEAF)
      this.pager.markDirty(oldNext)
    }

    this.pager.markDirty(leafId)
    this.pager.markDirty(rId)

    // Separator = first key of right half
    const separator = this._lKey(rPage, 0)
    await this._pushUpKey(leafId, separator, rId, path)
  }

  async _splitInternal (pageId, path) {
    const page   = await this.pager.getPage(pageId)
    const n      = page.readUInt16LE(OFF_KEY_COUNT)
    const mid    = Math.floor(n / 2)
    const pushed = this._iKey(page, mid)   // key promoted to parent

    // Right child: keys[mid+1..n-1], children[mid+1..n]
    const rId   = await this.pager.allocatePage()
    const rPage = await this.pager.getPage(rId)
    this._initInternal(rPage)

    const rKeyCount = n - mid - 1
    for (let i = 0; i <= rKeyCount; i++) {
      this._iSetChild(rPage, i, this._iChild(page, mid + 1 + i))
    }
    for (let i = 0; i < rKeyCount; i++) {
      this._iSetKey(rPage, i, this._iKey(page, mid + 1 + i))
    }
    rPage.writeUInt16LE(rKeyCount, OFF_KEY_COUNT)

    // Left child: keys[0..mid-1], children[0..mid]
    page.writeUInt16LE(mid, OFF_KEY_COUNT)

    this.pager.markDirty(pageId)
    this.pager.markDirty(rId)

    await this._pushUpKey(pageId, pushed, rId, path)
  }

  /**
   * Insert (separator, rightChildId) into the parent internal node.
   * If there is no parent, create a new root.
   */
  async _pushUpKey (leftId, separatorKey, rightId, path) {
    if (path.length === 0) {
      // The node that just split was the root → create a new root
      const newRootId = await this.pager.allocatePage()
      const newRoot   = await this.pager.getPage(newRootId)
      this._initInternal(newRoot)

      this._iSetChild(newRoot, 0, leftId)
      this._iSetKey(newRoot, 0, separatorKey)
      this._iSetChild(newRoot, 1, rightId)
      newRoot.writeUInt16LE(1, OFF_KEY_COUNT)

      this.pager.markDirty(newRootId)
      this.rootPageId = newRootId
      return
    }

    const { pageId: parentId, childIndex } = path[path.length - 1]
    const parent = await this.pager.getPage(parentId)
    const pn     = parent.readUInt16LE(OFF_KEY_COUNT)

    // Shift entries from childIndex to pn to the right
    for (let i = pn; i > childIndex; i--) {
      this._iSetChild(parent, i + 1, this._iChild(parent, i))
      this._iSetKey(parent, i, this._iKey(parent, i - 1))
    }
    this._iSetKey(parent, childIndex, separatorKey)
    this._iSetChild(parent, childIndex + 1, rightId)
    parent.writeUInt16LE(pn + 1, OFF_KEY_COUNT)

    this.pager.markDirty(parentId)

    if (pn + 1 > this._internalMaxKeys) {
      await this._splitInternal(parentId, path.slice(0, -1))
    }
  }

  // ── Underflow repair (leaf) ───────────────────────────────────────────────────

  async _fixLeafUnderflow (leafId, path) {
    if (path.length === 0) return   // root leaf can be empty

    const { pageId: parentId, childIndex } = path[path.length - 1]
    const parent   = await this.pager.getPage(parentId)
    const pn       = parent.readUInt16LE(OFF_KEY_COUNT)

    // ── Try borrow from left sibling ──────────────────────────────────────────
    if (childIndex > 0) {
      const lSibId = this._iChild(parent, childIndex - 1)
      const lSib   = await this.pager.getPage(lSibId)
      if (lSib.readUInt16LE(OFF_KEY_COUNT) > this._leafMinKeys) {
        this._leafBorrowFromLeft(
          await this.pager.getPage(leafId), lSib, parent, childIndex - 1
        )
        this.pager.markDirty(leafId)
        this.pager.markDirty(lSibId)
        this.pager.markDirty(parentId)
        return
      }
    }

    // ── Try borrow from right sibling ─────────────────────────────────────────
    if (childIndex < pn) {
      const rSibId = this._iChild(parent, childIndex + 1)
      const rSib   = await this.pager.getPage(rSibId)
      if (rSib.readUInt16LE(OFF_KEY_COUNT) > this._leafMinKeys) {
        this._leafBorrowFromRight(
          await this.pager.getPage(leafId), rSib, parent, childIndex
        )
        this.pager.markDirty(leafId)
        this.pager.markDirty(rSibId)
        this.pager.markDirty(parentId)
        return
      }
    }

    // ── Merge ─────────────────────────────────────────────────────────────────
    if (childIndex > 0) {
      const lSibId = this._iChild(parent, childIndex - 1)
      await this._mergeLeaves(lSibId, leafId, parentId, childIndex - 1, path)
    } else {
      const rSibId = this._iChild(parent, childIndex + 1)
      await this._mergeLeaves(leafId, rSibId, parentId, childIndex, path)
    }
  }

  _leafBorrowFromLeft (page, lSib, parent, sepIdx) {
    const n   = page.readUInt16LE(OFF_KEY_COUNT)
    const ln  = lSib.readUInt16LE(OFF_KEY_COUNT)
    const esz = this._leafEntrySize

    // Shift page entries right by 1
    page.copy(page, HEADER_SIZE + esz, HEADER_SIZE, HEADER_SIZE + n * esz)

    // Move last entry of lSib to first of page
    lSib.copy(page, HEADER_SIZE, HEADER_SIZE + (ln - 1) * esz, HEADER_SIZE + ln * esz)
    page.writeUInt16LE(n + 1, OFF_KEY_COUNT)
    lSib.writeUInt16LE(ln - 1, OFF_KEY_COUNT)

    // Update separator in parent
    parent.writeInt32LE(this._lKey(page, 0), this._iKeyOffset(sepIdx))
  }

  _leafBorrowFromRight (page, rSib, parent, sepIdx) {
    const n   = page.readUInt16LE(OFF_KEY_COUNT)
    const rn  = rSib.readUInt16LE(OFF_KEY_COUNT)
    const esz = this._leafEntrySize

    // Move first entry of rSib to last of page
    rSib.copy(page, HEADER_SIZE + n * esz, HEADER_SIZE, HEADER_SIZE + esz)
    page.writeUInt16LE(n + 1, OFF_KEY_COUNT)

    // Shift rSib entries left by 1
    rSib.copy(rSib, HEADER_SIZE, HEADER_SIZE + esz, HEADER_SIZE + rn * esz)
    rSib.writeUInt16LE(rn - 1, OFF_KEY_COUNT)

    // Update separator in parent
    parent.writeInt32LE(this._lKey(rSib, 0), this._iKeyOffset(sepIdx))
  }

  /** Merge rightId into leftId, then remove the separator from parent. */
  async _mergeLeaves (leftId, rightId, parentId, sepIdx, path) {
    const lPage = await this.pager.getPage(leftId)
    const rPage = await this.pager.getPage(rightId)
    const ln    = lPage.readUInt16LE(OFF_KEY_COUNT)
    const rn    = rPage.readUInt16LE(OFF_KEY_COUNT)
    const esz   = this._leafEntrySize

    // Append rPage entries to lPage
    rPage.copy(lPage, HEADER_SIZE + ln * esz, HEADER_SIZE, HEADER_SIZE + rn * esz)
    lPage.writeUInt16LE(ln + rn, OFF_KEY_COUNT)

    // Update leaf linked list
    const rNext = rPage.readUInt32LE(OFF_NEXT_LEAF)
    lPage.writeUInt32LE(rNext, OFF_NEXT_LEAF)
    if (rNext !== NULL_PAGE) {
      const rnPage = await this.pager.getPage(rNext)
      rnPage.writeUInt32LE(leftId, OFF_PREV_LEAF)
      this.pager.markDirty(rNext)
    }

    this.pager.markDirty(leftId)

    // Remove separator from parent
    await this._removeKeyFromInternal(parentId, sepIdx, path)
  }

  // ── Underflow repair (internal) ───────────────────────────────────────────────

  async _removeKeyFromInternal (pageId, keyIdx, path) {
    const page = await this.pager.getPage(pageId)
    const n    = page.readUInt16LE(OFF_KEY_COUNT)

    // Remove key[keyIdx] and child[keyIdx+1]
    for (let i = keyIdx; i < n - 1; i++) {
      this._iSetKey(page, i, this._iKey(page, i + 1))
      this._iSetChild(page, i + 1, this._iChild(page, i + 2))
    }
    page.writeUInt16LE(n - 1, OFF_KEY_COUNT)
    this.pager.markDirty(pageId)

    // Handle root collapse
    if (pageId === this.rootPageId) {
      if (n - 1 === 0) {
        // Root is now empty → its only remaining child becomes the new root
        this.rootPageId = this._iChild(page, 0)
      }
      return
    }

    if (n - 1 >= this._internalMinKeys) return

    // Fix underflow in internal node
    await this._fixInternalUnderflow(pageId, path)
  }

  async _fixInternalUnderflow (pageId, path) {
    if (path.length === 0) return

    const { pageId: parentId, childIndex } = path[path.length - 1]
    const parent = await this.pager.getPage(parentId)
    const pn     = parent.readUInt16LE(OFF_KEY_COUNT)

    // ── Try borrow from left ──────────────────────────────────────────────────
    if (childIndex > 0) {
      const lSibId = this._iChild(parent, childIndex - 1)
      const lSib   = await this.pager.getPage(lSibId)
      if (lSib.readUInt16LE(OFF_KEY_COUNT) > this._internalMinKeys) {
        this._internalBorrowFromLeft(
          await this.pager.getPage(pageId), lSib, parent, childIndex - 1
        )
        this.pager.markDirty(pageId)
        this.pager.markDirty(lSibId)
        this.pager.markDirty(parentId)
        return
      }
    }

    // ── Try borrow from right ─────────────────────────────────────────────────
    if (childIndex < pn) {
      const rSibId = this._iChild(parent, childIndex + 1)
      const rSib   = await this.pager.getPage(rSibId)
      if (rSib.readUInt16LE(OFF_KEY_COUNT) > this._internalMinKeys) {
        this._internalBorrowFromRight(
          await this.pager.getPage(pageId), rSib, parent, childIndex
        )
        this.pager.markDirty(pageId)
        this.pager.markDirty(rSibId)
        this.pager.markDirty(parentId)
        return
      }
    }

    // ── Merge ─────────────────────────────────────────────────────────────────
    if (childIndex > 0) {
      const lSibId = this._iChild(parent, childIndex - 1)
      await this._mergeInternals(lSibId, pageId, parentId, childIndex - 1, path)
    } else {
      const rSibId = this._iChild(parent, childIndex + 1)
      await this._mergeInternals(pageId, rSibId, parentId, childIndex, path)
    }
  }

  _internalBorrowFromLeft (page, lSib, parent, sepIdx) {
    const n  = page.readUInt16LE(OFF_KEY_COUNT)
    const ln = lSib.readUInt16LE(OFF_KEY_COUNT)

    // Shift page right by 1 (make room at index 0)
    for (let i = n; i > 0; i--) {
      this._iSetChild(page, i + 1, this._iChild(page, i))
      this._iSetKey(page, i, this._iKey(page, i - 1))
    }
    this._iSetChild(page, 1, this._iChild(page, 0))

    // Bring down parent separator
    this._iSetKey(page, 0, this._iKey(parent, sepIdx))
    // Left sibling's last child becomes child[0]
    this._iSetChild(page, 0, this._iChild(lSib, ln))
    page.writeUInt16LE(n + 1, OFF_KEY_COUNT)

    // Promote left sibling's last key to parent
    parent.writeInt32LE(this._iKey(lSib, ln - 1), this._iKeyOffset(sepIdx))
    lSib.writeUInt16LE(ln - 1, OFF_KEY_COUNT)
  }

  _internalBorrowFromRight (page, rSib, parent, sepIdx) {
    const n  = page.readUInt16LE(OFF_KEY_COUNT)
    const rn = rSib.readUInt16LE(OFF_KEY_COUNT)

    // Bring down parent separator as last key; rSib[0]'s child becomes last child
    this._iSetKey(page, n, this._iKey(parent, sepIdx))
    this._iSetChild(page, n + 1, this._iChild(rSib, 0))
    page.writeUInt16LE(n + 1, OFF_KEY_COUNT)

    // Promote right sibling's first key to parent
    parent.writeInt32LE(this._iKey(rSib, 0), this._iKeyOffset(sepIdx))

    // Shift rSib left by 1
    for (let i = 0; i < rn - 1; i++) {
      this._iSetKey(rSib, i, this._iKey(rSib, i + 1))
      this._iSetChild(rSib, i, this._iChild(rSib, i + 1))
    }
    this._iSetChild(rSib, rn - 1, this._iChild(rSib, rn))
    rSib.writeUInt16LE(rn - 1, OFF_KEY_COUNT)
  }

  async _mergeInternals (leftId, rightId, parentId, sepIdx, path) {
    const lPage  = await this.pager.getPage(leftId)
    const rPage  = await this.pager.getPage(rightId)
    const parent = await this.pager.getPage(parentId)
    const ln     = lPage.readUInt16LE(OFF_KEY_COUNT)
    const rn     = rPage.readUInt16LE(OFF_KEY_COUNT)

    // Pull separator from parent into left node
    this._iSetKey(lPage, ln, this._iKey(parent, sepIdx))
    this._iSetChild(lPage, ln + 1, this._iChild(rPage, 0))

    for (let i = 0; i < rn; i++) {
      this._iSetKey(lPage, ln + 1 + i, this._iKey(rPage, i))
      this._iSetChild(lPage, ln + 2 + i, this._iChild(rPage, i + 1))
    }
    lPage.writeUInt16LE(ln + 1 + rn, OFF_KEY_COUNT)
    this.pager.markDirty(leftId)

    await this._removeKeyFromInternal(parentId, sepIdx, path.slice(0, -1))
  }

  // ── Debug ─────────────────────────────────────────────────────────────────────

  /** Print a human-readable representation of the tree to stdout. */
  async printTree () {
    await this._printNode(this.rootPageId, 0)
  }

  async _printNode (pageId, depth) {
    const page = await this.pager.getPage(pageId)
    const type = page.readUInt8(OFF_TYPE)
    const n    = page.readUInt16LE(OFF_KEY_COUNT)
    const pad  = '  '.repeat(depth)

    if (type === NODE_LEAF) {
      const keys = []
      for (let i = 0; i < n; i++) keys.push(this._lKey(page, i))
      console.log(`${pad}[LEAF pg=${pageId}] keys=[${keys.join(',')}]`)
    } else {
      const keys = []
      for (let i = 0; i < n; i++) keys.push(this._iKey(page, i))
      console.log(`${pad}[INTERNAL pg=${pageId}] keys=[${keys.join(',')}]`)
      for (let i = 0; i <= n; i++) {
        await this._printNode(this._iChild(page, i), depth + 1)
      }
    }
  }
}

module.exports = { BPlusTree, NULL_PAGE, NODE_INTERNAL, NODE_LEAF, HEADER_SIZE }
