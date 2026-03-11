const assert = require('assert')
const fs = require('fs/promises')

// B+ Tree Implementation
// Key differences from B-tree:
// 1. Internal nodes only store keys (no values)
// 2. All values are in leaf nodes
// 3. Leaf nodes are linked for sequential access
// 4. Better range query performance

const PageSize = 1024 * 4 /* 4kb */

const NodeType = {
  ['Internal']: 0,  // Internal nodes (was 'Node')
  ['Leaf']: 1,      // Leaf nodes
}

// Internal node header (no values, only keys and pointers)
const InternalHeaderLayout = [
  ['Type', 1 /* uint8_t */],
  ['Parent', 4 /* uint32_t */],
  ['Size', 4 /* uint32_t */],
  ['IsRoot', 1 /* uint8_t */],
]

// Internal node cell (pointer + key)
const InternalCellLayout = [
  ['Pointer', 4 /* uint32_t */],
  ['Key', 4 /* uint32_t */],
]

// Leaf node header (includes next pointer for linking)
const LeafHeaderLayout = [
  ['Type', 1 /* uint8_t */],
  ['Parent', 4 /* uint32_t */],
  ['Size', 4 /* uint32_t */],
  ['Next', 4 /* uint32_t */],
  ['Prev', 4 /* uint32_t */],  // Previous leaf for bidirectional traversal
]

const layoutOffsetOf = (layout, type) => {
  let offset = 0

  for (let [k, v] of layout) {
    if (k === type) {
      return offset
    }
    offset += v
  }

  return offset
}

const getLeafCellLayout = (rowSize) => [
  ['Key', 4 /* uint32_t */],
  ['Value', rowSize /* dynamic based on schema */],
]

const SerializeInternal = (node, buffer) => {
  let offset = 0

  buffer.writeUint8(NodeType.Internal, offset)
  offset = layoutOffsetOf(InternalHeaderLayout, 'Type') + 1

  buffer.writeUInt32LE(node.parent, offset)
  offset = layoutOffsetOf(InternalHeaderLayout, 'Parent') + 4

  buffer.writeUInt32LE(node.size, offset)
  offset = layoutOffsetOf(InternalHeaderLayout, 'Size') + 4

  buffer.writeUint8(node.isRoot ? 1 : 0, offset)
  offset = layoutOffsetOf(InternalHeaderLayout, 'IsRoot') + 1

  // Write pointers and keys
  // B+ tree internal node: [P0, K0, P1, K1, P2, K2, ..., Pn]
  // We have n+1 pointers and n keys
  for (let i = 0; i < node.size; i++) {
    buffer.writeUInt32LE(node.pointers[i], offset)
    offset += 4

    buffer.writeUInt32LE(node.keys[i], offset)
    offset += 4
  }
  
  // Write the last pointer
  buffer.writeUInt32LE(node.pointers[node.size], offset)

  return buffer
}

const SerializeLeaf = (node, buffer, serializeValFn) => {
  let offset = 0

  buffer.writeUint8(NodeType.Leaf, offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Type') + 1

  buffer.writeUInt32LE(node.parent, offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Parent') + 4

  buffer.writeUInt32LE(node.size, offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Size') + 4

  buffer.writeUInt32LE(node.next || 0, offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Next') + 4

  buffer.writeUInt32LE(node.prev || 0, offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Prev') + 4

  // Write key-value pairs in leaf nodes
  for (let i = 0; i < node.size; i++) {
    buffer.writeUInt32LE(node.keys[i], offset)
    offset += 4

    const serializedValue = serializeValFn(node.values[i])
    buffer.set(serializedValue, offset)
    offset += serializedValue.length
  }

  return buffer
}

const Serialize = (node, buffer, serializeValFn) => {
  return node.type === 'Internal'
    ? SerializeInternal(node, buffer)
    : SerializeLeaf(node, buffer, serializeValFn)
}

const DeserializeInternal = (buffer, pn) => {
  let offset = layoutOffsetOf(InternalHeaderLayout, 'Type') + 1

  const parent = buffer.readUInt32LE(offset)
  offset = layoutOffsetOf(InternalHeaderLayout, 'Parent') + 4

  const size = buffer.readUInt32LE(offset)
  offset = layoutOffsetOf(InternalHeaderLayout, 'Size') + 4

  const isRoot = buffer.readUInt8(offset) === 1
  offset = layoutOffsetOf(InternalHeaderLayout, 'IsRoot') + 1

  const pointers = []
  const keys = []

  // Read pointers and keys
  for (let i = 0; i < size; i++) {
    const pointer = buffer.readUInt32LE(offset)
    offset += 4

    const key = buffer.readUInt32LE(offset)
    offset += 4

    pointers.push(pointer)
    keys.push(key)
  }

  // Read the last pointer
  pointers.push(buffer.readUInt32LE(offset))

  return {
    type: 'Internal',
    no: pn,
    parent,
    size,
    isRoot,
    pointers,
    keys,
  }
}

const DeserializeLeaf = (buffer, pn, deserializeValFn, rowSize) => {
  let offset = layoutOffsetOf(LeafHeaderLayout, 'Type') + 1

  const parent = buffer.readUInt32LE(offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Parent') + 4

  const size = buffer.readUInt32LE(offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Size') + 4

  const next = buffer.readUInt32LE(offset) || null
  offset = layoutOffsetOf(LeafHeaderLayout, 'Next') + 4

  const prev = buffer.readUInt32LE(offset) || null
  offset = layoutOffsetOf(LeafHeaderLayout, 'Prev') + 4

  const keys = []
  const values = []

  for (let i = 0; i < size; i++) {
    const key = buffer.readUInt32LE(offset)
    offset += 4

    const value = deserializeValFn(buffer.subarray(offset, offset + rowSize))
    offset += rowSize

    keys.push(key)
    values.push(value)
  }

  return {
    type: 'Leaf',
    no: pn,
    parent,
    size,
    next: next === 0 ? null : next,
    prev: prev === 0 ? null : prev,
    keys,
    values,
  }
}

const Deserialize = (buffer, pn, deserializeValFn, rowSize) => {
  const type = buffer.readUInt8()

  return type === NodeType.Internal
    ? DeserializeInternal(buffer, pn)
    : DeserializeLeaf(buffer, pn, deserializeValFn, rowSize)
}

// Calculate maximum sizes for B+ tree nodes
const getMaxInternalSize = () => {
  // Internal nodes: header + (pointer + key) pairs + final pointer
  const headerSize = InternalHeaderLayout.reduce((sum, [, size]) => sum + size, 0)
  const cellSize = InternalCellLayout.reduce((sum, [, size]) => sum + size, 0)
  const finalPointerSize = 4
  
  // Available space = PageSize - header - finalPointer
  // Each cell takes cellSize space
  const availableSpace = PageSize - headerSize - finalPointerSize
  return Math.floor(availableSpace / cellSize)
}

const getMaxLeafSize = (rowSize) => {
  // Leaf nodes: header + (key + value) pairs
  const headerSize = LeafHeaderLayout.reduce((sum, [, size]) => sum + size, 0)
  const cellSize = 4 + rowSize // key + value
  
  const availableSpace = PageSize - headerSize
  return Math.floor(availableSpace / cellSize)
}

// B+ Tree Operations
class BPlusTree {
  constructor(pager, options = {}) {
    this.pager = pager
    this.order = options.order || Math.floor(getMaxLeafSize(pager.rowSize) / 2)
    this.root = null
  }

  // Find the leaf node that should contain the key
  async findLeaf(key) {
    if (!this.root) return null

    let current = this.root
    
    while (current && current.type === 'Internal') {
      let i = 0
      // Find the appropriate child pointer
      while (i < current.size && key >= current.keys[i]) {
        i++
      }
      current = await this.pager.page(current.pointers[i])
    }
    
    return current
  }

  // Search for a specific key
  async search(key) {
    const leaf = await this.findLeaf(key)
    if (!leaf) return null

    const index = leaf.keys.indexOf(key)
    return index !== -1 ? { key, value: leaf.values[index] } : null
  }

  // Range search - efficient sequential access through linked leaves
  async rangeSearch(startKey, endKey, limit = Infinity) {
    const startLeaf = await this.findLeaf(startKey)
    if (!startLeaf) return []

    const results = []
    let current = startLeaf
    let startIndex = 0

    // Find starting position in first leaf
    while (startIndex < current.size && current.keys[startIndex] < startKey) {
      startIndex++
    }

    while (current && results.length < limit) {
      // Process current leaf
      for (let i = startIndex; i < current.size && results.length < limit; i++) {
        if (current.keys[i] > endKey) {
          return results // End of range
        }
        results.push({ key: current.keys[i], value: current.values[i] })
      }

      // Move to next leaf
      if (current.next) {
        current = await this.pager.page(current.next)
        startIndex = 0 // Start from beginning of next leaf
      } else {
        break
      }
    }

    return results
  }

  // Insert operation
  async insert(key, value) {
    if (!this.root) {
      // Create first leaf node as root
      this.root = {
        type: 'Leaf',
        no: this.pager.no++,
        parent: null,
        size: 1,
        next: null,
        prev: null,
        keys: [key],
        values: [value],
      }
      this.pager.pages[this.root.no] = this.root
      return
    }

    const leaf = await this.findLeaf(key)
    if (!leaf) throw new Error('Could not find appropriate leaf for insertion')

    // Check if key already exists
    const existingIndex = leaf.keys.indexOf(key)
    if (existingIndex !== -1) {
      // Update existing value
      leaf.values[existingIndex] = value
      return
    }

    // Insert into leaf in sorted order
    let insertIndex = 0
    while (insertIndex < leaf.size && leaf.keys[insertIndex] < key) {
      insertIndex++
    }

    leaf.keys.splice(insertIndex, 0, key)
    leaf.values.splice(insertIndex, 0, value)
    leaf.size++

    // Check if leaf overflow
    if (leaf.size > this.order) {
      await this.splitLeaf(leaf)
    }
  }

  // Split a leaf node
  async splitLeaf(leaf) {
    const mid = Math.floor(leaf.size / 2)
    
    // Create new leaf node
    const newLeaf = {
      type: 'Leaf',
      no: this.pager.no++,
      parent: leaf.parent,
      size: leaf.size - mid,
      next: leaf.next,
      prev: leaf.no,
      keys: leaf.keys.slice(mid),
      values: leaf.values.slice(mid),
    }

    // Update original leaf
    leaf.keys = leaf.keys.slice(0, mid)
    leaf.values = leaf.values.slice(0, mid)
    leaf.size = mid
    leaf.next = newLeaf.no

    // Update next leaf's prev pointer
    if (newLeaf.next) {
      const nextLeaf = await this.pager.page(newLeaf.next)
      nextLeaf.prev = newLeaf.no
    }

    this.pager.pages[newLeaf.no] = newLeaf

    // Promote key to parent
    const promoteKey = newLeaf.keys[0]
    
    if (!leaf.parent) {
      // Create new root
      const newRoot = {
        type: 'Internal',
        no: this.pager.no++,
        parent: null,
        size: 1,
        isRoot: true,
        pointers: [leaf.no, newLeaf.no],
        keys: [promoteKey],
      }
      
      leaf.parent = newRoot.no
      newLeaf.parent = newRoot.no
      this.root = newRoot
      this.pager.pages[newRoot.no] = newRoot
    } else {
      await this.insertIntoInternal(leaf.parent, promoteKey, newLeaf.no)
    }
  }

  // Insert into internal node
  async insertIntoInternal(nodeNo, key, rightPointer) {
    const node = await this.pager.page(nodeNo)
    
    // Find insertion position
    let insertIndex = 0
    while (insertIndex < node.size && node.keys[insertIndex] < key) {
      insertIndex++
    }

    // Insert key and right pointer
    node.keys.splice(insertIndex, 0, key)
    node.pointers.splice(insertIndex + 1, 0, rightPointer)
    node.size++

    // Check for overflow
    if (node.size > this.order) {
      await this.splitInternal(node)
    }
  }

  // Split internal node
  async splitInternal(node) {
    const mid = Math.floor(node.size / 2)
    const promoteKey = node.keys[mid]
    
    // Create new internal node
    const newInternal = {
      type: 'Internal',
      no: this.pager.no++,
      parent: node.parent,
      size: node.size - mid - 1,
      isRoot: false,
      pointers: node.pointers.slice(mid + 1),
      keys: node.keys.slice(mid + 1),
    }

    // Update original node
    node.keys = node.keys.slice(0, mid)
    node.pointers = node.pointers.slice(0, mid + 1)
    node.size = mid

    // Update parent pointers for moved children
    for (const pointer of newInternal.pointers) {
      const child = await this.pager.page(pointer)
      child.parent = newInternal.no
    }

    this.pager.pages[newInternal.no] = newInternal

    if (!node.parent) {
      // Create new root
      const newRoot = {
        type: 'Internal',
        no: this.pager.no++,
        parent: null,
        size: 1,
        isRoot: true,
        pointers: [node.no, newInternal.no],
        keys: [promoteKey],
      }
      
      node.parent = newRoot.no
      newInternal.parent = newRoot.no
      this.root = newRoot
      this.pager.pages[newRoot.no] = newRoot
    } else {
      await this.insertIntoInternal(node.parent, promoteKey, newInternal.no)
    }
  }

  // Delete operation
  async delete(key) {
    const leaf = await this.findLeaf(key)
    if (!leaf) return false

    const index = leaf.keys.indexOf(key)
    if (index === -1) return false

    // Remove from leaf
    leaf.keys.splice(index, 1)
    leaf.values.splice(index, 1)
    leaf.size--

    // Handle underflow if necessary
    const minKeys = Math.floor(this.order / 2)
    if (leaf.size < minKeys && leaf.parent) {
      await this.handleLeafUnderflow(leaf)
    }

    return true
  }

  // Handle leaf underflow (simplified - merge or redistribute)
  async handleLeafUnderflow(leaf) {
    // Implementation depends on B+ tree variant
    // Could merge with sibling or redistribute keys
    // For now, we'll allow underflow (simplified implementation)
  }

  // Get all values in order (efficient traversal)
  async getAllInOrder() {
    if (!this.root) return []

    // Find leftmost leaf
    let current = this.root
    while (current.type === 'Internal') {
      current = await this.pager.page(current.pointers[0])
    }

    const results = []
    
    // Traverse all leaves using next pointers
    while (current) {
      for (let i = 0; i < current.size; i++) {
        results.push({ key: current.keys[i], value: current.values[i] })
      }
      
      current = current.next ? await this.pager.page(current.next) : null
    }

    return results
  }
}

const connectDB = ((path, options = {}) => {
  /** @type { fs.FileHandle } */
  let fd
  
  // Default to immediate sync for data safety, can be disabled for performance
  const immediateSync = options.immediateSync !== false

  return {
    open: async () => {
      if (await fs.access(path).then(() => true, () => false)) {
        console.log('file exists, r+')
        fd = await fs.open(path, 'r+')
      } else {
        console.log('file does not exist, w+')
        fd = await fs.open(path, 'w+')
      }
    },
    stat: async () => {
      return await fd.stat()
    },
    read: async (pn, buffer, size = buffer.length) => {
      size === buffer.length
        ? assert(buffer.length % PageSize === 0, `buffer length ${buffer.length}`)
        : assert(size > 0, `size ${size}`)

      const r = await fd.read(buffer, 0, size, pn * PageSize)
      assert(r.bytesRead === size, `read ${r.bytesRead} bytes`)
    },
    write: async (pn, buffer, size = buffer.length) => {
      size === buffer.length
        ? assert(buffer.length % PageSize === 0, `buffer length ${buffer.length}`)
        : assert(size > 0, `size ${size}`)

      const r = await fd.write(buffer, 0, size, pn * PageSize)
      assert(r.bytesWritten === size, `wrote ${r.bytesWritten} bytes`)
      
      if (immediateSync) {
        await fd.sync()
      }
    },
    close: async () => {
      await fd.sync()
      await fd.close()
    },
    flush: async () => {
      await fd.sync()
    },
  }
})

const createPager = async (db, options) => {
  const size = (await db.stat()).size / PageSize

  const pager = {
    no: size === 0 ? 1 : size,
    pages: [],
    rowSize: options.rowSize || options.schema?.getRowSize(),
    
    async page(pn) {
      if (this.pages[pn]) {
        return this.pages[pn]
      }
  
      const buf = Buffer.alloc(PageSize)
      await db.read(pn, buf)
  
      const val = Deserialize(buf, pn, options.deserialize, this.rowSize)
  
      // Handle root page
      if (pn === 0) {
        return (this.pages[0] = await pager.page(val.parent))
      }
  
      return (this.pages[pn] = val)
    },
    
    async flush() {
      for (let i = 0; i < pager.pages.length; i++) {
        const p = pager.pages[i]
    
        if (p) {
          let s = p
    
          if (i === 0) {
            s = { ...p, parent: p.no } // save root page as page[0]'s parent
          }
    
          await db.write(i, Serialize(s, Buffer.alloc(PageSize), options.serialize))
        }
      }
    }
  }

  return pager
}

module.exports = {
  BPlusTree,
  getMaxInternalSize,
  getMaxLeafSize,
  connectDB,
  createPager,
  PageSize,
  NodeType,
  Serialize,
  Deserialize,
}