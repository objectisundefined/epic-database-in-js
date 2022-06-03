const { promisify } = require('util')
const path = require('path');
const cp = require('child_process')

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

;(async () => {
  const repl = cp.exec(`node ${path.join(__dirname, './repl.js')}`)

  // wait for open fd
  await delay(500)

  const struct = (id) => {
    return { id, username: `user${id}`, email: `user${id}@qq.com` }
  }

  repl.stdout.on('data', console.log)

  repl.on('close', () => process.exit(0))
  repl.on('error', () => process.exit(1))

  for (let i = 0; i < 50; i++) {
    const row = struct(i + 1)

    await promisify(repl.stdin.write).bind(repl.stdin)(`insert ${row.id} ${row.username} ${row.email}\n`)

    await delay(200)
  }

  await delay(200)

  console.log('select')
  await promisify(repl.stdin.write).bind(repl.stdin)(`select\n`)

  await delay(500)

  console.log('exit')
  await promisify(repl.stdin.write).bind(repl.stdin)(`exit\n`)

  await delay(100)
  repl.kill()

})().catch(console.error)
