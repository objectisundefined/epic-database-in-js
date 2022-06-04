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
  leaf_node_insert,
  leaf_node_find,
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

  const pager = {
    pages: [],
    num_pages: 0,
    async page(pn) {
      if (this.pages[pn] === undefined) {
        this.pages[pn] = Buffer.alloc(PAGE_SIZE)

        if (pn < this.num_pages) {
          const r = await fd.read(this.pages[pn], 0, PAGE_SIZE, PAGE_SIZE * pn)
          assert(r.bytesRead === PAGE_SIZE, `read ${r.bytesRead} bytes`)
        }
      }

      if (pn >= this.num_pages) {
        this.num_pages = pn + 1
      }

      return this.pages[pn]
    },
    async flush(pn) {
      const r = await fd.write(this.pages[pn], 0, PAGE_SIZE, PAGE_SIZE * pn)

      assert(r.bytesWritten === PAGE_SIZE, `wrote ${r.bytesWritten} bytes`)
    }
  }

  const table = {
    root_page_num: 0,
    pager,
  }

  initialize_leaf_node(await pager.page(0), 1)

  const len = LEAF_NODE_MAX_CELLS + 1

  for (let i = 0; i < len; i++) {
    const row = {
      id: i + 1,
      username: `user${i + 1}`,
      email: `user${i + 1}@qq.com`,
    }

    const cell = leaf_node_find(await pager.page(table.root_page_num), i + 1)

    await leaf_node_insert(await pager.page(0), cell, row.id, serialize(row), table)
  }

  for (let i = 0; i < pager.num_pages; i++) {
    await pager.flush(i)

    console.log('write', [...pager.pages[i].slice(0, 50)])
  }

  await fd.sync()
  await fd.close()

  fd = await fs.open(path.join(__dirname, './tree.db'), 'r+')

  pager.pages = []

  for (let i = 0; i < pager.num_pages; i++) {
    await pager.page(i)

    console.log('read', [...pager.pages[i].slice(0, 50)])
  }

  const root = pager.pages[table.root_page_num]

  assert(root.readUint8(0) === NodeType.NODE_INTERNAL) /* node type */
  assert(root.readUint8(1) === 1) /* is root */
  assert(root.readUint32LE(2) === 0) /* parent pointer */
  assert(root.readUInt32LE(6) === 1) /* *num_keys */
  assert(root.readUInt32LE(10) === 1) /* right_child_pointer */
  assert(root.readUInt32LE(14) === 2) /* child_pointer 0 */
  assert(root.readUInt32LE(18) === 2) /* child_key 0 */

  const buffer = pager.pages[1]
  const j = 3

  const num_cells_ = leaf_node_num_cells(buffer).read()

  assert(buffer.readUint8(0) === NodeType.NODE_LEAF) /* node type */
  assert(buffer.readUint8(1) === 0) /* is root */
  assert(buffer.readUint32LE(2) === 0) /* parent pointer */
  assert(buffer.readUInt32LE(6) === 2) /* *num_cells */

  for (let i = 0; i < num_cells_; i++) {
    const k = leaf_node_key(buffer, i).read()
    const v = leaf_node_value(buffer, i).read()

    const row = deserialize(v)

    console.log(row)

    assert(k === i + j, `key ${k} is id ${i + j}`)
    assert(row.id === i + j, `value ${row.id} is id ${i + j}`)
    assert(row.username === `user${i + j}`, `value ${row.username} is id user${i + j}`)
    assert(row.email === `user${i + j}@qq.com`, `value ${row.email} is id user${i + j}@qq.com`)

    const kb = Buffer.alloc(4) /* uint32_t */
    kb.writeUint32LE(k, 0)

    assert.deepStrictEqual(leaf_node_cell(buffer, i).read(), Buffer.concat([kb, v]))
  }

  print_constants()

  await fd.close()

})()
