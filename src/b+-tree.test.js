const assert = require('assert')
const path = require('path')
const fs = require('fs/promises')

const {
  ROW_SIZE,
  PAGE_SIZE,
  NodeType,
  LEAF_NODE_MAX_CELLS,
  initialize_leaf_node,
  leaf_node_key,
  leaf_node_value,
  leaf_node_cell,
  leaf_node_num_cells,
  print_constants,
  print_leaf_node,
} = require('./b+-tree')

const serialize = row => {
  const buffer = Buffer.alloc(ROW_SIZE)

  buffer.writeUInt32LE(row.id, 0)
  buffer.write(row.username, 4, 32)
  buffer.write(row.email, 36, 255)

  return buffer
}

const int = buffer => buffer.readUint32LE(0)

const str = (buffer, encoding, start, end = buffer.length) => {
  return buffer.slice(start, Math.min(buffer.indexOf('\x00', start), end)).toString(encoding)
}

const deserialize = buffer => {
  return {
    id: int(buffer),
    username: str(buffer, 'utf8', 4, 36),
    email: str(buffer, 'utf8', 36, ROW_SIZE),
  }
}

;(async () => {
  let fd = await fs.open(path.join(__dirname, './tree.db'), 'w+')
  let buffer = Buffer.alloc(PAGE_SIZE)
  let r

  initialize_leaf_node(buffer)

  const num_cells = LEAF_NODE_MAX_CELLS

  buffer.writeUint8(NodeType.NODE_LEAF, 0) /* node type */
  buffer.writeUint8(0, 1) /* is root */
  buffer.writeUint32LE(0, 2) /* parent pointer */
  buffer.writeUInt32LE(num_cells, 6) /* *num_cells */

  for (let i = 0; i < num_cells; i++) {
    const row = {
      id: i + 1,
      username: `user${i + 1}`,
      email: `user${i + 1}@qq.com`,
    }

    leaf_node_key(buffer, i).write(i + 1)
    leaf_node_value(buffer, i).write(serialize(row))
  }

  r = await fd.write(buffer, 0, PAGE_SIZE)

  assert(r.bytesWritten === PAGE_SIZE, `wrote ${r.bytesWritten} bytes`)

  await fd.sync()
  await fd.close()

  fd = await fs.open(path.join(__dirname, './tree.db'), 'r+')
  buffer = Buffer.alloc(PAGE_SIZE)

  r = await fd.read(buffer, 0, PAGE_SIZE, 0)

  assert(r.bytesRead === PAGE_SIZE, `read ${r.bytesRead} bytes`)

  const num_cells_ = leaf_node_num_cells(buffer).read()

  assert(buffer.readUint8(0) === NodeType.NODE_LEAF) /* node type */
  assert(buffer.readUint8(1) === 0) /* is root */
  assert(buffer.readUint32LE(2) === 0) /* parent pointer */
  assert(buffer.readUInt32LE(6) === num_cells) /* *num_cells */

  assert(num_cells_ === num_cells, `num_cells: ${num_cells_}`)

  for (let i = 0; i < num_cells_; i++) {
    const k = leaf_node_key(buffer, i).read()
    const v = leaf_node_value(buffer, i).read()

    const row = deserialize(v)

    assert(k === i + 1, `key ${k} is id ${k}`)
    assert(row.id === i + 1, `value ${row.id} is id ${i + 1}`)
    assert(row.username === `user${i + 1}`, `value ${row.username} is id user${i + 1}`)
    assert(row.email === `user${i + 1}@qq.com`, `value ${row.email} is id user${i + 1}@qq.com`)

    const kb = Buffer.alloc(4) /* uint32_t */
    kb.writeUint32LE(k, 0)

    assert.deepStrictEqual(leaf_node_cell(buffer, i).read(), Buffer.concat([kb, v]))
  }

  print_constants()
  print_leaf_node(buffer)

  await fd.close()

})()
