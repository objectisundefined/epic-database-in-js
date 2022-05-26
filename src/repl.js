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

const deserialize = buffer => {
  return {
    id: buffer.readUInt8(0),
    username: buffer.toString('utf8', 4, 36),
    email: buffer.toString('utf8', 36, ROW_SIZE),
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
    read: async (pn, buffer) => {
      assert(buffer.length % PAGE_SIZE === 0)

      const r = await fd.read(buffer, 0, buffer.length, pn * PAGE_SIZE)

      assert(r.bytesRead === buffer.length, `read ${r.bytesRead} bytes`)
    },
    write: async (pn, buffer) => {
      assert(buffer.length % PAGE_SIZE === 0)

      const r = await fd.write(buffer, 0, buffer.length, pn * PAGE_SIZE)

      assert(r.bytesWritten === buffer.length, `wrote ${r.bytesWritten} bytes`)
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

  const table = {
    num_rows: 1, /* todo: initialize */
    pages: [],
  }

  const row_slot = (tbl, row_num) => {
    const pn = Math.floor(row_num / ROWS_PER_PAGE)
    const offset = (row_num % ROWS_PER_PAGE) * ROW_SIZE

    if (!tbl.pages[pn]) {
      tbl.pages[pn] = Buffer.alloc(PAGE_SIZE)
    }

    return {
      pn,
      offset,
      buffer: tbl.pages[pn],
    }
  }

  const interface = rl.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  interface.write('> ')

  const db = connect(path.join(__dirname, './fake.db'))

  await db.open()

  const stat = await db.stat()

  table.num_rows = Math.floor(stat.size / PAGE_SIZE) * ROWS_PER_PAGE

  interface.on('line', async line => {
    interface.write('> ')

    if (line.includes('select')) {
      for (let i = 0; i < table.num_rows; i++) {
        const { pn, offset, buffer } = row_slot(table, i)

        console.log('read', pn, buffer)

        await db.read(pn, buffer)

        const row = deserialize(buffer.slice(offset, offset + ROW_SIZE))

        console.log(row)
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

      const row = serialize({ id, username, email })
      const { pn, offset, buffer } = row_slot(table, table.num_rows)

      console.log(row, row.length, row.toString())

      /* // Copy `buf1` bytes 16 through 19 into `buf2` starting at byte 8 of `buf2`.
       * buf1.copy(buf2, 8, 16, 20);
       * // This is equivalent to:
       * // buf2.set(buf1.subarray(16, 20), 8);
       * */
      buffer.set(row, offset)

      console.log(buffer, buffer.toString())

      await db.write(pn, buffer)

      table.num_rows += 1
    }

    if (line.includes('exit')) {
      await db.close()
      interface.close()
    }
  })
})()

/*
insert 1 cstack foo@bar.com
insert 2 voltorb volty@example.com

*/
