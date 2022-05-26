const path = require('path')
const fs = require('fs/promises')

const assert = require('assert')

const ROW_SIZE =
  8 + /* id	integer */
  32 + /* username	varchar(32) */
  255 /* email	varchar(255) */

const PAGE_SIZE = 1024 /* 1kb */
const ROWS_PER_PAGE = Math.floor(PAGE_SIZE / ROW_SIZE)

// const TABLE_MAX_PAGES = 100
// const TABLE_MAX_ROWS = TABLE_MAX_PAGES * ROW_SIZE

const serialize = row => {
  const buffer = Buffer.alloc(ROW_SIZE)

  buffer.writeUInt8(row.id, 0)
  buffer.write(row.username, 4, 32)
  buffer.write(row.email, 36, 255)

  return buffer
}

const int = buffer => buffer.readUInt8(0)

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

  const row_slot = (/* mutable */ pages, /* row number */ rn) => {
    const pn = Math.floor(rn / ROWS_PER_PAGE)
    const offset = (rn % ROWS_PER_PAGE) * ROW_SIZE

    if (!pages[pn]) {
      pages[pn] = Buffer.alloc(PAGE_SIZE)
    }

    return {
      pn,
      offset,
      buffer: pages[pn],
    }
  }

  const table_open = async (db) => {
    const pager = {
      pages: [],
      slot(rn) {
        return row_slot(this.pages, rn)
      }
    }

    const table = {
      num_rows: 0,
      pager,
    }

    const stat = await db.stat()
    
    // initialize table rows count
    table.num_rows = Math.floor(stat.size / PAGE_SIZE) * ROWS_PER_PAGE + (stat.size % PAGE_SIZE) / ROW_SIZE

    return table
  }

  const create_cursor = (table, end) => {
    return {
      table,
      row_num: end ? table.num_rows : 0,
      end_of_table: end || table.num_rows === 0,
      value() {
        return table.pager.slot(this.row_num)
      },
      advance() {
        if (this.end_of_table) {
          return this
        }
    
        this.row_num++
    
        if (this.row_num === this.table.num_rows) {
          this.end_of_table = true
        }
    
        return this
      },
      back() {
        if (this.row_num === 0) {
          return this
        }
    
        this.row_num--

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
        const { pn, offset, buffer } = cursor.value()

        console.log('read', pn, offset, buffer)

        await db.read(pn, buffer, ((cursor.row_num + 1) % ROWS_PER_PAGE) * ROW_SIZE)

        const row = deserialize(buffer.slice(offset, offset + ROW_SIZE))

        console.log(row)

        cursor.advance()
      }
    }

    if (line.includes('insert')) {
      const cursor = table_end(table)

      /*
      column	type
      id	integer
      username	varchar(32)
      email	varchar(255)
      */
     const [, id, username, email]  = line.match(/insert\s+(\d+)\s+(\w+)\s+(.*)/)

      const row = serialize({ id, username, email })
      const { pn, offset, buffer } = cursor.value()

      console.log('write', pn, offset, buffer)

      /* // Copy `buf1` bytes 16 through 19 into `buf2` starting at byte 8 of `buf2`.
       * buf1.copy(buf2, 8, 16, 20);
       * // This is equivalent to:
       * // buf2.set(buf1.subarray(16, 20), 8);
       * */
      buffer.set(row, offset)

      await db.write(pn, buffer, ((cursor.row_num + 1) % ROWS_PER_PAGE) * ROW_SIZE)

      table.num_rows += 1
    }

    if (line.includes('exit')) {
      await db.close()
      interface.close()
    }
  })
})()
