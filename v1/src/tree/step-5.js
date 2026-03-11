
const Order = {
  Leaf: 5,
  Node: 3,
}

let no = 1
const pages = []

// key was max key of child node which link pointing to
const NodeT = ({ parent, links, keys }) => (pages[no] = {
  no: no++,
  type: 'Node',
  parent,
  links,
  keys,
  size: keys.length
})
// if don't record max key, then don't need to replace, `*, k1, *, k2, *`

const LeafT = ({ parent, keys, values, next }) => (pages[no] = {
  no: no++,
  type: 'Leaf',
  parent,
  keys,
  values,
  size: keys.length,
  next,
})

const Insert = (node, key, value, root = node) => {
  if (node === null) {
    return pages[0] = LeafT({
      parent: -1,
      keys: [key],
      values: [value],
      size: 1,
      next: -1,
    })
  }

  if (node.type === 'Leaf') {
    const i = binarySearch(node.keys, key)

    node.keys.splice(i, 0, key)
    node.values.splice(i, 0, value)

    node.size += 1

    if (node.size <= Order.Leaf) {
      return root
    }

    return Split(node, root)
  } else {
    const { pn } = FindKey(node, key)

    return Insert(pages[pn], key, value, root)
  }
}

const Shift = (node, key, link, root) => {
  // node must be Node and key was lower than node max key

  const i = binarySearch(node.keys, key)

  node.keys.splice(i, 0, key)
  node.links.splice(i, 0, link)

  node.size += 1

  if (node.size <= Order.Node) {
    return root
  }

  return Split(node, root)
}

const Split = (node, root) => {
  // case: skip l + 1, r should >= l
  const r = ~~((node.keys.length + 1) / 2)
  const l = node.keys.length - r

  if (node.type === 'Leaf') {
    const node_ = pages[node.parent] || NodeT({
      parent: -1,
      links: [],
      keys: []
    })

    const left = LeafT({
      parent: node_.no,
      keys: node.keys.slice(0, l),
      values: node.values.slice(0, l),
      next: node.no,
    })

    // modified in place
    const right = node

    right.keys = node.keys.slice(l)
    right.values = node.values.slice(l)
    right.size = right.keys.length

    if (node.parent >= 0) {
      // update prev's next link
      node_.links.forEach((n, i) => i > 0 && n === node.no && (pages[node_.links[i - 1]].next = left.no))

      // index on left, node was modified
      return Shift(pages[node.parent], left.keys[l - 1], left.no, root)
    } else {
      node.parent = node_.no

      node_.links = [left.no, right.no]
      node_.keys = [left.keys.slice(-1)[0]]
      node_.size = 1

      pages[0] = node_

      return node_
    }
  }

  if (node.type === 'Node') {
    const node_ = pages[node.parent] || NodeT({
      parent: -1,
      links: [],
      keys: []
    })

    const left = NodeT({
      parent: node_.no,
      keys: node.keys.slice(0, l),
      links: node.links.slice(0, l + 1),
    })

    // update parent
    left.links.forEach((n) => { pages[n].parent = left.no })

    // modified in place
    const right = node

    node.keys = node.keys.slice(l + 1) // skip left max, because left max key was ignored, we just need *
    node.links = node.links.slice(l + 1)
    right.size = right.keys.length

    if (node.parent >= 0) {
      // update prev's next link
      node_.links.forEach((n, i) => i > 0 && n === node.no && (pages[node_.links[i - 1]].next = left.no))

      // index on left, node was modified
      return Shift(pages[node.parent], left.keys[l - 1], left.no, root)
    } else {
      node.parent = node_.no

      node_.links = [left.no, right.no]
      node_.keys = [left.keys.slice(-1)[0]]
      node_.size = 1

      pages[0] = node_

      return node_
    }
  }

}

const Inspect = (root, level = 0) => {
  if (root.type === 'Leaf') {
    console.log(`Leaf #${String(root.no).padEnd(2, ' ')}: ${root.keys.slice(0, root.size).map((k, i) => `${k}=${root.values[i]}`).join(' ')} -- ${level}`)
  } else { 
    console.log(`Node #${String(root.no).padEnd(2, ' ')}: ${root.keys} - ${level}`)

    root.links.forEach((n) => Inspect(pages[n], level + 1))
  }
}

const FindKey = (node, key) => {
  while (node.type === 'Node') {
    i = binarySearch(node.keys, key)

    if (i > 0) {
      let l = pages[node.links[i - 1]]

      while (l.type === 'Node') {
        l = pages[l.links[l.size]]
      }

      if (l.keys[l.size - 1] >= key) {
        node = pages[node.links[i - 1]]

        continue
      }
    }

    node = pages[node.links[i]]
  }

  return {
    pn: node.no,
    col: binarySearch(node.keys, key),
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

const Search = (node, cond) => {
  // { eq: <val> }
  // { lte: <start>, gte: <end> }
  // { gte: <start>, limit: <n> } _
  // { lte: <start>, limit: <n> }

  const { pn, col } = FindKey(node, cond.lte)

  node = pages[pn]
  let i = col

  const r = []

  while (true) {
    if (r.length >= cond.limit || !node) {
      break
    }

    if (i === node.values.length) {
      i = 0
      node = node.next >= 0 ? pages[node.next] : null
    } else {
      r.push({ key: node.keys[i], value: node.values[i] })

      i++
    }
  }

  return r
}

// test
;(() => {
  console.log(
    binarySearch([59, 97], 16)
  )

  let root = null

  // root = Insert(root, 1, 1)
  // root = Insert(root, 2, 2)
  // root = Insert(root, 3, 3)
  // root = Insert(root, 4, 4)
  // root = Insert(root, 5, 5)
  // root = Insert(root, 6, 6)
  // root = Insert(root, 7, 7)
  // root = Insert(root, 8, 8)
  // root = Insert(root, 9, 9)
  // root = Insert(root, 10, 10)
  // root = Insert(root, 11, 11)
  // root = Insert(root, 12, 12)
  // root = Insert(root, 13, 13)
  // root = Insert(root, 14, 14)
  // root = Insert(root, 15, 15)
  // root = Insert(root, 16, 16)
  // root = Insert(root, 17, 17)
  // root = Insert(root, 18, 18)
  // root = Insert(root, 19, 19)
  // root = Insert(root, 20, 20)
  // root = Insert(root, 21, 21)
  // root = Insert(root, 22, 22)
  // root = Insert(root, 23, 23)
  // root = Insert(root, 24, 24)
  // root = Insert(root, 25, 25)
  // root = Insert(root, 26, 26)
  // root = Insert(root, 27, 27)
  // root = Insert(root, 28, 28)
  // root = Insert(root, 29, 29)

  const arr = [
    23,  6, 24, 25,  7,  1, 21, 11, 30,
    17, 20, 29, 10,  5,  2, 13, 22, 14,
     3, 18,  4,  8, 26, 12, 27, 19, 16,
     9, 15, 28
  ]

  for (let i = 0; i < 30; i++) {
    root = Insert(root, arr[i], arr[i])
  }

  if (root !== pages[0]) {
    throw Error('root should be saved on page 0')
  }

  Inspect(pages[0])

  console.log(
    Search(pages[0], { lte: -1, limit: 11 })
  )

  // console.log(pages)

})()

// step 4
// fix incorrect key order when inserting random
// fix incorrect start pos in search
