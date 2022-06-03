const path = require('path')
const fs = require('fs/promises')

const assert = require('assert')
const { ROW_SIZE, PAGE_SIZE, leaf_node_num_cells, leaf_node_cell, initialize_leaf_node, leaf_node_value, leaf_node_insert } = require('./b+-tree')

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
    const pager = {
      pages: [],
      num_pages: 0,
      page(pn) {
        return this.pages[pn] || (this.pages[pn] = Buffer.alloc(PAGE_SIZE))
      }
    }

    const table = {
      root_page_num: 0,
      pager,
    }

    const stat = await db.stat()

    assert(stat.size % PAGE_SIZE === 0, `size ${stat.size}`)

    // initialize table pages count
    table.num_pages = stat.size / PAGE_SIZE

    if (table.num_pages === 0) {
      const root = table.pager.page(0)
      initialize_leaf_node(root, 0)
    }

    return table
  }

  const create_cursor = (table, end) => {
    const root = table.pager.page(table.root_page_num)
    const num_cells = leaf_node_num_cells(root)

    return {
      table,
      page_num: table.root_page_num,
      cell_num: end ? num_cells : 0,
      end_of_table: end || num_cells === 0,
      page() {
        return table.pager.page(this.page_num)
      },
      cell() {
        return leaf_node_cell(this.page(), this.cell_num)
      },
      advance() {
        if (!this.end_of_table) {
          this.cell_num++
    
          if (this.cell_num === leaf_node_num_cells(this.page()).read()) {
            this.end_of_table = true
          }
        }

        return this
      },
      back() {
        if (this.cell_num > 0) {
          this.cell_num--
        }

        return this
      }
    }
  }

  const table_start = (table) => {
    return create_cursor(table, false)
  }

  const table_end = (table) => {
    return create_cursor(table, true)
  }

  const interface = rl.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  interface.write('> ')

  const db = connect(path.join(__dirname, './fake.db'))

  await db.open()

  const table = await table_open(db)

  interface.on('line', async line => {
    interface.write('> ')

    if (line.includes('select')) {
      const cursor = table_start(table)

      // optimize: read by page and then by tail rows
      while (!cursor.end_of_table) {
        const buffer = cursor.page()
        const pn = cursor.page_num

        await db.read(pn, buffer, PAGE_SIZE)

        console.log('read', pn, leaf_node_value(buffer, cursor.cell_num).read())

        const row = deserialize(leaf_node_value(buffer, cursor.cell_num).read())

        console.log(row)

        cursor.advance()
      }
    }

    if (line.includes('insert')) {
      const cursor = table_end(table)
      const pn = cursor.page_num

      /*
      column	type
      id	integer
      username	varchar(32)
      email	varchar(255)
      */
      const [, id, username, email]  = line.match(/insert\s+(\d+)\s+(\w+)\s+(.*)/)

      const row = serialize({ id, username, email })
      const buffer = cursor.page()

      leaf_node_insert(buffer, cursor.cell_num, id, row)

      console.log('write', pn, leaf_node_value(buffer, cursor.cell_num).read())

      await db.write(pn, buffer, PAGE_SIZE)
    }

    if (line.includes('exit')) {
      await db.close()
      interface.close()
    }
  })
})()
