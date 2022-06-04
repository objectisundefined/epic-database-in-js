const path = require('path')
const fs = require('fs/promises')

const assert = require('assert')
const { ROW_SIZE, PAGE_SIZE, leaf_node_num_cells, leaf_node_cell, initialize_leaf_node, leaf_node_value, leaf_node_insert, node_type, NodeType, leaf_node_find, leaf_node_key, print_constants, print_tree, internal_node_find, leaf_node_next_leaf } = require('./b+-tree')

const serialize = row => {
  const buffer = Buffer.alloc(ROW_SIZE)

  buffer.writeUInt32LE(row.id, 0)
  buffer.write(row.username, 4, 32)
  buffer.write(row.email, 36, 255)

  return buffer
}

const int = buffer => buffer.readUInt32LE(0)

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

const connect = ((path) => {
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
        ? assert(buffer.length % PAGE_SIZE === 0, `buffer length ${buffer.length}`)
        : assert(size % ROW_SIZE === 0, `size ${size}`)

      const r = await fd.read(buffer, 0, size, pn * PAGE_SIZE)

      assert(r.bytesRead === size, `read ${r.bytesRead} bytes`)
    },
    write: async (pn, buffer, size = buffer.length) => {
      // case: last page was not full.
      size === buffer.length
        ? assert(buffer.length % PAGE_SIZE === 0, `buffer length ${buffer.length}`)
        : assert(size % ROW_SIZE === 0, `size ${size}`)

      const r = await fd.write(buffer, 0, size, pn * PAGE_SIZE)

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

;(async () => {
  const rl = require('readline')

  const table_open = async (db) => {
    await db.open()

    const stat = await db.stat()

    assert(stat.size % PAGE_SIZE === 0, `size ${stat.size}`)

    const pager = {
      pages: [],
      num_pages: stat.size / PAGE_SIZE, // initialize table pages count
      async page(pn) {
        if (this.pages[pn] === undefined) {
          this.pages[pn] = Buffer.alloc(PAGE_SIZE)

          if (pn < stat.size / PAGE_SIZE) {
            await db.read(pn, this.pages[pn], PAGE_SIZE)
          }
        }

        if (pn >= this.num_pages) {
          this.num_pages = pn + 1
        }

        return this.pages[pn]
      },
      async flush(pn) {
        await db.write(pn, this.pages[pn])
      }
    }

    const table = {
      root_page_num: 0,
      pager,
      async find(key) {
        const buffer = await this.pager.page(this.root_page_num)

        if (node_type(buffer).read() === NodeType.NODE_LEAF) {
          const { pn, cell } = leaf_node_find(buffer, this.root_page_num, key)
          return table_pos(this, pn, cell)
        } else {
          const { pn, cell } = await internal_node_find(buffer, key, pager)
          return table_pos(this, pn, cell)
        }
      },
      async close() {
        for (let i = 0; i < table.pager.num_pages; i++) {
          if (table.pager.pages[i] === undefined) {
            continue
          }

          await table.pager.flush(i)
        }

        await db.close()
      }
    }

    if (pager.num_pages === 0) {
      // initialize root
      initialize_leaf_node(await pager.page(0), true /* root */)
    }

    return table
  }

  const create_cursor = async (table, pn, end) => {
    const buffer = await table.pager.page(pn)
    const num_cells = leaf_node_num_cells(buffer).read()

    return {
      table,
      page_num: pn,
      cell_num: end ? num_cells : 0,
      end_of_table: end || num_cells === 0,
      async page() {
        return table.pager.page(this.page_num)
      },
      async flush() {
        return table.pager.flush(this.page_num)
      },
      async advance() {
        if (this.end_of_table) {
          return
        }

        this.cell_num++

        if (this.cell_num >= leaf_node_num_cells(await this.page()).read()) {
          const next_page_num = leaf_node_next_leaf(await this.page()).read()

          if (next_page_num === 0) {
            this.end_of_table = true // This was rightmost leaf
          } else {
            this.page_num = next_page_num
            this.cell_num = 0
          }
        }

        return this
      },
    }
  }

  const table_start = async (table) => {
    // read from the first leaf node page
    return table.find(0)
  }

  const table_pos = async (table, pn, pos) => {
    const cursor = await create_cursor(table, pn, false)
    cursor.cell_num = pos

    return cursor
  }

  const interface = rl.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  interface.write('> ')

  const db = connect(path.join(__dirname, './fake.db'))

  const table = await table_open(db)

  interface.on('line', async line => {
    interface.write('> ')

    if (line.includes('select')) {
      const cursor = await table_start(table)

      // optimize: read by page and then by tail rows
      while (!cursor.end_of_table) {
        const buffer = await cursor.page()
        const pn = cursor.page_num

        const row = deserialize(leaf_node_value(buffer, cursor.cell_num).read())

        console.log('read', pn, leaf_node_value(buffer, cursor.cell_num).read())
        console.log(row)

        await cursor.advance()
      }
    }

    if (line.includes('insert')) {
      /*
      column	type
      id	integer
      username	varchar(32)
      email	varchar(255)
      */
      const [, id, username, email]  = line.match(/insert\s+(\d+)\s+(\w+)\s+(.*)/)

      const cursor = await table.find(+id)

      const buffer = await cursor.page()

      if (cursor.cell_num < leaf_node_num_cells(buffer).read()) {
        const key = leaf_node_key(buffer, cursor.cell_num).read()

        if (key === +id) {
          throw Error('duplicate key')
        }
      }

      const row = serialize({ id: +id, username, email })

      await leaf_node_insert(buffer, cursor.cell_num, +id, row, table)

      {
        // read from inserted cell
        const cursor = await table.find(+id)
        console.log('write', cursor.page_num, leaf_node_value(await cursor.page(), cursor.cell_num).read(), deserialize(leaf_node_value(await cursor.page(), cursor.cell_num).read()))
      }
    }

    if (line.includes('constants')) {
      print_constants()
    }

    if (line.includes('btree')) {
      await print_tree(table.pager, table.root_page_num, 0)
    }

    if (line.includes('exit')) {
      await table.close()
      interface.close()
    }
  })
})()
