const cp = require('child_process')
const path = require('path');
const { promisify } = require('util')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

;(async () => {
  const repl = cp.exec(`node ${path.join(__dirname, './repl.js')}`)

  // wait for open fd
  await delay(500)

  const struct = (id) => {
    return { id, username: `user${id}`, email: `user${id}@qq.com` }
  }

  repl.stdout.on('data', console.log)
  repl.stderr.on('data', console.error)

  repl.on('close', () => process.exit(0))
  repl.on('error', () => process.exit(1))

  const shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }

    return arr
  }

  const records_len = 5000
  const prev_max = 5000

  const ids = shuffle(Array.from({ length: records_len }, (_, i) => prev_max + i + 1))

  for (let i = 0; i < records_len; i++) {
    const row = struct(ids[i])

    await promisify(repl.stdin.write).bind(repl.stdin)(`insert ${row.id} ${row.username} ${row.email}\n`)

    await delay(10)
  }

  await delay(100)

  // select
  await promisify(repl.stdin.write).bind(repl.stdin)(`select * from t where id >= 975 limit 50\n`)

  await delay(100)

  // btree
  await promisify(repl.stdin.write).bind(repl.stdin)(`btree\n`)

  await delay(500)

  // quit
  await promisify(repl.stdin.write).bind(repl.stdin)(`quit\n`)

  await delay(100)
  repl.kill()

})().catch(console.error)
