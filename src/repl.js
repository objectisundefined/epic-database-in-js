const rl = require('readline')

const { getMaxNodeSize, getMaxLeafSize, connectDB, createPager } = require('./persistent')
const { DataTypes, Schema, DefaultSchemas } = require('./schema')

// Backward compatibility: original serialization functions
const serializeRow = row => {
  const buffer = Buffer.alloc(291) // Original RowSize

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
    email: str(buffer, 'utf8', 36, 291),
  }
}

// Schema-based database class
class SchemaDatabase {
  constructor(dbPath, schema) {
    this.dbPath = dbPath
    this.schema = schema
    this.db = null
    this.pager = null
    this.MaxNodeSize = getMaxNodeSize()
    this.MaxLeafSize = getMaxLeafSize(schema.getRowSize())
  }

  async connect() {
    this.db = connectDB(this.dbPath)
    await this.db.open()

    this.pager = await createPager(this.db, {
      schema: this.schema,
      serialize: (obj) => this.schema.serialize(obj),
      deserialize: (buffer) => this.schema.deserialize(buffer),
    })
  }

  async close() {
    if (this.pager) {
      await this.pager.flush()
    }
    if (this.db) {
      await this.db.close()
    }
  }

  get Order() {
    return {
      Leaf: this.MaxLeafSize,
      Node: this.MaxNodeSize
    }
  }
}

// Enhanced node constructors that work with any schema
const NodeT = ({ no, parent, links, keys }) => ({
  no,
  type: 'Node',
  parent,
  links,
  keys,
  size: keys.length
})

const LeafT = ({ no, parent, keys, values, next }) => ({
  no,
  type: 'Leaf',
  parent,
  keys,
  values,
  size: keys.length,
  next,
})

const Insert = async (node, key, value, pager, Order) => {
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

    return Split(node, pager, Order)
  } else {
    const { pn, } = await FindKey(pager, key)

    return await Insert(await pager.page(pn), key, value, pager, Order)
  }
}

const Update = async (key, newValue, pager) => {
  // Find the leaf node containing the key
  const { pn, col } = await FindKey(pager, key)
  const node = await pager.page(pn)
  
  // Check if key exists
  if (col >= node.keys.length || node.keys[col] !== key) {
    return { success: false, error: `Key ${key} not found` }
  }
  
  // Store the old value for reference
  const oldValue = node.values[col]
  
  // Update the value in place (key remains the same, so B-tree structure is preserved)
  node.values[col] = newValue
  
  return { success: true, oldValue, newValue }
}

const Remove = async (node, key, pager, Order) => {
  if (node === null) {
    return null // Key not found
  }

  if (node.type === 'Leaf') {
    const i = binarySearch(node.keys, key)
    
    // Check if key exists
    if (i >= node.keys.length || node.keys[i] !== key) {
      return await pager.page(0) // Key not found, return root unchanged
    }

    // Remove the key-value pair
    node.keys.splice(i, 1)
    node.values.splice(i, 1)
    node.size -= 1

    // Check if we need to handle underflow
    const minKeys = Math.floor(Order.Leaf / 2)
    
    // If this is the root and becomes empty
    if (node.parent === 0 && node.size === 0) {
      pager.pages[0] = null
      return null
    }
    
    // If this is the root or has enough keys, we're done
    if (node.parent === 0 || node.size >= minKeys) {
      return await pager.page(0)
    }

    // Handle underflow
    return await HandleLeafUnderflow(node, pager, Order)
  } else {
    // Internal node - find the child that should contain the key
    const { pn } = await FindKey(pager, key)
    const child = await pager.page(pn)
    
    const result = await Remove(child, key, pager, Order)
    
    // Check if we need to handle underflow in internal nodes
    if (child.size < Math.floor(Order.Node / 2) && child.parent !== 0) {
      return await HandleNodeUnderflow(child, pager, Order)
    }
    
    return result
  }
}

const HandleLeafUnderflow = async (node, pager, Order) => {
  const parent = await pager.page(node.parent)
  const nodeIndex = parent.links.indexOf(node.no)
  
  // Try to borrow from left sibling
  if (nodeIndex > 0) {
    const leftSibling = await pager.page(parent.links[nodeIndex - 1])
    const minKeys = Math.floor(Order.Leaf / 2)
    
    if (leftSibling.size > minKeys) {
      // Borrow from left sibling
      const borrowedKey = leftSibling.keys.pop()
      const borrowedValue = leftSibling.values.pop()
      leftSibling.size -= 1
      
      node.keys.unshift(borrowedKey)
      node.values.unshift(borrowedValue)
      node.size += 1
      
      // Update parent key
      parent.keys[nodeIndex - 1] = borrowedKey
      
      return await pager.page(0)
    }
  }
  
  // Try to borrow from right sibling
  if (nodeIndex < parent.links.length - 1) {
    const rightSibling = await pager.page(parent.links[nodeIndex + 1])
    const minKeys = Math.floor(Order.Leaf / 2)
    
    if (rightSibling.size > minKeys) {
      // Borrow from right sibling
      const borrowedKey = rightSibling.keys.shift()
      const borrowedValue = rightSibling.values.shift()
      rightSibling.size -= 1
      
      node.keys.push(borrowedKey)
      node.values.push(borrowedValue)
      node.size += 1
      
      // Update parent key
      parent.keys[nodeIndex] = rightSibling.keys[0] || borrowedKey
      
      return await pager.page(0)
    }
  }
  
  // Must merge with a sibling
  if (nodeIndex > 0) {
    // Merge with left sibling
    const leftSibling = await pager.page(parent.links[nodeIndex - 1])
    
    leftSibling.keys.push(...node.keys)
    leftSibling.values.push(...node.values)
    leftSibling.size += node.size
    leftSibling.next = node.next
    
    // Remove node from parent
    parent.keys.splice(nodeIndex - 1, 1)
    parent.links.splice(nodeIndex, 1)
    parent.size -= 1
    
    // Remove the merged node from pager
    delete pager.pages[node.no]
    
  } else {
    // Merge with right sibling
    const rightSibling = await pager.page(parent.links[nodeIndex + 1])
    
    node.keys.push(...rightSibling.keys)
    node.values.push(...rightSibling.values)
    node.size += rightSibling.size
    node.next = rightSibling.next
    
    // Remove right sibling from parent
    parent.keys.splice(nodeIndex, 1)
    parent.links.splice(nodeIndex + 1, 1)
    parent.size -= 1
    
    // Remove the merged node from pager
    delete pager.pages[rightSibling.no]
  }
  
  // Check if parent needs handling
  const minNodeKeys = Math.floor(Order.Node / 2)
  if (parent.parent !== 0 && parent.size < minNodeKeys) {
    return await HandleNodeUnderflow(parent, pager, Order)
  }
  
  return await pager.page(0)
}

const HandleNodeUnderflow = async (node, pager, Order) => {
  const parent = await pager.page(node.parent)
  const nodeIndex = parent.links.indexOf(node.no)
  const minKeys = Math.floor(Order.Node / 2)
  
  // Try to borrow from left sibling
  if (nodeIndex > 0) {
    const leftSibling = await pager.page(parent.links[nodeIndex - 1])
    
    if (leftSibling.size > minKeys) {
      // Borrow from left sibling
      const borrowedKey = leftSibling.keys.pop()
      const borrowedLink = leftSibling.links.pop()
      leftSibling.size -= 1
      
      node.keys.unshift(parent.keys[nodeIndex - 1])
      node.links.unshift(borrowedLink)
      node.size += 1
      
      parent.keys[nodeIndex - 1] = borrowedKey
      
      // Update borrowed link's parent
      const borrowedChild = await pager.page(borrowedLink)
      borrowedChild.parent = node.no
      
      return await pager.page(0)
    }
  }
  
  // Try to borrow from right sibling
  if (nodeIndex < parent.links.length - 1) {
    const rightSibling = await pager.page(parent.links[nodeIndex + 1])
    
    if (rightSibling.size > minKeys) {
      // Borrow from right sibling
      const borrowedKey = rightSibling.keys.shift()
      const borrowedLink = rightSibling.links.shift()
      rightSibling.size -= 1
      
      node.keys.push(parent.keys[nodeIndex])
      node.links.push(borrowedLink)
      node.size += 1
      
      parent.keys[nodeIndex] = borrowedKey
      
      // Update borrowed link's parent
      const borrowedChild = await pager.page(borrowedLink)
      borrowedChild.parent = node.no
      
      return await pager.page(0)
    }
  }
  
  // Must merge with a sibling
  if (nodeIndex > 0) {
    // Merge with left sibling
    const leftSibling = await pager.page(parent.links[nodeIndex - 1])
    
    leftSibling.keys.push(parent.keys[nodeIndex - 1])
    leftSibling.keys.push(...node.keys)
    leftSibling.links.push(...node.links)
    leftSibling.size += node.size + 1
    
    // Update all merged links' parent
    for (const link of node.links) {
      const child = await pager.page(link)
      child.parent = leftSibling.no
    }
    
    // Remove node from parent
    parent.keys.splice(nodeIndex - 1, 1)
    parent.links.splice(nodeIndex, 1)
    parent.size -= 1
    
    // Remove the merged node from pager
    delete pager.pages[node.no]
    
  } else {
    // Merge with right sibling
    const rightSibling = await pager.page(parent.links[nodeIndex + 1])
    
    node.keys.push(parent.keys[nodeIndex])
    node.keys.push(...rightSibling.keys)
    node.links.push(...rightSibling.links)
    node.size += rightSibling.size + 1
    
    // Update all merged links' parent
    for (const link of rightSibling.links) {
      const child = await pager.page(link)
      child.parent = node.no
    }
    
    // Remove right sibling from parent
    parent.keys.splice(nodeIndex, 1)
    parent.links.splice(nodeIndex + 1, 1)
    parent.size -= 1
    
    // Remove the merged node from pager
    delete pager.pages[rightSibling.no]
  }
  
  // Check if parent is now empty (this would be the new root case)
  if (parent.size === 0 && parent.parent === 0) {
    // The tree height decreases
    if (nodeIndex > 0) {
      const newRoot = await pager.page(parent.links[0])
      newRoot.parent = 0
      pager.pages[0] = newRoot
    } else {
      node.parent = 0
      pager.pages[0] = node
    }
    
    delete pager.pages[parent.no]
    return await pager.page(0)
  }
  
  // Check if parent needs further handling
  if (parent.parent !== 0 && parent.size < minKeys) {
    return await HandleNodeUnderflow(parent, pager, Order)
  }
  
  return await pager.page(0)
}

const Shift = async (node, key, link, pager, Order) => {
  // node must be Node and key was lower than node max key

  const i = binarySearch(node.keys, key)

  node.keys.splice(i, 0, key)
  node.links.splice(i, 0, link)

  node.size += 1

  if (node.size <= Order.Node) {
    return await pager.page(0)
  }

  return await Split(node, pager, Order)
}

const Split = async (node, pager, Order) => {
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
      return await Shift(node_, left.keys[l - 1], left.no, pager, Order)
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
      return await Shift(node_, left.keys[l - 1], left.no, pager, Order)
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

// Schema examples and demo functions
const demonstrateSchemas = async () => {
  console.log('=== Available Schemas ===')
  
  for (const [name, schema] of Object.entries(DefaultSchemas)) {
    console.log(`\n${name} Schema (${schema.getRowSize()} bytes):`)
    schema.getFields().forEach(field => {
      console.log(`  - ${field.name}: ${field.type.size} bytes`)
    })
  }
  
  console.log('\n=== Custom Schema Example ===')
  const customSchema = new Schema({
    id: DataTypes.UINT32,
    title: DataTypes.VARCHAR(100),
    priority: DataTypes.UINT32,
    completed: DataTypes.BOOLEAN,
    created_at: DataTypes.INT64,
    metadata: DataTypes.JSON(200)
  })
  
  console.log(`Custom Task Schema (${customSchema.getRowSize()} bytes):`)
  customSchema.getFields().forEach(field => {
    console.log(`  - ${field.name}: ${field.type.size} bytes`)
  })
}

;(async () => {
  // Show available schemas
  await demonstrateSchemas()
  
  console.log('\n=== Starting REPL ===')
  console.log('Available commands:')
  console.log('  schema <name>         - Switch to a predefined schema (User, Product, LogEntry, etc.)')
  console.log('  custom <json>         - Define a custom schema')
  console.log('  insert <data>         - Insert data (format depends on current schema)')
  console.log('  update <data>         - Update existing record by ID')
  console.log('  remove <id>           - Remove record by ID')
  console.log('  select <conditions>   - Search data')
  console.log('  btree                 - Show B-tree structure')
  console.log('  current               - Show current schema info')
  console.log('  examples              - Show data examples for current schema')
  console.log('  quit                  - Exit')

  // Start with the original User schema for backward compatibility
  let currentSchema = DefaultSchemas.User
  let database = new SchemaDatabase('./test.db', currentSchema)
  await database.connect()

  const Append = async (n, schema) => {
    const size = database.pager.no === 1 ? 0 : database.pager.no

    let root = null

    if (size > 1) {
      root = await database.pager.page(0)
    }

    const max = size > 1 ? await FindMax(database.pager) : 0
    console.log(`max = `, max)

    for (let i = max; i < max + n; i++) {
      const data = schema === DefaultSchemas.User 
        ? { id: i + 1, username: `u${i + 1}`, email: `u${i + 1}@qq.com` }
        : generateSampleData(schema, i + 1)
      
      root = await Insert(root, i + 1, data, database.pager, database.Order)
    }

    await Inspect(database.pager.pages[0], database.pager)

    const cond = { lte: max - n, limit: n * 2 }

    console.log(
      cond, await Search(database.pager, cond)
    )

    await database.pager.flush()
  }

  const generateSampleData = (schema, id) => {
    const data = { }
    
    for (const field of schema.getFields()) {
      if (field.name === 'id') {
        data[field.name] = id
      } else if (field.name.includes('name') || field.name.includes('title')) {
        data[field.name] = `Sample ${field.name} ${id}`
      } else if (field.name.includes('email')) {
        data[field.name] = `user${id}@example.com`
      } else if (field.name.includes('price')) {
        data[field.name] = Math.random() * 100
      } else if (field.name.includes('timestamp') || field.name.includes('created_at')) {
        data[field.name] = Date.now()
      } else if (field.name.includes('boolean') || field.name.includes('completed') || field.name.includes('in_stock')) {
        data[field.name] = Math.random() > 0.5
      } else if (field.name.includes('metadata') || field.name.includes('properties')) {
        data[field.name] = { sample: true, id }
      } else {
        // Default values based on type
        if (field.type.size === 4) data[field.name] = id
        else if (field.type.size === 8) data[field.name] = Date.now()
        else if (field.type.size === 1) data[field.name] = true
        else data[field.name] = `value_${id}`
      }
    }
    
    return data
  }

  database.pager.no === 1 && await Append(10, currentSchema) // initialize with sample data

  const interface = rl.createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  interface.write('> ')

  interface.on('line', async line => {
    try {
      // Remove prompt character if present
      line = line.replace(/^>\s*/, '').trim()
      
      if (line.includes('schema ')) {
        const schemaName = line.split(' ')[1]
        if (DefaultSchemas[schemaName]) {
          await database.close()
          currentSchema = DefaultSchemas[schemaName]
          database = new SchemaDatabase(`./test_${schemaName.toLowerCase()}.db`, currentSchema)
          await database.connect()
          console.log(`Switched to ${schemaName} schema (${currentSchema.getRowSize()} bytes)`)
          
          // Initialize with sample data if empty
          if (database.pager.no === 1) {
            await Append(5, currentSchema)
          }
        } else {
          console.log(`Unknown schema: ${schemaName}. Available: ${Object.keys(DefaultSchemas).join(', ')}`)
        }
      }

      else if (line.includes('custom ')) {
        try {
          const schemaJson = line.substring(7)
          const schemaConfig = JSON.parse(schemaJson)
          const fields = {}
          
          for (const [name, typeStr] of Object.entries(schemaConfig)) {
            if (typeStr.startsWith('VARCHAR(')) {
              const length = parseInt(typeStr.match(/\d+/)[0])
              fields[name] = DataTypes.VARCHAR(length)
            } else if (typeStr.startsWith('JSON(')) {
              const length = parseInt(typeStr.match(/\d+/)[0])
              fields[name] = DataTypes.JSON(length)
            } else {
              fields[name] = DataTypes[typeStr]
            }
          }
          
          await database.close()
          currentSchema = new Schema(fields)
          database = new SchemaDatabase('./test_custom.db', currentSchema)
          await database.connect()
          console.log(`Created custom schema (${currentSchema.getRowSize()} bytes)`)
        } catch (e) {
          console.error('Invalid custom schema JSON:', e.message)
        }
      }

      else if (line.includes('current')) {
        console.log(`Current schema (${currentSchema.getRowSize()} bytes):`)
        currentSchema.getFields().forEach(field => {
          console.log(`  - ${field.name}: ${field.type.size} bytes`)
        })
      }

      else if (line.includes('examples')) {
        console.log('Example data for current schema:')
        const example = generateSampleData(currentSchema, 999)
        console.log(JSON.stringify(example, null, 2))
      }

      else if (line.includes('select')) {
        const [, lte, limit] = line.match(/where id >= (\d+) limit (\d+)/)
        console.log(await Search(database.pager, { lte: +lte, limit: +limit }))
      }

      else if (line.includes('insert')) {
        try {
          // Try to parse as JSON first
          const dataStr = line.substring(6).trim()
          let data
          
          if (dataStr.startsWith('{')) {
            data = JSON.parse(dataStr)
          } else {
            // For backward compatibility with the original format
            const [, id, username, email] = line.match(/insert\s+(\d+)\s+(\w+)\s+(.*)/)
            data = { id: +id, username, email }
          }

          const key = data.id || data.key || Object.values(data)[0] // Use id, key, or first value as key
          
          const { pn, col } = await FindKey(database.pager, key)

          if ((await database.pager.page(pn)).keys[col] === key) {
            console.error(`duplicate key: ${key}`)
            interface.write('> ')
            return
          }

          await Insert(await database.pager.page(0), key, data, database.pager, database.Order)

          {
            // read from inserted col
            const { pn, col } = await FindKey(database.pager, key)
            console.log((await database.pager.page(pn)).values[col])
          }
        } catch (e) {
          console.error('Insert error:', e.message)
          console.log('Usage: insert {"id": 1, "name": "value", ...} or insert <id> <username> <email>')
        }
      }

      else if (line.includes('update')) {
        try {
          // Try to parse as JSON first
          const dataStr = line.substring(6).trim()
          let data
          
          if (dataStr.startsWith('{')) {
            data = JSON.parse(dataStr)
          } else {
            // For backward compatibility with the original format
            const [, id, username, email] = line.match(/update\s+(\d+)\s+(\w+)\s+(.*)/)
            data = { id: +id, username, email }
          }

          const key = data.id || data.key || Object.values(data)[0] // Use id, key, or first value as key
          
          // Perform the update
          const result = await Update(key, data, database.pager)
          
          if (result.success) {
            console.log(`Updated record with key ${key}:`)
            console.log('Old value:', result.oldValue)
            console.log('New value:', result.newValue)
            await database.pager.flush()
          } else {
            console.error(result.error)
          }
        } catch (e) {
          console.error('Update error:', e.message)
          console.log('Usage: update {"id": 1, "name": "new_value", ...} or update <id> <username> <email>')
        }
      }

      else if (line.includes('remove')) {
        try {
          const keyStr = line.substring(6).trim()
          const key = parseInt(keyStr)
          
          if (isNaN(key)) {
            console.error('Invalid key. Please provide a numeric ID.')
            interface.write('> ')
            return
          }

          // Check if key exists first
          const { pn, col } = await FindKey(database.pager, key)
          const node = await database.pager.page(pn)
          
          if (col >= node.keys.length || node.keys[col] !== key) {
            console.error(`Key ${key} not found`)
            interface.write('> ')
            return
          }

          // Store the value before removing it
          const removedValue = node.values[col]
          
          // Remove the entry
          const root = await database.pager.page(0)
          const newRoot = await Remove(root, key, database.pager, database.Order)
          
          if (newRoot === null) {
            // Tree became empty
            console.log(`Removed record with key ${key}:`, removedValue)
            console.log('Database is now empty')
          } else {
            console.log(`Removed record with key ${key}:`, removedValue)
          }

          await database.pager.flush()
        } catch (e) {
          console.error('Remove error:', e.message)
          console.log('Usage: remove <id>')
        }
      }

      else if (line.includes('btree')) {
        await Inspect(await database.pager.page(0), database.pager)
      }

      else if (line.includes('quit')) {
        await database.close()
        interface.close()
        return
      }

      else if (line.trim()) {
        console.log('Unknown command. Type "quit" to exit.')
      }
    } catch (error) {
      console.error('Error:', error.message)
    }

    interface.write('> ')
  })

})()
