const cp = require('child_process')
const path = require('path');
const { promisify } = require('util')

const { LEAF_NODE_MAX_CELLS } = require('./b+-tree')

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

  for (let i = 0; i < 2 * LEAF_NODE_MAX_CELLS - 1; i++) {
    const row = struct(i + 1)

    await promisify(repl.stdin.write).bind(repl.stdin)(`insert ${row.id} ${row.username} ${row.email}\n`)

    await delay(200)
  }

  await delay(200)

  // select
  await promisify(repl.stdin.write).bind(repl.stdin)(`select\n`)

  await delay(500)

  // btree
  await promisify(repl.stdin.write).bind(repl.stdin)(`btree\n`)

  await delay(500)

  // constants
  await promisify(repl.stdin.write).bind(repl.stdin)(`constants\n`)

  await delay(500)

  // exit
  await promisify(repl.stdin.write).bind(repl.stdin)(`exit\n`)

  await delay(100)
  repl.kill()

})().catch(console.error)
