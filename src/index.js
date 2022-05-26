const path = require('path');
const fs = require('fs/promises')

;(async () => {
  const fd = await fs.open(path.join(__dirname, './fake.db'), 'r')

  let blocks = []
  let size = 0

  let r

  while (r = await fd.read(Buffer.alloc(1024) /* 1k */, 0, 1024, size), r.bytesRead > 0) {
    blocks.push(r.buffer)
    size += r.bytesRead
  }

  console.log('read:', blocks.length, 'blocks, contents:```\n')
  console.log(Buffer.concat(blocks).toString() || '<empty>', '\n```')

  await fd.close()
})()
