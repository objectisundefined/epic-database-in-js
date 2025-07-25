/**
 * Unified Database Class
 * 
 * Supports both B-tree and B+ tree indexing with a consistent API.
 * B+ tree is recommended for better range query performance.
 */

const path = require('path')
const fs = require('fs/promises')

// Import both table implementations
const BTreeTable = require('../../src/table')
const BPlusTable = require('./table')

class Database {
  constructor(name, dbDir = './data', options = {}) {
    this.name = name
    this.dbDir = dbDir
    this.indexType = options.indexType || 'bplus' // Default to B+ tree
    this.tables = new Map()
    this.isConnected = false
    this.options = {
      immediateSync: true,
      ...options
    }
  }

  /**
   * Connect to the database
   */
  async connect() {
    if (this.isConnected) return

    // Ensure data directory exists
    await fs.mkdir(this.dbDir, { recursive: true })
    
    this.isConnected = true
    console.log(`📦 Connected to database: ${this.name}`)
    console.log(`   Index Type: ${this.indexType === 'bplus' ? 'B+ Tree' : 'B-Tree'}`)
    console.log(`   Directory: ${this.dbDir}`)
  }

  /**
   * Create a new table
   */
  async createTable(name, schema, tableOptions = {}) {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call connect() first.')
    }

    if (this.tables.has(name)) {
      throw new Error(`Table '${name}' already exists`)
    }

    // Create table using appropriate implementation
    let table
    
    if (this.indexType === 'bplus') {
      table = new BPlusTable(name, schema, this.dbDir, {
        ...this.options,
        ...tableOptions
      })
    } else {
      // Use original B-tree implementation
      const { Table: OriginalTable } = require('../../src/table')
      table = new OriginalTable(name, schema, this.dbDir, {
        ...this.options,
        ...tableOptions
      })
    }

    await table.open()
    this.tables.set(name, table)
    
    return table
  }

  /**
   * Get an existing table
   */
  async getTable(name) {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call connect() first.')
    }

    if (!this.tables.has(name)) {
      // Try to load existing table
      const tablePath = path.join(this.dbDir, `${name}.db`)
      
      try {
        await fs.access(tablePath)
        throw new Error(`Table '${name}' exists but schema unknown. Use createTable with schema.`)
      } catch (accessError) {
        if (accessError.code === 'ENOENT') {
          throw new Error(`Table '${name}' does not exist`)
        }
        throw accessError
      }
    }

    return this.tables.get(name)
  }

  /**
   * Drop a table
   */
  async dropTable(name) {
    if (!this.isConnected) {
      throw new Error('Database not connected. Call connect() first.')
    }

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

  /**
   * List all tables
   */
  listTables() {
    return Array.from(this.tables.keys())
  }

  /**
   * Get database information
   */
  getInfo() {
    return {
      name: this.name,
      directory: this.dbDir,
      indexType: this.indexType === 'bplus' ? 'B+ Tree' : 'B-Tree',
      tables: this.listTables(),
      tablesCount: this.tables.size,
      isConnected: this.isConnected,
      options: this.options
    }
  }

  /**
   * Close database and all tables
   */
  async close() {
    if (!this.isConnected) return

    for (const table of this.tables.values()) {
      await table.close()
    }
    
    this.tables.clear()
    this.isConnected = false
    
    console.log(`📦 Closed database: ${this.name}`)
  }

  /**
   * Switch index type (for existing database)
   */
  async switchIndexType(newIndexType) {
    if (newIndexType !== 'btree' && newIndexType !== 'bplus') {
      throw new Error('Index type must be "btree" or "bplus"')
    }

    if (this.tables.size > 0) {
      throw new Error('Cannot switch index type with open tables. Close all tables first.')
    }

    this.indexType = newIndexType
    console.log(`🔄 Switched to ${newIndexType === 'bplus' ? 'B+ Tree' : 'B-Tree'} indexing`)
  }

  /**
   * Get performance statistics
   */
  async getStats() {
    const stats = {
      database: this.getInfo(),
      tables: {}
    }

    for (const [name, table] of this.tables) {
      stats.tables[name] = {
        info: table.getInfo(),
        recordCount: await table.count()
      }
    }

    return stats
  }
}

module.exports = Database