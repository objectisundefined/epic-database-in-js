const { DataTypes, Schema, DefaultSchemas } = require('../schema/index')
const { BPlusTree, connectDB, createPager, getMaxInternalSize, getMaxLeafSize } = require('../index/bplus-tree')
const path = require('path')
const fs = require('fs/promises')

/**
 * Table class using B+ Tree for better range query performance
 */
class Table {
  constructor(name, schema, dbDir = './data', options = {}) {
    this.name = name
    this.schema = schema
    this.dbDir = dbDir
    this.dbPath = path.join(dbDir, `${name}.db`)
    this.db = null
    this.pager = null
    this.bPlusTree = null
    this.MaxInternalSize = getMaxInternalSize()
    this.MaxLeafSize = getMaxLeafSize(schema.getRowSize())
    this.isOpen = false
    this.options = { immediateSync: true, ...options }
  }

  /**
   * Open/connect to the table database
   */
  async open() {
    if (this.isOpen) return

    // Ensure data directory exists
    await fs.mkdir(this.dbDir, { recursive: true })

    this.db = connectDB(this.dbPath, { immediateSync: this.options.immediateSync })
    await this.db.open()

    this.pager = await createPager(this.db, {
      schema: this.schema,
      serialize: (obj) => this.schema.serialize(obj),
      deserialize: (buffer) => this.schema.deserialize(buffer),
    })

    // Initialize B+ Tree
    this.bPlusTree = new BPlusTree(this.pager, {
      order: Math.floor(this.MaxLeafSize / 2)
    })

    // Load existing root if database has data
    if (this.pager.no > 1) {
      try {
        this.bPlusTree.root = await this.pager.page(0)
      } catch (error) {
        console.log('Creating new B+ tree root')
        this.bPlusTree.root = null
      }
    }

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
      maxInternalSize: this.MaxInternalSize,
      indexType: 'B+ Tree'
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

    // Check if key already exists
    const existing = await this.bPlusTree.search(key)
    if (existing) {
      throw new Error(`Record with key ${key} already exists`)
    }

    // Validate and serialize data
    const validatedData = this._validateData(data)
    
    // Insert using B+ tree
    await this.bPlusTree.insert(key, validatedData)
    
    return {
      success: true,
      key,
      data: validatedData
    }
  }

  /**
   * Read (select) records with various options
   */
  async read(conditions = {}) {
    if (!this.isOpen) await this.open()

    // Handle different read conditions
    if (conditions.key !== undefined) {
      // Read by primary key
      const result = await this.bPlusTree.search(conditions.key)
      return result ? [result.value] : []
    }

    if (conditions.where && (conditions.where.gte !== undefined || conditions.where.lte !== undefined)) {
      // Range query - B+ tree's strength!
      const startKey = conditions.where.gte || 0
      const endKey = conditions.where.lte || Number.MAX_SAFE_INTEGER
      const limit = conditions.limit || Infinity
      
      const results = await this.bPlusTree.rangeSearch(startKey, endKey, limit)
      return this._applyPostFiltering(results.map(r => r.value), conditions)
    }

    // Read all records (efficient with B+ tree)
    const allResults = await this.bPlusTree.getAllInOrder()
    const values = allResults.map(r => r.value)
    
    return this._applyPostFiltering(values, conditions)
  }

  /**
   * Update an existing record
   */
  async update(key, newData) {
    if (!this.isOpen) await this.open()

    // Find existing record
    const existing = await this.bPlusTree.search(key)
    if (!existing) {
      throw new Error(`Record with key ${key} not found`)
    }

    // Merge with existing data (can't change primary key)
    const keyField = this._getPrimaryKey()
    if (newData[keyField.name] && newData[keyField.name] !== key) {
      throw new Error('Cannot modify primary key')
    }

    const mergedData = { ...existing.value, ...newData }
    const validatedData = this._validateData(mergedData)

    // Update using B+ tree (delete and insert)
    await this.bPlusTree.delete(key)
    await this.bPlusTree.insert(key, validatedData)

    return {
      success: true,
      key,
      oldData: existing.value,
      newData: validatedData
    }
  }

  /**
   * Delete a record
   */
  async delete(key) {
    if (!this.isOpen) await this.open()

    // Find existing record
    const existing = await this.bPlusTree.search(key)
    if (!existing) {
      throw new Error(`Record with key ${key} not found`)
    }

    // Delete using B+ tree
    const success = await this.bPlusTree.delete(key)
    
    return {
      success,
      key,
      deletedData: existing.value
    }
  }

  /**
   * Count records in the table
   */
  async count() {
    if (!this.isOpen) await this.open()
    
    const allResults = await this.bPlusTree.getAllInOrder()
    return allResults.length
  }

  /**
   * Show B+ tree structure for debugging
   */
  async showStructure() {
    if (!this.isOpen) await this.open()
    
    console.log(`\n=== B+ Tree Structure for table: ${this.name} ===`)
    console.log(`Root: ${this.bPlusTree.root ? this.bPlusTree.root.no : 'null'}`)
    console.log(`Order: ${this.bPlusTree.order}`)
    console.log(`Max Internal Size: ${this.MaxInternalSize}`)
    console.log(`Max Leaf Size: ${this.MaxLeafSize}`)
    
    if (this.bPlusTree.root) {
      await this._printNode(this.bPlusTree.root, 0)
    }
  }

  async _printNode(node, level) {
    const indent = '  '.repeat(level)
    
    if (node.type === 'Leaf') {
      console.log(`${indent}Leaf #${node.no}: keys=[${node.keys.join(', ')}] size=${node.size} next=${node.next} prev=${node.prev}`)
    } else {
      console.log(`${indent}Internal #${node.no}: keys=[${node.keys.join(', ')}] size=${node.size} pointers=[${node.pointers.join(', ')}]`)
      
      // Print children
      for (const pointer of node.pointers) {
        if (pointer) {
          const child = await this.pager.page(pointer)
          await this._printNode(child, level + 1)
        }
      }
    }
  }

  // Helper methods
  _getPrimaryKey() {
    const fields = this.schema.getFields()
    return fields[0] // First field is always primary key by convention
  }

  _validateData(data) {
    // Use schema validation
    const fields = this.schema.getFields()
    const validatedData = {}

    for (const field of fields) {
      const value = data[field.name]
      
      if (value === undefined || value === null) {
        throw new Error(`Field '${field.name}' is required`)
      }

      // Type-specific validation could be added here
      validatedData[field.name] = value
    }

    return validatedData
  }

  _applyPostFiltering(values, conditions) {
    let results = values

    // Apply where conditions (field-based filtering)
    if (conditions.where) {
      results = results.filter(record => {
        for (const [field, expectedValue] of Object.entries(conditions.where)) {
          if (field === 'gte' || field === 'lte') continue // Already handled in range query
          
          if (record[field] !== expectedValue) {
            return false
          }
        }
        return true
      })
    }

    // Apply offset
    if (conditions.offset) {
      results = results.slice(conditions.offset)
    }

    // Apply limit
    if (conditions.limit) {
      results = results.slice(0, conditions.limit)
    }

    return results
  }
}

/**
 * Database class to manage multiple tables with B+ tree indexing
 */
class Database {
  constructor(name, dbDir = './data') {
    this.name = name
    this.dbDir = dbDir
    this.tables = new Map()
    this.isOpen = false
  }

  static async connect(name, dbDir = './data') {
    const db = new Database(name, dbDir)
    await db._ensureDirectory()
    db.isOpen = true
    return db
  }

  async _ensureDirectory() {
    await fs.mkdir(this.dbDir, { recursive: true })
  }

  async createTable(name, schema) {
    if (this.tables.has(name)) {
      throw new Error(`Table '${name}' already exists`)
    }

    const table = new Table(name, schema, this.dbDir)
    await table.open()
    
    this.tables.set(name, table)
    return table
  }

  async getTable(name) {
    if (!this.tables.has(name)) {
      // Try to load existing table
      const tablePath = path.join(this.dbDir, `${name}.db`)
      if (await fs.access(tablePath).then(() => true, () => false)) {
        throw new Error(`Table '${name}' exists but schema unknown. Use createTable with schema.`)
      } else {
        throw new Error(`Table '${name}' does not exist`)
      }
    }

    return this.tables.get(name)
  }

  async dropTable(name) {
    const table = this.tables.get(name)
    if (table) {
      await table.close()
      this.tables.delete(name)
      
      // Remove database file
      const tablePath = path.join(this.dbDir, `${name}.db`)
      try {
        await fs.unlink(tablePath)
      } catch (error) {
        // File might not exist, that's ok
      }
    }
  }

  listTables() {
    return Array.from(this.tables.keys())
  }

  getInfo() {
    return {
      name: this.name,
      directory: this.dbDir,
      tables: this.listTables(),
      indexType: 'B+ Tree',
      tablesCount: this.tables.size
    }
  }

  async close() {
    for (const table of this.tables.values()) {
      await table.close()
    }
    this.tables.clear()
    this.isOpen = false
  }
}

module.exports = {
  Database,
  Table,
  DataTypes,
  Schema,
  DefaultSchemas
}