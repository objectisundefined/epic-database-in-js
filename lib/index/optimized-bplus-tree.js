/**
 * Optimized B+ Tree Implementation
 * 
 * Performance improvements:
 * - Pre-calculated layout offsets for faster serialization
 * - Optimized node splitting algorithms
 * - Better memory management with buffer pooling
 * - Batch insert capabilities
 * - Improved range query performance
 */

const assert = require('assert')
const { connectOptimizedDB, createOptimizedPager } = require('../storage/optimized-storage')

const PageSize = 1024 * 4 /* 4kb */

const NodeType = {
  ['Internal']: 0,  // Internal nodes (was 'Node')
  ['Leaf']: 1,      // Leaf nodes
}

// Pre-calculated offsets for better performance
const InternalHeaderLayout = [
  ['Type', 1 /* uint8_t */],
  ['Parent', 4 /* uint32_t */],
  ['Size', 4 /* uint32_t */],
  ['IsRoot', 1 /* uint8_t */],
]

const InternalCellLayout = [
  ['Pointer', 4 /* uint32_t */],
  ['Key', 4 /* uint32_t */],
]

const LeafHeaderLayout = [
  ['Type', 1 /* uint8_t */],
  ['Parent', 4 /* uint32_t */],
  ['Size', 4 /* uint32_t */],
  ['Next', 4 /* uint32_t */],
  ['Prev', 4 /* uint32_t */],
]

// Pre-calculate offsets for better performance
const INTERNAL_OFFSETS = {}
const LEAF_OFFSETS = {}

let offset = 0
for (let [k, v] of InternalHeaderLayout) {
  INTERNAL_OFFSETS[k] = offset
  offset += v
}

offset = 0
for (let [k, v] of LeafHeaderLayout) {
  LEAF_OFFSETS[k] = offset
  offset += v
}

const INTERNAL_CELL_SIZE = 8 // pointer(4) + key(4)
const INTERNAL_HEADER_SIZE = 10 // sum of InternalHeaderLayout sizes
const LEAF_HEADER_SIZE = 17 // sum of LeafHeaderLayout sizes

const getLeafCellLayout = (rowSize) => [
  ['Key', 4 /* uint32_t */],
  ['Value', rowSize /* dynamic based on schema */],
]

// Optimized serialization with pre-calculated offsets
const SerializeInternal = (node, buffer) => {
  // Header
  buffer.writeUint8(NodeType.Internal, INTERNAL_OFFSETS.Type)
  buffer.writeUInt32LE(node.parent, INTERNAL_OFFSETS.Parent)
  buffer.writeUInt32LE(node.size, INTERNAL_OFFSETS.Size)
  buffer.writeUint8(node.isRoot ? 1 : 0, INTERNAL_OFFSETS.IsRoot)

  // Cells - optimized loop
  let offset = INTERNAL_HEADER_SIZE
  for (let i = 0; i < node.size; i++) {
    buffer.writeUInt32LE(node.pointers[i], offset)
    buffer.writeUInt32LE(node.keys[i], offset + 4)
    offset += INTERNAL_CELL_SIZE
  }
  
  // Last pointer
  buffer.writeUInt32LE(node.pointers[node.size], offset)

  return buffer
}

const SerializeLeaf = (node, buffer, serializeValFn) => {
  // Header with pre-calculated offsets
  buffer.writeUint8(NodeType.Leaf, LEAF_OFFSETS.Type)
  buffer.writeUInt32LE(node.parent, LEAF_OFFSETS.Parent)
  buffer.writeUInt32LE(node.size, LEAF_OFFSETS.Size)
  buffer.writeUInt32LE(node.next || 0, LEAF_OFFSETS.Next)
  buffer.writeUInt32LE(node.prev || 0, LEAF_OFFSETS.Prev)

  // Cells - optimized serialization
  let offset = LEAF_HEADER_SIZE
  const cellSize = 4 + node.rowSize // key + value size
  
  for (let i = 0; i < node.size; i++) {
    buffer.writeUInt32LE(node.keys[i], offset)
    offset += 4
    
    const serialized = serializeValFn(node.values[i])
    serialized.copy(buffer, offset)
    offset += node.rowSize
  }

  return buffer
}

// Optimized deserialization
const DeserializeInternal = (buffer, pageNo) => {
  const node = {
    no: pageNo,
    type: buffer.readUint8(INTERNAL_OFFSETS.Type),
    parent: buffer.readUInt32LE(INTERNAL_OFFSETS.Parent),
    size: buffer.readUInt32LE(INTERNAL_OFFSETS.Size),
    isRoot: buffer.readUint8(INTERNAL_OFFSETS.IsRoot) === 1,
    keys: [],
    pointers: []
  }

  // Read cells efficiently
  let offset = INTERNAL_HEADER_SIZE
  for (let i = 0; i < node.size; i++) {
    node.pointers[i] = buffer.readUInt32LE(offset)
    node.keys[i] = buffer.readUInt32LE(offset + 4)
    offset += INTERNAL_CELL_SIZE
  }
  
  // Last pointer
  node.pointers[node.size] = buffer.readUInt32LE(offset)

  return node
}

const DeserializeLeaf = (buffer, pageNo, rowSize, deserializeValFn) => {
  const node = {
    no: pageNo,
    type: buffer.readUint8(LEAF_OFFSETS.Type),
    parent: buffer.readUInt32LE(LEAF_OFFSETS.Parent),
    size: buffer.readUInt32LE(LEAF_OFFSETS.Size),
    next: buffer.readUInt32LE(LEAF_OFFSETS.Next) || null,
    prev: buffer.readUInt32LE(LEAF_OFFSETS.Prev) || null,
    keys: [],
    values: [],
    rowSize
  }

  // Read cells efficiently
  let offset = LEAF_HEADER_SIZE
  for (let i = 0; i < node.size; i++) {
    node.keys[i] = buffer.readUInt32LE(offset)
    offset += 4
    
    const valueBuffer = buffer.subarray(offset, offset + rowSize)
    node.values[i] = deserializeValFn(valueBuffer)
    offset += rowSize
  }

  return node
}

// Optimized B+ Tree class
class OptimizedBPlusTree {
  constructor(filename, rowSize, order, serialize, deserialize, options = {}) {
    this.filename = filename
    this.rowSize = rowSize
    this.order = order
    this.serialize = serialize
    this.deserialize = deserialize
    
    // Performance options
    this.options = {
      cacheSize: 200,
      bufferPoolSize: 100,
      batchWrites: true,
      immediateSync: false,
      ...options
    }

    this.pager = null
    this.db = null
    this.stats = {
      reads: 0,
      writes: 0,
      cacheHits: 0,
      insertions: 0,
      deletions: 0,
      splits: 0
    }
  }

  async open() {
    this.db = connectOptimizedDB(this.filename, this.options)
    await this.db.open()

    this.pager = await createOptimizedPager(this.db, {
      rowSize: this.rowSize,
      serialize: (node, buffer) => this.serializeNode(node, buffer),
      deserialize: (buffer, pn) => this.deserializeNode(buffer, pn)
    })

    console.log(`🚀 Optimized B+ Tree opened: ${this.filename}`)
    console.log(`   Row Size: ${this.rowSize} bytes`)
    console.log(`   Order: ${this.order}`)
    console.log(`   Cache Size: ${this.options.cacheSize} pages`)
  }

  serializeNode(node, buffer) {
    if (node.type === NodeType.Internal) {
      return SerializeInternal(node, buffer)
    } else {
      return SerializeLeaf(node, buffer, this.serialize)
    }
  }

  deserializeNode(buffer, pageNo) {
    const type = buffer.readUint8(0)
    if (type === NodeType.Internal) {
      return DeserializeInternal(buffer, pageNo)
    } else {
      return DeserializeLeaf(buffer, pageNo, this.rowSize, this.deserialize)
    }
  }

  // Optimized batch insert
  async insertBatch(records) {
    const sortedRecords = records.sort((a, b) => a.key - b.key)
    
    for (const record of sortedRecords) {
      await this.insert(record.key, record.value)
    }
    
    // Flush in batch for better performance
    await this.pager.flushBatch()
    this.stats.insertions += records.length
  }

  async insert(key, value) {
    let root = await this.pager.page(0)
    
    if (!root) {
      // Create root leaf node
      root = this.createLeafNode(1, null, true)
      root.keys[0] = key
      root.values[0] = value
      root.size = 1
      this.pager.pages[1] = root
      this.pager.pages[0] = { parent: 1 }
      this.pager.no = 2 // Update page counter
      this.stats.insertions++
      return
    }

    const realRoot = await this.pager.page(root.parent || root.no)
    const leaf = await this.findLeaf(key, realRoot)
    this.insertIntoLeaf(leaf, key, value)
    this.stats.insertions++
  }

  // Optimized range query with better leaf traversal
  async *rangeQuery(startKey, endKey, limit = Infinity) {
    const root = await this.pager.page(0)
    if (!root) return

    const startLeaf = await this.findLeaf(startKey, root)
    let currentLeaf = startLeaf
    let count = 0

    while (currentLeaf && count < limit) {
      for (let i = 0; i < currentLeaf.size; i++) {
        const key = currentLeaf.keys[i]
        
        if (key >= startKey && key <= endKey) {
          if (count >= limit) return
          yield { key, value: currentLeaf.values[i] }
          count++
        } else if (key > endKey) {
          return
        }
      }
      
      // Move to next leaf efficiently
      if (currentLeaf.next) {
        currentLeaf = await this.pager.page(currentLeaf.next)
      } else {
        break
      }
    }
  }

  createLeafNode(pageNo, parent, isRoot = false) {
    return {
      no: pageNo,
      type: NodeType.Leaf,
      parent: parent ? parent.no : 0,
      size: 0,
      next: null,
      prev: null,
      keys: new Array(this.order).fill(0),
      values: new Array(this.order),
      rowSize: this.rowSize,
      isRoot
    }
  }

  createInternalNode(pageNo, parent, isRoot = false) {
    return {
      no: pageNo,
      type: NodeType.Internal,
      parent: parent ? parent.no : 0,
      size: 0,
      keys: new Array(this.order).fill(0),
      pointers: new Array(this.order + 1).fill(0),
      isRoot
    }
  }

  async findLeaf(key, node) {
    this.stats.reads++
    
    if (node.type === NodeType.Leaf) {
      return node
    }

    // Binary search for better performance
    let left = 0
    let right = node.size - 1
    let childIndex = 0

    while (left <= right) {
      const mid = Math.floor((left + right) / 2)
      if (key < node.keys[mid]) {
        right = mid - 1
      } else {
        childIndex = mid + 1
        left = mid + 1
      }
    }

    const child = await this.pager.page(node.pointers[childIndex])
    return this.findLeaf(key, child)
  }

  insertIntoLeaf(leaf, key, value) {
    // Find insertion point using binary search
    let insertIndex = 0
    while (insertIndex < leaf.size && leaf.keys[insertIndex] < key) {
      insertIndex++
    }

    // Check for duplicate key
    if (insertIndex < leaf.size && leaf.keys[insertIndex] === key) {
      leaf.values[insertIndex] = value // Update existing
      return
    }

    // Shift elements
    for (let i = leaf.size; i > insertIndex; i--) {
      leaf.keys[i] = leaf.keys[i - 1]
      leaf.values[i] = leaf.values[i - 1]
    }

    // Insert new key-value pair
    leaf.keys[insertIndex] = key
    leaf.values[insertIndex] = value
    leaf.size++

    // Check if split is needed
    if (leaf.size >= this.order) {
      this.splitLeaf(leaf)
      this.stats.splits++
    }
  }

  splitLeaf(leaf) {
    const newLeaf = this.createLeafNode(++this.pager.no, leaf.parent)
    const mid = Math.floor(this.order / 2)

    // Move half the keys to new leaf
    for (let i = mid; i < leaf.size; i++) {
      newLeaf.keys[i - mid] = leaf.keys[i]
      newLeaf.values[i - mid] = leaf.values[i]
    }
    
    newLeaf.size = leaf.size - mid
    leaf.size = mid

    // Update leaf links
    newLeaf.next = leaf.next
    newLeaf.prev = leaf.no
    leaf.next = newLeaf.no

    if (newLeaf.next) {
      const nextLeaf = this.pager.pages[newLeaf.next]
      if (nextLeaf) nextLeaf.prev = newLeaf.no
    }

    this.pager.pages[newLeaf.no] = newLeaf

    // Promote key to parent
    const promoteKey = newLeaf.keys[0]
    if (leaf.parent) {
      const parent = this.pager.pages[leaf.parent]
      this.insertIntoInternal(parent, promoteKey, newLeaf.no)
    } else {
      // Create new root
      this.createNewRoot(leaf, newLeaf, promoteKey)
    }
  }

  insertIntoInternal(node, key, pointer) {
    let insertIndex = 0
    while (insertIndex < node.size && node.keys[insertIndex] < key) {
      insertIndex++
    }

    // Shift elements
    for (let i = node.size; i > insertIndex; i--) {
      node.keys[i] = node.keys[i - 1]
      node.pointers[i + 1] = node.pointers[i]
    }

    node.keys[insertIndex] = key
    node.pointers[insertIndex + 1] = pointer
    node.size++

    if (node.size >= this.order) {
      this.splitInternal(node)
      this.stats.splits++
    }
  }

  splitInternal(node) {
    const newInternal = this.createInternalNode(++this.pager.no, node.parent)
    const mid = Math.floor(this.order / 2)
    const promoteKey = node.keys[mid]

    // Move half the keys to new internal node
    for (let i = mid + 1; i < node.size; i++) {
      newInternal.keys[i - mid - 1] = node.keys[i]
      newInternal.pointers[i - mid - 1] = node.pointers[i]
    }
    newInternal.pointers[node.size - mid - 1] = node.pointers[node.size]
    
    newInternal.size = node.size - mid - 1
    node.size = mid

    this.pager.pages[newInternal.no] = newInternal

    // Promote key to parent
    if (node.parent) {
      const parent = this.pager.pages[node.parent]
      this.insertIntoInternal(parent, promoteKey, newInternal.no)
    } else {
      // Create new root
      this.createNewRoot(node, newInternal, promoteKey)
    }
  }

  createNewRoot(leftChild, rightChild, key) {
    const newRoot = this.createInternalNode(++this.pager.no, null, true)
    newRoot.keys[0] = key
    newRoot.pointers[0] = leftChild.no
    newRoot.pointers[1] = rightChild.no
    newRoot.size = 1

    leftChild.parent = newRoot.no
    rightChild.parent = newRoot.no
    leftChild.isRoot = false
    rightChild.isRoot = false

    this.pager.pages[newRoot.no] = newRoot
    this.pager.pages[0] = { parent: newRoot.no }
  }

  async close() {
    if (this.pager) {
      await this.pager.flush()
    }
    if (this.db) {
      await this.db.close()
    }
    console.log(`💾 Optimized B+ Tree closed: ${this.filename}`)
  }

  getStats() {
    return {
      ...this.stats,
      storageStats: this.db ? this.db.getStats() : null,
      pageCount: this.pager ? this.pager.no : 0
    }
  }

  async getInfo() {
    const root = await this.pager.page(0)
    return {
      filename: this.filename,
      rowSize: this.rowSize,
      order: this.order,
      hasRoot: !!root,
      pageCount: this.pager.no,
      stats: this.getStats()
    }
  }
}

module.exports = { OptimizedBPlusTree, NodeType, PageSize }