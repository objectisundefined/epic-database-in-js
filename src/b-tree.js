// modified on https://gist.github.com/marcin-chwedczuk/105b9e2c99e3ba48d4e1cd51f2a35907

function arrayOfSize(size) {
  var a = Array(size)

  for (var i = 0; i < size; i += 1) a[i] = null

  return a
}

function BTreeNode(order) {
  this.KEYS_NUM = order

  this._keyCount = 0
  this._keys = arrayOfSize(this.KEYS_NUM)
  this._pointers = arrayOfSize(this.KEYS_NUM + 1)
  this._data = arrayOfSize(this.KEYS_NUM)
}

BTreeNode.prototype.isLeaf = function () {
  return this._pointers[0] === null
}

BTreeNode.prototype.isFull = function () {
  return this._keyCount === this.KEYS_NUM
}

BTreeNode.prototype.keyCount = function () {
  return this._keyCount
}

BTreeNode.prototype.add = function (key, value) {
  if (this.isLeaf()) {
    if (this.isFull()) {
      return this.split(key, value, null)
    } else {
      this.insertKey(key, value)
      return null
    }
  } else {
    var child = this.getChildContaining(key)

    var split = child.add(key, value)
    if (!split) return null

    if (this.isFull()) {
      // split this node
      return this.split(split.key, split.value, split.right)
    } else {
      this.insertSplit(split)
      return null
    }
  }
}

BTreeNode.prototype.insertKey = function (key, value) {
  // perform insertion sort on keys

  var pos = this.keyCount()
  var keys = this._keys
  const data = this._data

  while (pos > 0 && keys[pos - 1] > key) {
    keys[pos] = keys[pos - 1]
    data[pos] = data[pos - 1]
    pos--
  }

  keys[pos] = key
  data[pos] = value
  this._keyCount += 1
}

BTreeNode.prototype.insertSplit = function (split) {
  // splited child
  var child = split.left

  // insert key with right child poped up from
  // child node

  // case A: first child was split
  if (child === this._pointers[0]) {
    for (var i = this._keyCount; i > 0; i--) {
      this._keys[i] = this._keys[i - 1]
      this._data[i] = this._data[i - 1]
    }

    this._keys[0] = split.key
    this._data[0] = split.value

    for (var i = this._keyCount + 1; i > 1; i--)
      this._pointers[i] = this._pointers[i - 1]
    this._pointers[0] = child
    this._pointers[1] = split.right
  }

  // case B: [key][split-child] (split child is on the right)
  else {
    var pos = this._keyCount
    while (pos > 0 && this._pointers[pos] !== child) {
      this._keys[pos] = this._keys[pos - 1]
      this._data[pos] = this._data[pos - 1]
      this._pointers[pos + 1] = this._pointers[pos]
      pos--
    }

    this._keys[pos] = split.key
    this._data[pos] = split.value
    this._pointers[pos + 1] = split.right
  }

  // rest
  this._keyCount += 1
}

BTreeNode.prototype.getChildContaining = function (key) {
  for (var i = 0; i < this.keyCount(); i += 1) {
    if (key <= this._keys[i]) {
      return this._pointers[i]
    }
  }

  return this._pointers[this.keyCount()]
}

BTreeNode.prototype.split = function (key, value, keyRightChild) {
  var left = this
  var right = new BTreeNode(this.KEYS_NUM)

  // temp storage for keys and childs
  var keys = this._keys.slice()
  keys.push(null)

  var childs = this._pointers.slice()
  childs.push(null)

  var data = this._data.slice()
  data.push(null)

  // find new key position
  var pos = keys.length - 1
  while (pos > 0 && keys[pos - 1] > key) {
    keys[pos] = keys[pos - 1]
    data[pos] = data[pos - 1]
    childs[pos + 1] = childs[pos]
    pos--
  }

  keys[pos] = key
  data[pos] = value
  childs[pos + 1] = keyRightChild

  // split into two childs and key
  var medianIndex = Math.floor(keys.length / 2)
  var medianKey = this._keys[medianIndex]
  var medianValue = this._data[medianIndex]
  var i

  // fix left child keys and childs
  for (i = 0; i < keys.length; i++) {
    if (i < medianIndex) {
      left._pointers[i] = childs[i]
      left._keys[i] = keys[i]
      left._data[i] = data[i]
    } else if (i === medianIndex) {
      left._pointers[i] = childs[i]
      left._keys[i] = null
      left._data[i] = null
    } else {
      left._pointers[i] = this._keys[i] = this._data[i] = null
    }
  }
  left._keyCount = medianIndex

  // fix right child keys and childs
  for (i = 0; i < keys.length; i++) {
    if (i > medianIndex) {
      right._keys[i - medianIndex - 1] = keys[i]
      right._data[i - medianIndex - 1] = data[i]
      right._pointers[i - medianIndex - 1] = childs[i]
      right._keyCount += 1
    }
  }
  right._pointers[keys.length - medianIndex - 1] = childs[keys.length]

  return { left: left, key: medianKey, value: medianValue, right: right }
}

BTreeNode.prototype.remove = function (key) {
  if (this.isLeaf()) {
    return this.removeKey(key)
  } else {
    var keyIndex = this.indexOfKey(key)
    var child

    if (keyIndex === -1) {
      child = this.getChildContaining(key)
      var result = child.remove(key)

      this.rebalance(this._pointers.indexOf(child))
      return result
    } else {
      // replace key with max key from left child
      child = this._pointers[keyIndex]
      const maxKey = child.extractMax()
      const i = child._keys.indexOf(maxKey)
      this._keys[keyIndex] = maxKey
      this._data[keyIndex] = child._data[i]

      this.rebalance(keyIndex)
      return true
    }
  }
}

BTreeNode.prototype.rebalance = function (childIndex) {
  const MIN_NKEYS = this.KEYS_NUM / 2

  var child = this._pointers[childIndex]
  if (child.keyCount() >= MIN_NKEYS) {
    return
  }

  // borrow from left child
  if (childIndex) {
    var leftChild = this._pointers[childIndex - 1]
    if (leftChild.keyCount() > MIN_NKEYS) {
      var lastKey = leftChild._keys[leftChild.keyCount() - 1]
      var lastValue = leftChild._data[leftChild.keyCount() - 1]
      var lastChild = leftChild._child[leftChild.keyCount()]
      leftChild._keyCount--

      var key = this._keys[childIndex - 1]
      var value = this._data[childIndex - 1]
      this._keys[childIndex - 1] = lastKey
      this._data[childIndex - 1] = lastValue

      for (var i = child._keyCount - 1; i >= 0; i--) {
        child._keys[i + 1] = child._keys[i]
        child._data[i + 1] = child._data[i]
      }
      child._keys[0] = key
      child._data[0] = value

      for (var i = child._keyCount; i >= 0; i--) {
        child._pointers[i + 1] = child._pointers[i]
      }
      child._pointers[0] = lastChild
      child._keyCount++

      return
    }
  }

  // borrow from right child
  if (childIndex < this.keyCount()) {
    var rightChild = this._pointers[childIndex + 1]
    if (rightChild.keyCount() > MIN_NKEYS) {
      var firstKey = rightChild._keys[0]
      var firstValue = rightChild._data[0]
      var firstChild = rightChild._pointers[0]

      for (var i = 0; i < rightChild.keyCount() - 1; i++) {
        rightChild._keys[i] = rightChild._keys[i + 1]
        rightChild._data[i] = rightChild._data[i + 1]
      }

      for (var i = 0; i < rightChild.keyCount(); i++) {
        rightChild._pointers[i] = rightChild._pointers[i + 1]
      }

      rightChild._keyCount--

      child._keys[child.keyCount()] = this._keys[childIndex]
      child._data[child.keyCount()] = this._data[childIndex]
      this._keys[childIndex] = firstKey
      this._data[childIndex] = firstValue
      child._pointers[child.keyCount() + 1] = firstChild
      child._keyCount++

      return
    }
  }

  // merge
  if (childIndex) {
    // merge left and current
    childIndex -= 1
  }

  // childIndex will point to the *left* node of two merged nodes

  var merged = this.mergeChilds(childIndex)

  for (var i = childIndex; i < this._keyCount - 1; i += 1) {
    this._keys[i] = this._keys[i + 1]
    this._data[i] = this._data[i + 1]
  }
  for (var i = childIndex; i < this._keyCount; i += 1) {
    this._pointers[i] = this._pointers[i + 1]
  }
  this._keyCount--
  this._pointers[childIndex] = merged
}

BTreeNode.prototype.mergeChilds = function (leftIndex) {
  var key = this._keys[leftIndex]
  var value = this._data[leftIndex]

  var left = this._pointers[leftIndex]
  var right = this._pointers[leftIndex + 1]

  left._keys[left._keyCount] = key
  left._data[left._keyCount] = value
  left._keyCount++

  // copy right keys and childs into left
  for (var i = 0; i < right._keyCount; i++) {
    left._pointers[left._keyCount] = right._pointers[i]
    left._keys[left._keyCount] = right._keys[i]
    left._data[left._keyCount] = right._data[i]
    left._keyCount += 1
  }

  left._pointers[left._keyCount] = right._pointers[right._keyCount]

  return left
}

BTreeNode.prototype.extractMax = function () {
  var key

  if (this.isLeaf()) {
    key = this._keys[this._keyCount - 1]
    this._keyCount--
  } else {
    var child = this._pointers[this._keyCount]
    key = child.extractMax()

    this.rebalance(this._keyCount)
  }

  return key
}

BTreeNode.prototype.indexOfKey = function (key) {
  for (var i = 0; i < this._keyCount; i += 1) {
    if (this._keys[i] === key) {
      return i
    }
  }

  return -1
}

BTreeNode.prototype.removeKey = function (key) {
  console.assert(this.isLeaf())

  var keyIndex = this.indexOfKey(key)
  if (keyIndex === -1) return false

  // delete key
  for (var i = keyIndex + 1; i < this._keyCount; i += 1) {
    this._keys[i - 1] = this._keys[i]
    this._data[i - 1] = this._data[i]
  }

  this._keyCount--
  return true
}

BTreeNode.prototype.find = function (key) {
  let i = 0

  while (i < this._keyCount && this._keys[i] < key) {
    i++
  }

  if (this._keys[i] === key) {
    return this._data[i]
  }

  return this._pointers[i] ? this._pointers[i].find(key) : null
}

const zipWith = (f, xs, ys) =>
  Array.from({ length: Math.min(xs.length, ys.length) }, (_, i) =>
    f(xs[i], ys[i])
  )

BTreeNode.prototype.toString = function (indentOpt) {
  const INDENT_STRING = '  '

  indentOpt = indentOpt || ''

  if (this.isLeaf()) {
    return (
      indentOpt +
      '[' +
      zipWith(
        (a, b) => `${a}:${b}`,
        this._keys.slice(0, this.keyCount()),
        this._data.slice(0, this.keyCount())
      ).join(', ') +
      ']'
    )
  }

  var str = ''

  var childIndent = indentOpt + INDENT_STRING
  var childStrings = this._pointers
    .slice(0, this.keyCount() + 1)
    .map(function (child) {
      return child.toString(childIndent)
    })

  str = indentOpt + '[\n' + childStrings[0] + '\n'
  for (var i = 1; i < childStrings.length; i += 1) {
    str +=
      childIndent +
      `${this._keys[i - 1].toString()}:${this._data[i - 1].toString()}` +
      '\n' +
      childStrings[i] +
      '\n'
  }
  str += indentOpt + ']'

  return str
}

BTreeNode.prototype.fromSplit = function (split) {
  var node = new BTreeNode(this.KEYS_NUM)

  node._keyCount = 1
  node._keys[0] = split.key
  node._data[0] = split.value
  node._pointers[0] = split.left
  node._pointers[1] = split.right

  return node
}

function BTree(order) {
  this._root = new BTreeNode(order)
}

BTree.prototype.add = function (key, value) {
  var curr = this._root

  var split = curr.add(key, value)
  if (!split) return

  this._root = curr.fromSplit(split)
}

BTree.prototype.remove = function (key) {
  var removed = this._root.remove(key)

  if (this._root.keyCount() === 0 && this._root._pointers[0]) {
    this._root = this._root._pointers[0]
  }

  return removed
}

BTree.prototype.find = function (key) {
  return this._root.find(key)
}

BTree.prototype.toString = function () {
  return this._root.toString()
}

module.exports = {
  BTree,
}

// ------------------------------------
// TEST PROGRAM

var btree = new BTree(3)

var a1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20]
var a2 = [4, 2, 7, 1, 5, 3, 8]

var a = a1

a.forEach(function (v) {
  // console.log('----------------------------------');
  // console.log('ADDING ' + v + ' TO TREE');
  // console.log('');

  btree.add(v, v * 10)
  // console.log(btree.toString());
})

;[...a, 100, 101, 102].forEach((v) => {
  console.log('search', v, btree.find(v))
})

console.log(' --- BEFORE REMOVING --- ')
console.log(btree.toString())

a.forEach(function (v) {
  console.log('----------------------------------')
  console.log('REMOVING ' + v + ' FROM TREE')
  console.log('')

  console.assert(btree.remove(v))
  console.log(btree.toString())
})
