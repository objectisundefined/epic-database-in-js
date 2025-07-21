const { DataTypes, Schema, DefaultSchemas } = require('./schema')
const { connectDB, createPager, getMaxNodeSize, getMaxLeafSize } = require('./persistent')
const path = require('path')
const fs = require('fs/promises')

/**
 * Table class that manages a specific table with schema-based operations
 */
class Table {
  constructor(name, schema, dbDir = './data') {
    this.name = name
    this.schema = schema
    this.dbDir = dbDir
    this.dbPath = path.join(dbDir, `${name}.db`)
    this.db = null
    this.pager = null
    this.MaxNodeSize = getMaxNodeSize()
    this.MaxLeafSize = getMaxLeafSize(schema.getRowSize())
    this.isOpen = false
  }

  /**
   * Open/connect to the table database
   */
  async open() {
    if (this.isOpen) return

    // Ensure data directory exists
    await fs.mkdir(this.dbDir, { recursive: true })

    this.db = connectDB(this.dbPath)
    await this.db.open()

    this.pager = await createPager(this.db, {
      schema: this.schema,
      serialize: (obj) => this.schema.serialize(obj),
      deserialize: (buffer) => this.schema.deserialize(buffer),
    })

    this.isOpen = true
  }

  /**
   * Close the table database
   */
  async close() {
    if (!this.isOpen) return

    if (this.pager) {
      await this.pager.flush()
    }
    if (this.db) {
      await this.db.close()
    }
    this.isOpen = false
  }

  /**
   * Get table metadata
   */
  getInfo() {
    return {
      name: this.name,
      schema: this.schema.getFields().map(field => ({
        name: field.name,
        type: this._getFieldTypeString(field.type),
        size: field.size
      })),
      totalRowSize: this.schema.getRowSize(),
      maxLeafSize: this.MaxLeafSize,
      maxNodeSize: this.MaxNodeSize
    }
  }

  _getFieldTypeString(type) {
    if (type.size === 4 && type.serialize.toString().includes('writeInt32LE')) return 'INT32'
    if (type.size === 4 && type.serialize.toString().includes('writeUInt32LE')) return 'UINT32'
    if (type.size === 8 && type.serialize.toString().includes('writeBigInt64LE')) return 'INT64'
    if (type.size === 4 && type.serialize.toString().includes('writeFloatLE')) return 'FLOAT'
    if (type.size === 8 && type.serialize.toString().includes('writeDoubleLE')) return 'DOUBLE'
    if (type.size === 1) return 'BOOLEAN'
    if (type.serialize.toString().includes('write') && type.serialize.toString().includes('utf8')) {
      return `VARCHAR(${type.size})`
    }
    if (type.serialize.toString().includes('JSON.stringify')) {
      return `JSON(${type.size})`
    }
    return `BINARY(${type.size})`
  }

  /**
   * Create (insert) a new record
   */
  async create(data) {
    if (!this.isOpen) await this.open()

    // Validate required fields and extract key
    const keyField = this._getPrimaryKey()
    if (!data[keyField.name]) {
      throw new Error(`Primary key '${keyField.name}' is required`)
    }

    const key = data[keyField.name]

    // Check if record already exists
    const existing = await this._findRecord(key)
    if (existing) {
      throw new Error(`Record with ${keyField.name} '${key}' already exists`)
    }

    // Insert the record
    let root = await this._getRoot()
    root = await this._insert(root, key, data)
    await this.pager.flush()

    return { success: true, key, data }
  }

  /**
   * Read (select) records with optional conditions
   */
  async read(conditions = {}) {
    if (!this.isOpen) await this.open()

    // Handle different query types
    if (conditions.key !== undefined) {
      // Single record by primary key
      const record = await this._findRecord(conditions.key)
      return record ? [record] : []
    }

    if (conditions.where || conditions.limit || conditions.offset) {
      // Range/filtered query
      return await this._search(conditions)
    }

    // Return all records (with optional limit)
    return await this._search({ limit: conditions.limit || 1000 })
  }

  /**
   * Update an existing record
   */
  async update(key, newData) {
    if (!this.isOpen) await this.open()

    const keyField = this._getPrimaryKey()
    
    // Find existing record
    const existing = await this._findRecord(key)
    if (!existing) {
      throw new Error(`Record with ${keyField.name} '${key}' not found`)
    }

    // Merge existing data with updates (preserve key)
    const updatedData = { ...existing.data, ...newData }
    updatedData[keyField.name] = key // Ensure key doesn't change

    // Update in place
    const result = await this._updateRecord(key, updatedData)
    await this.pager.flush()

    return { 
      success: true, 
      key, 
      oldData: existing.data, 
      newData: updatedData 
    }
  }

  /**
   * Delete a record
   */
  async delete(key) {
    if (!this.isOpen) await this.open()

    const keyField = this._getPrimaryKey()
    
    // Find existing record
    const existing = await this._findRecord(key)
    if (!existing) {
      throw new Error(`Record with ${keyField.name} '${key}' not found`)
    }

    // Remove the record
    let root = await this._getRoot()
    root = await this._remove(root, key)
    await this.pager.flush()

    return { 
      success: true, 
      key, 
      deletedData: existing.data 
    }
  }

  /**
   * Count total records in the table
   */
  async count() {
    if (!this.isOpen) await this.open()

    // Handle empty database case
    if (this.pager.no === 1) {
      return 0
    }

    const results = await this._search({ limit: Number.MAX_SAFE_INTEGER })
    return results.length
  }

  /**
   * Show table structure (B-tree visualization)
   */
  async showStructure() {
    if (!this.isOpen) await this.open()

    console.log(`\n=== Table: ${this.name} ===`)
    console.log(`Schema: ${this.schema.getRowSize()} bytes per record`)
    
    const root = await this._getRoot()
    if (root) {
      await this._inspectNode(root, 0)
    } else {
      console.log('Empty table')
    }
  }

  // Helper methods for primary key detection
  _getPrimaryKey() {
    // Look for 'id' field first, then 'key', then first field
    const fields = this.schema.getFields()
    let primaryKey = fields.find(f => f.name === 'id') || 
                    fields.find(f => f.name === 'key') ||
                    fields[0]
    
    if (!primaryKey) {
      throw new Error('No primary key field found in schema')
    }
    return primaryKey
  }

  // Database operation helpers
  async _getRoot() {
    if (this.pager.no === 1) return null // Empty database
    return await this.pager.page(0)
  }

  async _findRecord(key) {
    // Handle empty database case
    if (this.pager.no === 1) {
      return null
    }

    const { pn, col } = await this._findKey(key)
    const node = await this.pager.page(pn)
    
    if (col < node.keys.length && node.keys[col] === key) {
      return { key, data: node.values[col] }
    }
    return null
  }

  async _search(conditions = {}) {
    const results = []
    const limit = conditions.limit || 1000
    const offset = conditions.offset || 0
    
    // Handle empty database case
    if (this.pager.no === 1) {
      return results
    }
    
    // Use a recursive approach to collect all records from all leaf nodes
    const collectAllRecords = async (nodeNo) => {
      const node = await this.pager.page(nodeNo)
      
      if (node.type === 'Leaf') {
        // Collect all records from this leaf
        for (let i = 0; i < node.size; i++) {
          const key = node.keys[i]
          const data = node.values[i]
          
          if (this._matchesConditions(key, data, conditions.where)) {
            results.push({ key, data })
          }
        }
      } else {
        // Recursively visit all child nodes
        for (const linkNo of node.links) {
          if (linkNo > 0) {
            await collectAllRecords(linkNo)
          }
        }
      }
    }
    
    // Start from root and collect all records
    await collectAllRecords(0)
    
    // Sort results by key to maintain order
    results.sort((a, b) => a.key - b.key)
    
    // Apply offset and limit
    const startIndex = offset
    const endIndex = Math.min(offset + limit, results.length)
    
    return results.slice(startIndex, endIndex)
  }

  _matchesConditions(key, data, where) {
    if (!where) return true
    
    // Simple condition matching
    if (where.gte !== undefined && key < where.gte) return false
    if (where.gt !== undefined && key <= where.gt) return false
    if (where.lte !== undefined && key > where.lte) return false
    if (where.lt !== undefined && key >= where.lt) return false
    if (where.eq !== undefined && key !== where.eq) return false
    
    // Field-based conditions
    for (const [field, value] of Object.entries(where)) {
      if (['gte', 'gt', 'lte', 'lt', 'eq'].includes(field)) continue
      if (data[field] !== value) return false
    }
    
    return true
  }

  // B-tree operation implementations (simplified versions of the REPL operations)
  async _insert(node, key, value) {
    if (node === null) {
      node = this._createLeaf({
        no: this.pager.no++,
        parent: 0,
        keys: [key],
        values: [value],
        next: 0,
      })

      this.pager.pages[0] = this.pager.pages[node.no] = node
      return node
    }

    if (node.type === 'Leaf') {
      const i = this._binarySearch(node.keys, key)
      node.keys.splice(i, 0, key)
      node.values.splice(i, 0, value)
      node.size += 1

      if (node.size <= this.MaxLeafSize) {
        return await this.pager.page(0)
      }

      return await this._split(node)
    } else {
      const { pn } = await this._findKey(key)
      return await this._insert(await this.pager.page(pn), key, value)
    }
  }

  async _updateRecord(key, newValue) {
    const { pn, col } = await this._findKey(key)
    const node = await this.pager.page(pn)
    
    if (col >= node.keys.length || node.keys[col] !== key) {
      throw new Error(`Key ${key} not found`)
    }
    
    const oldValue = node.values[col]
    node.values[col] = newValue
    
    return { success: true, oldValue, newValue }
  }

  async _remove(node, key) {
    if (node === null) return null

    if (node.type === 'Leaf') {
      const i = this._binarySearch(node.keys, key)
      
      if (i >= node.keys.length || node.keys[i] !== key) {
        return await this.pager.page(0)
      }

      node.keys.splice(i, 1)
      node.values.splice(i, 1)
      node.size -= 1

      const minKeys = Math.floor(this.MaxLeafSize / 2)
      
      if (node.parent === 0 && node.size === 0) {
        this.pager.pages[0] = null
        return null
      }
      
      if (node.parent === 0 || node.size >= minKeys) {
        return await this.pager.page(0)
      }

      return await this._handleLeafUnderflow(node)
    } else {
      const { pn } = await this._findKey(key)
      const child = await this.pager.page(pn)
      
      const result = await this._remove(child, key)
      
      if (child.size < Math.floor(this.MaxNodeSize / 2) && child.parent !== 0) {
        return await this._handleNodeUnderflow(child)
      }
      
      return result
    }
  }

  async _findKey(key) {
    // Handle empty database case
    if (this.pager.no === 1) {
      // Create a dummy leaf node for finding position in empty DB
      return {
        pn: 1, // Dummy page number
        col: 0
      }
    }

    let node = await this.pager.page(0)

    while (node && node.type === 'Node') {
      const i = this._binarySearch(node.keys, key)

      if (i > 0) {
        let l = await this.pager.page(node.links[i - 1])

        while (l.type === 'Node') {
          l = await this.pager.page(l.links[l.size])
        }

        if (l.keys[l.size - 1] >= key) {
          node = await this.pager.page(node.links[i - 1])
          continue
        }
      }

      node = await this.pager.page(node.links[i])
    }

    return {
      pn: node ? node.no : 0,
      col: node ? this._binarySearch(node.keys, key) : 0,
    }
  }

  _binarySearch(keys, key) {
    let i = 0
    let j = keys.length - 1

    while (i <= j) {
      const k = Math.floor((i + j) / 2)

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

  _createLeaf({ no, parent, keys, values, next }) {
    return {
      no,
      type: 'Leaf',
      parent,
      keys,
      values,
      size: keys.length,
      next,
    }
  }

  _createNode({ no, parent, links, keys }) {
    return {
      no,
      type: 'Node',
      parent,
      links,
      keys,
      size: keys.length
    }
  }

  async _split(node) {
    // Simplified split implementation
    const r = Math.floor((node.keys.length + 1) / 2)
    const l = node.keys.length - r

    if (node.type === 'Leaf') {
      const nodeParent = node.parent > 0 ? await this.pager.page(node.parent) : this._createNode({
        no: this.pager.no++,
        parent: 0,
        links: [],
        keys: []
      })

      const left = this._createLeaf({
        no: this.pager.no++,
        parent: nodeParent.no,
        keys: node.keys.slice(0, l),
        values: node.values.slice(0, l),
        next: node.no,
      })

      this.pager.pages[left.no] = left

      const right = node
      right.keys = node.keys.slice(l)
      right.values = node.values.slice(l)
      right.size = right.keys.length

      // Update next pointers for leaf nodes
      // Find the previous leaf that should point to the new left node
      for (let pageNo in this.pager.pages) {
        const page = this.pager.pages[pageNo]
        if (page && page.type === 'Leaf' && page.next === node.no) {
          page.next = left.no
          break
        }
      }

      if (node.parent > 0) {
        return await this._shift(nodeParent, left.keys[l - 1], left.no)
      } else {
        node.parent = nodeParent.no
        nodeParent.links = [left.no, right.no]
        nodeParent.keys = [left.keys.slice(-1)[0]]
        nodeParent.size = 1

        this.pager.pages[0] = this.pager.pages[nodeParent.no] = nodeParent
        return nodeParent
      }
    }

    // Node split implementation would go here
    return node
  }

  async _shift(node, key, link) {
    const i = this._binarySearch(node.keys, key)

    node.keys.splice(i, 0, key)
    node.links.splice(i, 0, link)
    node.size += 1

    if (node.size <= this.MaxNodeSize) {
      return await this.pager.page(0)
    }

    return await this._split(node)
  }

  // Simplified underflow handling (placeholder implementations)
  async _handleLeafUnderflow(node) {
    // Simplified - in real implementation, would handle borrowing and merging
    return await this.pager.page(0)
  }

  async _handleNodeUnderflow(node) {
    // Simplified - in real implementation, would handle borrowing and merging
    return await this.pager.page(0)
  }

  async _inspectNode(node, level = 0) {
    const indent = '  '.repeat(level)
    if (node.type === 'Leaf') {
      const items = node.keys.slice(0, node.size).map((k, i) => 
        `${k}=${JSON.stringify(node.values[i], null, 0)}`
      ).join(' ')
      console.log(`${indent}Leaf #${node.no}: ${items}`)
    } else { 
      console.log(`${indent}Node #${node.no}: [${node.keys.join(', ')}]`)
      for (let link of node.links) {
        if (link > 0) {
          await this._inspectNode(await this.pager.page(link), level + 1)
        }
      }
    }
  }
}

/**
 * Database class that manages multiple tables
 */
class Database {
  constructor(name, dbDir = './data') {
    this.name = name
    this.dbDir = path.join(dbDir, name)
    this.tables = new Map()
    this.metadata = {
      name,
      created: new Date(),
      tables: []
    }
  }

  /**
   * Create a new table with the given schema
   */
  async createTable(tableName, schema) {
    if (this.tables.has(tableName)) {
      throw new Error(`Table '${tableName}' already exists`)
    }

    const table = new Table(tableName, schema, this.dbDir)
    await table.open()
    
    this.tables.set(tableName, table)
    this.metadata.tables.push({
      name: tableName,
      created: new Date(),
      schema: table.getInfo().schema
    })

    await this._saveMetadata()
    return table
  }

  /**
   * Get a table by name
   */
  async getTable(tableName) {
    if (!this.tables.has(tableName)) {
      throw new Error(`Table '${tableName}' does not exist`)
    }
    
    const table = this.tables.get(tableName)
    if (!table.isOpen) {
      await table.open()
    }
    return table
  }

  /**
   * Drop (delete) a table
   */
  async dropTable(tableName) {
    if (!this.tables.has(tableName)) {
      throw new Error(`Table '${tableName}' does not exist`)
    }

    const table = this.tables.get(tableName)
    await table.close()
    
    // Remove table file
    try {
      await fs.unlink(table.dbPath)
    } catch (error) {
      // File might not exist, that's ok
    }

    this.tables.delete(tableName)
    this.metadata.tables = this.metadata.tables.filter(t => t.name !== tableName)
    
    await this._saveMetadata()
  }

  /**
   * List all tables
   */
  listTables() {
    return Array.from(this.tables.keys())
  }

  /**
   * Get database info
   */
  getInfo() {
    return {
      ...this.metadata,
      tablesOpen: this.tables.size
    }
  }

  /**
   * Close all tables and database
   */
  async close() {
    for (const table of this.tables.values()) {
      await table.close()
    }
    this.tables.clear()
  }

  async _saveMetadata() {
    await fs.mkdir(this.dbDir, { recursive: true })
    const metadataPath = path.join(this.dbDir, 'metadata.json')
    await fs.writeFile(metadataPath, JSON.stringify(this.metadata, null, 2))
  }

  async _loadMetadata() {
    const metadataPath = path.join(this.dbDir, 'metadata.json')
    try {
      const data = await fs.readFile(metadataPath, 'utf8')
      this.metadata = JSON.parse(data)
      
      // Restore tables
      for (const tableInfo of this.metadata.tables) {
        // Reconstruct schema from saved info
        const fields = {}
        for (const field of tableInfo.schema) {
          fields[field.name] = this._parseFieldType(field.type)
        }
        const schema = new Schema(fields)
        const table = new Table(tableInfo.name, schema, this.dbDir)
        this.tables.set(tableInfo.name, table)
      }
    } catch (error) {
      // Metadata doesn't exist yet, that's ok
    }
  }

  _parseFieldType(typeString) {
    if (typeString === 'INT32') return DataTypes.INT32
    if (typeString === 'UINT32') return DataTypes.UINT32
    if (typeString === 'INT64') return DataTypes.INT64
    if (typeString === 'FLOAT') return DataTypes.FLOAT
    if (typeString === 'DOUBLE') return DataTypes.DOUBLE
    if (typeString === 'BOOLEAN') return DataTypes.BOOLEAN
    
    const varcharMatch = typeString.match(/VARCHAR\((\d+)\)/)
    if (varcharMatch) return DataTypes.VARCHAR(parseInt(varcharMatch[1]))
    
    const jsonMatch = typeString.match(/JSON\((\d+)\)/)
    if (jsonMatch) return DataTypes.JSON(parseInt(jsonMatch[1]))
    
    const binaryMatch = typeString.match(/BINARY\((\d+)\)/)
    if (binaryMatch) return DataTypes.BINARY(parseInt(binaryMatch[1]))
    
    throw new Error(`Unknown field type: ${typeString}`)
  }

  /**
   * Initialize database (load existing or create new)
   */
  static async connect(name, dbDir = './data') {
    const db = new Database(name, dbDir)
    await db._loadMetadata()
    return db
  }
}

module.exports = {
  Table,
  Database,
  DataTypes,
  Schema,
  DefaultSchemas
}