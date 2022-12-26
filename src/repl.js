const rl = require('readline')

const { RowSize, MaxNodeSize, MaxLeafSize, connectDB, createPager } = require('./persistent')

const serializeRow = row => {
  const buffer = Buffer.alloc(RowSize)

  buffer.writeUInt32LE(row.id, 0)
  buffer.write(row.username, 4, 32)
  buffer.write(row.email, 36, 255)

  return buffer
}

const int = buffer => buffer.readUInt32LE(0)

const str = (buffer, encoding, start, end = buffer.length) => {
  return buffer.subarray(start, Math.min(buffer.indexOf('\x00', start), end)).toString(encoding)
}

const deserializeRow = buffer => {
  return {
    id: int(buffer),
    username: str(buffer, 'utf8', 4, 36),
    email: str(buffer, 'utf8', 36, RowSize),
  }
}

const Order = {
  Leaf: MaxLeafSize,
  Node: MaxNodeSize
}

// key was max key of child node which link pointing to
const NodeT = ({ no, parent, links, keys }) => ({
  no,
  type: 'Node',
  parent,
  links,
  keys,
  size: keys.length
})
// if don't record max key, then don't need to replace, `*, k1, *, k2, *`

const LeafT = ({ no, parent, keys, values, next }) => ({
  no,
  type: 'Leaf',
  parent,
  keys,
  values,
  size: keys.length,
  next,
})

const Insert = async (node, key, value, pager) => {
  if (node === null) {
    node = LeafT({
      no: pager.no++,
      parent: 0,
      keys: [key],
      values: [value],
      size: 1,
      next: 0,
    })

    pager.pages[0] = pager.pages[node.no] = node

    return node
  }

  if (node.type === 'Leaf') {
    const i = binarySearch(node.keys, key)

    node.keys.splice(i, 0, key)
    node.values.splice(i, 0, value)

    node.size += 1

    if (node.size <= Order.Leaf) {
      return await pager.page(0)
    }

    return Split(node, pager)
  } else {
    const { pn, } = await FindKey(pager, key)

    return await Insert(await pager.page(pn), key, value, pager)
  }
}

const Shift = async (node, key, link, pager) => {
  // node must be Node and key was lower than node max key

  const i = binarySearch(node.keys, key)

  node.keys.splice(i, 0, key)
  node.links.splice(i, 0, link)

  node.size += 1

  if (node.size <= Order.Node) {
    return await pager.page(0)
  }

  return await Split(node, pager)
}

const Split = async (node, pager) => {
  // case: skip l + 1, r should >= l
  const r = ~~((node.keys.length + 1) / 2)
  const l = node.keys.length - r

  if (node.type === 'Leaf') {
    const node_ = node.parent > 0 ? await pager.page(node.parent) : NodeT({
      no: pager.no++,
      parent: 0,
      links: [],
      keys: []
    })

    const left = LeafT({
      no: pager.no++,
      parent: node_.no,
      keys: node.keys.slice(0, l),
      values: node.values.slice(0, l),
      next: node.no,
    })

    pager.pages[left.no] = left

    // modified in place
    const right = node

    right.keys = node.keys.slice(l)
    right.values = node.values.slice(l)
    right.size = right.keys.length

    if (node.parent > 0) {
      // update prev's next link
      for (let [i, l] of node_.links.entries()) {
        i > 0 && l === node.no && ((await pager.page(node_.links[i - 1])).next = left.no)
      }

      // index on left, node was modified
      return await Shift(node_, left.keys[l - 1], left.no, pager)
    } else {
      node.parent = node_.no

      node_.links = [left.no, right.no]
      node_.keys = [left.keys.slice(-1)[0]]
      node_.size = 1

      pager.pages[0] = pager.pages[node_.no] = node_

      return node_
    }
  }

  if (node.type === 'Node') {
    const node_ = node.parent > 0 ? await pager.page(node.parent) : NodeT({
      no: pager.no++,
      parent: 0,
      links: [],
      keys: []
    })

    const left = NodeT({
      no: pager.no++,
      parent: node_.no,
      keys: node.keys.slice(0, l),
      links: node.links.slice(0, l + 1),
    })

    pager.pages[left.no] = left

    // update parent
    for (let l of left.links) {
      (await pager.page(l)).parent = left.no
    }

    // modified in place
    const right = node

    node.keys = node.keys.slice(l + 1) // skip left max, because left max key was ignored, we just need *
    node.links = node.links.slice(l + 1)
    right.size = right.keys.length

    if (node.parent > 0) {
      // update prev's next link
      for (let [i, l] of node_.links.entries()) {
        i > 0 && l === node.no && ((await pager.page(node_.links[i - 1])).next = left.no)
      }

      // index on left, node was modified
      return await Shift(node_, left.keys[l - 1], left.no, pager)
    } else {
      node.parent = node_.no

      node_.links = [left.no, right.no]
      node_.keys = [left.keys.slice(-1)[0]]
      node_.size = 1

      pager.pages[0] = pager.pages[node_.no] = node_

      return node_
    }
  }

}

const FindKey = async (pager, key) => {
  let node = await pager.page(0)

  while (node.type === 'Node') {
    i = binarySearch(node.keys, key)

    if (i > 0) {
      let l = await pager.page(node.links[i - 1])

      while (l.type === 'Node') {
        l = await pager.page(l.links[l.size])
      }

      if (l.keys[l.size - 1] >= key) {
        node = await pager.page(node.links[i - 1])

        continue
      }
    }

    node = await pager.page(node.links[i])
  }

  return {
    pn: node.no,
    col: binarySearch(node.keys, key),
  }
}

const Inspect = async (root, pager, level = 0) => {
  if (root.type === 'Leaf') {
    console.log(`Leaf #${String(root.no).padEnd(2, ' ')}: ${root.keys.slice(0, root.size).map((k, i) => `${k}=${JSON.stringify(root.values[i])}`).join(' ')} -- ${level}`)
  } else { 
    console.log(`Node #${String(root.no).padEnd(2, ' ')}: ${root.keys} - ${level}`)

    for (let l of root.links) {
      await Inspect(await pager.page(l), pager, level + 1)
    }
  }
}

const binarySearch = (keys, key) => {
  let i = 0
  let j = keys.length - 1

  while (i <= j) {
    const k = ~~((i + j) / 2)

    if (keys[k] < key) {
      i = k + 1
    } else if (keys[k] > key) {
      j = k - 1
    } else {
      return k
    }
  }

  return i
}

const FindMax = async (pager) => {
  let node = await pager.page(0)

  while (node.type === 'Node') {
    node = await pager.page(node.links[node.size])
  }

  return node.keys[node.size - 1]
}

const Search = async (pager, cond) => {
  // { eq: <val> }
  // { lte: <start>, gte: <end> }
  // { gte: <start>, limit: <n> } ✔️
  // { lte: <start>, limit: <n> }

  const { pn, col } = await FindKey(pager, cond.lte)

  let node = await pager.page(pn)
  let i = col

  const r = []

  while (true) {
    if (r.length >= cond.limit || !node) {
      break
    }

    if (i === node.values.length) {
      i = 0
      node = node.next > 0 ? await pager.page(node.next) : null
    } else {
      r.push(node.values[i])

      i++
    }
  }

  return r
}

;(async () => {
  const db = await connectDB('./test.db')
  await db.open()

  const pager = await createPager(db, {
    serialize: serializeRow,
    deserialize: deserializeRow,
  })

  const Append = async (n) => {
    const size = pager.no === 1 ? 0 : pager.no

    let root = null

    if (size > 1) {
      root = await pager.page(0)
    }

    const max = size > 1 ? await FindMax(pager) : 0
    console.log(`max = `, max)

    for (let i = max; i < max + n; i++) {
      root = await Insert(root, i + 1, { id: i + 1, username: `u${i + 1}`, email: `u${i + 1}@qq.com` }, pager)
    }

    await Inspect(pager.pages[0], pager)

    const cond = { lte: max - n, limit: n * 2 }

    console.log(
      cond, await Search(pager, cond)
    )

    console.log(pager.pages)

    await pager.flush()
  }

  pager.no === 1 && await Append(50) // initialize

  const interface = rl.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  interface.write('> ')

  interface.on('line', async line => {
    interface.write('> ')

    if (line.includes('select')) {
      const [, lte, limit] = line.match(/where id >= (\d+) limit (\d+)/)

      console.log(await Search(pager, { lte: +lte, limit: +limit }))
    }

    if (line.includes('insert')) {
      /*
      column	type
      id	integer
      username	varchar(32)
      email	varchar(255)
      */
      const [, id, username, email] = line.match(/insert\s+(\d+)\s+(\w+)\s+(.*)/)

      const { pn, col } = await FindKey(pager, +id)

      if ((await pager.page(pn)).keys[col] === +id) {
        console.error(`duplicate key: ${id}`)

        return
      }

      await Insert(await pager.page(0), +id, { id: +id, username, email }, pager)

      {
        // read from inserted col
        const { pn, col } = await FindKey(pager, +id)

        console.log((await pager.page(pn)).values[col])
      }
    }

    if (line.includes('btree')) {
      await Inspect(await pager.page(0), pager)
    }

    if (line.includes('quit')) {
      await pager.flush()

      interface.close()
    }
  })

})()
