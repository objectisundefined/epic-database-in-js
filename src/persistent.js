const assert = require('assert')
const fs = require('fs/promises')

// sizeof(int) = 4
// sizeof(int*) = 8
// sizeof(uint8_t) = 1
// sizeof(uint32_t) = 4

const PageSize = 1024 * 4 /* 4kb */

const NodeType = {
  ['Node']: 0,
  ['Leaf']: 1,
}

// RowSize is now dynamic and will be calculated from schema
// const RowSize =
//   4 + /* id	integer */
//   32 + /* username	varchar(32) */ /* \0 */
//   255 /* email	varchar(255) */ /* \0 */

const NodeHeaderLayout = [
  ['Type', 1 /* uint8_t */],
  ['Parent', 4 /* uint32_t */],
  ['Size', 4 /* uint32_t */],
]

const NodeCellLayout = [
  ['Link', 4 /* uint32_t */],
  ['Key', 4 /* uint32_t */],
]

const LeafHeaderLayout = [
  ['Type', 1 /* uint8_t */],
  ['Parent', 4 /* uint32_t */],
  ['Size', 4 /* uint32_t */],
  ['Next', 4 /* uint32_t */],
]

// LeafCellLayout is now dynamic based on schema
// const LeafCellLayout = [
//   ['Key', 4 /* uint32_t */],
//   ['Value', RowSize /* dynamic based on schema */],
// ]

const layoutOffsetOf = (layout, type) => {
  let offset = 0

  for (let [k, v] of layout) {
    offset += v

    if (k === type) {
      break
    }
  }

  return offset
}

const getLeafCellLayout = (rowSize) => [
  ['Key', 4 /* uint32_t */],
  ['Value', rowSize /* dynamic based on schema */],
]

const SerializeNode = (node, buffer) => {
  let offset = 0

  buffer.writeUint8(NodeType.Node, offset)
  offset = layoutOffsetOf(NodeHeaderLayout, 'Type')

  buffer.writeUInt32LE(node.parent, offset)
  offset = layoutOffsetOf(NodeHeaderLayout, 'Parent')

  buffer.writeUInt32LE(node.size, offset)
  offset = layoutOffsetOf(NodeHeaderLayout, 'Size')

  for (let i = 0; i < node.size; i++) {
    buffer.writeUInt32LE(node.links[i], offset)
    offset = offset + layoutOffsetOf(NodeCellLayout, 'Link')

    buffer.writeUInt32LE(node.keys[i], offset)
    offset = offset - layoutOffsetOf(NodeCellLayout, 'Link') + layoutOffsetOf(NodeCellLayout, 'Key')
  }

  buffer.writeUInt32LE(node.links[node.size], offset)

  return buffer
}

const SerializeLeaf = (node, buffer, serializeValFn) => {
  let offset = 0

  buffer.writeUint8(NodeType.Leaf, offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Type')

  buffer.writeUInt32LE(node.parent, offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Parent')

  buffer.writeUInt32LE(node.size, offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Size')

  buffer.writeUInt32LE(node.next, offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Next')

  for (let i = 0; i < node.size; i++) {
    buffer.writeUInt32LE(node.keys[i], offset)
    offset = offset + 4 // Key size is always 4 bytes

    buffer.set(serializeValFn(node.values[i]), offset) // buf
    offset = offset + serializeValFn(node.values[i]).length // Dynamic value size
  }

  return buffer
}

const Serialize = (node, buffer, serializeValFn) => {
  return node.type === 'Node'
    ? SerializeNode(node, buffer)
    : SerializeLeaf(node, buffer, serializeValFn)
}

const DeserializeNode = (buffer, pn) => {
  let offset = layoutOffsetOf(NodeHeaderLayout, 'Type')

  const parent = buffer.readUInt32LE(offset)
  offset = layoutOffsetOf(NodeHeaderLayout, 'Parent')

  const size = buffer.readUInt32LE(offset)
  offset = layoutOffsetOf(NodeHeaderLayout, 'Size')

  const links = []
  const keys = []

  for (let i = 0; i < size; i++) {
    const link = buffer.readUInt32LE(offset)
    offset = offset + layoutOffsetOf(NodeCellLayout, 'Link')

    const key = buffer.readUInt32LE(offset)
    offset = offset - layoutOffsetOf(NodeCellLayout, 'Link') + layoutOffsetOf(NodeCellLayout, 'Key')

    links.push(link)
    keys.push(key)
  }

  links.push(buffer.readUInt32LE(offset))

  return {
    type: 'Node',
    no: pn,
    parent,
    size,
    links,
    keys,
  }
}

const DeserializeLeaf = (buffer, pn, deserializeValFn, rowSize) => {
  let offset = layoutOffsetOf(LeafHeaderLayout, 'Type')

  const parent = buffer.readUInt32LE(offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Parent')

  const size = buffer.readUInt32LE(offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Size')

  const next = buffer.readUInt32LE(offset)
  offset = layoutOffsetOf(LeafHeaderLayout, 'Next')

  const keys = []
  const values = []

  for (let i = 0; i < size; i++) {
    const key = buffer.readUInt32LE(offset)
    offset = offset + 4 // Key size is always 4 bytes

    const value = deserializeValFn(buffer.subarray(offset, offset + rowSize))
    offset = offset + rowSize // Dynamic value size

    keys.push(key)
    values.push(value)
  }

  return {
    type: 'Leaf',
    no: pn,
    parent,
    size,
    next,
    keys,
    values,
  }
}

const Deserialize = (buffer, pn, deserializeValFn, rowSize) => {
  const type = buffer.readUInt8()

  return type === NodeType.Node
    ? DeserializeNode(buffer, pn)
    : DeserializeLeaf(buffer, pn, deserializeValFn, rowSize)
}

// These functions now accept rowSize as parameter
const getMaxNodeSize = () => ~~((PageSize - layoutOffsetOf(NodeHeaderLayout, 'Size')) / layoutOffsetOf(NodeCellLayout, 'Key'))
const getMaxLeafSize = (rowSize) => ~~((PageSize - layoutOffsetOf(LeafHeaderLayout, 'Next')) / layoutOffsetOf(getLeafCellLayout(rowSize), 'Value'))

const connectDB = ((path) => {
  /** @type { fs.FileHandle } */
  let fd

  return {
    open: async () => {
      /* https://man7.org/linux/man-pages/man3/fopen.3.html
      ┌─────────────┬───────────────────────────────┐
      │fopen() mode │ open() flags                  │
      ├─────────────┼───────────────────────────────┤
      │     r       │ O_RDONLY                      │
      ├─────────────┼───────────────────────────────┤
      │     w       │ O_WRONLY | O_CREAT | O_TRUNC  │
      ├─────────────┼───────────────────────────────┤
      │     a       │ O_WRONLY | O_CREAT | O_APPEND │
      ├─────────────┼───────────────────────────────┤
      │     r+      │ O_RDWR                        │
      ├─────────────┼───────────────────────────────┤
      │     w+      │ O_RDWR | O_CREAT | O_TRUNC    │
      ├─────────────┼───────────────────────────────┤
      │     a+      │ O_RDWR | O_CREAT | O_APPEND   │
      └─────────────┴───────────────────────────────┘ */

      // function access(path: PathLike, mode?: number): Promise<void>
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
      // case: last page was not full.
      size === buffer.length
        ? assert(buffer.length % PageSize === 0, `buffer length ${buffer.length}`)
        : assert(size > 0, `size ${size}`) // Allow dynamic row sizes

      const r = await fd.read(buffer, 0, size, pn * PageSize)

      assert(r.bytesRead === size, `read ${r.bytesRead} bytes`)
    },
    write: async (pn, buffer, size = buffer.length) => {
      // case: last page was not full.
      size === buffer.length
        ? assert(buffer.length % PageSize === 0, `buffer length ${buffer.length}`)
        : assert(size > 0, `size ${size}`) // Allow dynamic row sizes

      const r = await fd.write(buffer, 0, size, pn * PageSize)

      assert(r.bytesWritten === size, `wrote ${r.bytesWritten} bytes`)
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
    no: size === 0 ? 1 : size /* page 0 + data pages */,
    pages: [],
    rowSize: options.rowSize || options.schema?.getRowSize() || 291, // Default to original row size for backward compatibility
    async page(pn) {
      if (this.pages[pn]) {
        return this.pages[pn]
      }
  
      const buf = Buffer.alloc(PageSize)
  
      await db.read(pn, buf)
  
      const val = Deserialize(buf, pn, options.deserialize, this.rowSize)
  
      // patch root
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
  // Export functions that depend on schema
  getMaxNodeSize,
  getMaxLeafSize,

  connectDB,
  createPager,
  
  // Export constants for backward compatibility
  PageSize,
  NodeType,
}
