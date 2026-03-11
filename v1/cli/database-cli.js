#!/usr/bin/env node

/**
 * Database CLI - Unified Command Line Interface
 * 
 * Provides a command-line interface for both B-tree and B+ tree databases.
 * Supports all database operations with an intuitive command structure.
 */

const readline = require('readline')
const { Database, Schema, DataTypes, DefaultSchemas } = require('../lib/index')

class DatabaseCLI {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'db> '
    })
    
    this.database = null
    this.currentTable = null
    this.isConnected = false
    this.indexType = 'bplus' // Default to B+ tree
  }

  start() {
    this.showWelcome()
    this.rl.prompt()

    this.rl.on('line', async (input) => {
      await this.processCommand(input.trim())
      this.rl.prompt()
    })

    this.rl.on('close', async () => {
      if (this.database) {
        await this.database.close()
      }
      console.log('\nGoodbye!')
      process.exit(0)
    })
  }

  showWelcome() {
    console.log('╔════════════════════════════════════════════════════════════════╗')
    console.log('║                    Database CLI v2.0                          ║')
    console.log('║                                                                ║')
    console.log('║  Unified interface for B-tree and B+ tree databases           ║')
    console.log('║  Type "help" for available commands                           ║')
    console.log('╚════════════════════════════════════════════════════════════════╝')
    console.log()
  }

  async processCommand(input) {
    if (!input) return

    const args = this.parseCommand(input)
    const command = args[0].toLowerCase()

    try {
      switch (command) {
        case 'help':
          this.showHelp()
          break
        case 'connect':
          await this.connectDB(args[1], args[2])
          break
        case 'index':
          await this.setIndexType(args[1])
          break
        case 'show':
          await this.handleShow(args.slice(1))
          break
        case 'create':
          await this.handleCreate(args.slice(1))
          break
        case 'use':
          await this.handleUse(args.slice(1))
          break
        case 'schema':
          await this.handleSchema(args[1])
          break
        case 'insert':
          await this.handleInsert(args.slice(1).join(' '))
          break
        case 'select':
          await this.handleSelect(args.slice(1).join(' '))
          break
        case 'range':
          await this.handleRange(args.slice(1))
          break
        case 'update':
          await this.handleUpdate(args.slice(1))
          break
        case 'delete':
          await this.handleDelete(args[1])
          break
        case 'count':
          await this.handleCount()
          break
        case 'stats':
          await this.handleStats()
          break
        case 'benchmark':
          await this.handleBenchmark(args.slice(1))
          break
        case 'export':
          await this.handleExport(args.slice(1))
          break
        case 'import':
          await this.handleImport(args.slice(1))
          break
        case 'quit':
        case 'exit':
          this.rl.close()
          break
        default:
          console.log(`Unknown command: ${command}. Type "help" for available commands.`)
      }
    } catch (error) {
      console.error(`Error: ${error.message}`)
    }
  }

  parseCommand(input) {
    const args = []
    let current = ''
    let inQuotes = false

    for (let i = 0; i < input.length; i++) {
      const char = input[i]
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes
      } else if (char === ' ' && !inQuotes) {
        if (current) {
          args.push(current)
          current = ''
        }
      } else {
        current += char
      }
    }

    if (current) {
      args.push(current)
    }

    return args
  }

  showHelp() {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                        Database CLI Commands                   ║
╠════════════════════════════════════════════════════════════════╣
║ Connection & Setup:                                            ║
║   connect <db_name> [index_type]   Connect to database         ║
║   index <btree|bplus>              Set index type              ║
║   show databases                   List databases              ║
║   show tables                      List tables                 ║
║   show schema                      Show current table schema   ║
║   stats                            Show database statistics    ║
║                                                                ║
║ Table Operations:                                              ║
║   create table <name> <schema>     Create new table            ║
║   use table <name>                 Switch to table             ║
║   schema <predefined_name>         Use predefined schema       ║
║                                                                ║
║ Data Operations:                                               ║
║   insert <json_data>               Insert record               ║
║   select [conditions]              Select records              ║
║   range <start> <end> [limit]      Range query (B+ tree)       ║
║   update <key> <json_data>         Update record               ║
║   delete <key>                     Delete record               ║
║   count                            Count records               ║
║                                                                ║
║ Performance & Utilities:                                       ║
║   benchmark <operation> <count>    Run benchmarks              ║
║   export <table> <file>            Export table data           ║
║   import <table> <file>            Import table data           ║
║                                                                ║
║ System:                                                        ║
║   help                             Show this help              ║
║   quit                             Exit CLI                    ║
╚════════════════════════════════════════════════════════════════╝

Examples:
  connect mydb bplus
  create table users {"id": "UINT32", "name": "VARCHAR(50)", "email": "VARCHAR(100)"}
  insert {"id": 1, "name": "John", "email": "john@example.com"}
  range 1 100 10
  benchmark range 1000
`)
  }

  async connectDB(dbName, indexType = this.indexType) {
    if (!dbName) {
      console.log('Usage: connect <database_name> [index_type]')
      return
    }

    if (indexType && !['btree', 'bplus'].includes(indexType)) {
      console.log('Index type must be "btree" or "bplus"')
      return
    }

    if (this.database) {
      await this.database.close()
    }

    this.indexType = indexType
    this.database = new Database(dbName, './data', { indexType: this.indexType })
    await this.database.connect()
    this.isConnected = true
    
    console.log(`✓ Connected to database: ${dbName}`)
    console.log(`  Index Type: ${this.indexType === 'bplus' ? 'B+ Tree' : 'B-Tree'}`)
    console.log(`  Directory: ./data`)
  }

  async setIndexType(type) {
    if (!type || !['btree', 'bplus'].includes(type)) {
      console.log('Usage: index <btree|bplus>')
      console.log(`Current index type: ${this.indexType}`)
      return
    }

    if (this.database && this.database.tables.size > 0) {
      console.log('Cannot change index type with open tables. Close database first.')
      return
    }

    this.indexType = type
    console.log(`✓ Index type set to: ${type === 'bplus' ? 'B+ Tree' : 'B-Tree'}`)
  }

  async handleShow(args) {
    if (!this.isConnected) {
      console.log('Please connect to a database first')
      return
    }

    const subCommand = args[0]

    switch (subCommand) {
      case 'tables':
        const tables = this.database.listTables()
        console.log(`\nTables (${tables.length}):`)
        tables.forEach(table => console.log(`  - ${table}`))
        break

      case 'schema':
        if (!this.currentTable) {
          console.log('Please select a table first (use table <name>)')
          return
        }
        const info = this.currentTable.getInfo()
        console.log(`\nTable: ${info.name} (${info.indexType || 'Unknown'} Index)`)
        console.log(`Total Row Size: ${info.totalRowSize} bytes`)
        console.log('\nSchema:')
        info.schema.forEach(field => {
          console.log(`  ${field.name}: ${field.type} (${field.size} bytes)`)
        })
        break

      default:
        console.log('Usage: show [tables|schema]')
    }
  }

  async handleStats() {
    if (!this.isConnected) {
      console.log('Please connect to a database first')
      return
    }

    const stats = await this.database.getStats()
    
    console.log('\n📊 Database Statistics:')
    console.log(`Database: ${stats.database.name}`)
    console.log(`Index Type: ${stats.database.indexType}`)
    console.log(`Tables: ${stats.database.tablesCount}`)
    console.log()

    for (const [tableName, tableStats] of Object.entries(stats.tables)) {
      console.log(`Table: ${tableName}`)
      console.log(`  Records: ${tableStats.recordCount}`)
      console.log(`  Row Size: ${tableStats.info.totalRowSize} bytes`)
      if (tableStats.info.maxLeafSize) {
        console.log(`  Max Leaf Size: ${tableStats.info.maxLeafSize}`)
      }
      console.log()
    }
  }

  async handleBenchmark(args) {
    if (!this.currentTable) {
      console.log('Please select a table first')
      return
    }

    const operation = args[0]
    const count = parseInt(args[1]) || 100

    if (!operation) {
      console.log('Usage: benchmark <insert|select|range|delete> <count>')
      return
    }

    console.log(`🏃 Starting ${this.indexType.toUpperCase()} benchmark: ${operation} x ${count}`)
    
    try {
      switch (operation) {
        case 'insert':
          await this.benchmarkInsert(count)
          break
        case 'select':
          await this.benchmarkSelect(count)
          break
        case 'range':
          await this.benchmarkRange(count)
          break
        default:
          console.log('Unknown benchmark operation')
      }
    } catch (error) {
      console.error(`Benchmark failed: ${error.message}`)
    }
  }

  async benchmarkInsert(count) {
    console.log(`Inserting ${count} records...`)
    
    const startTime = performance.now()
    
    for (let i = 1; i <= count; i++) {
      const data = {
        id: Date.now() + i,
        name: `User${i}`,
        email: `user${i}@example.com`
      }
      
      await this.currentTable.create(data)
      
      if (i % Math.max(1, Math.floor(count / 10)) === 0) {
        console.log(`  Progress: ${i}/${count} (${((i/count)*100).toFixed(1)}%)`)
      }
    }
    
    const endTime = performance.now()
    const totalTime = endTime - startTime
    const avgTime = totalTime / count
    
    console.log(`\n✓ ${this.indexType.toUpperCase()} Insert Benchmark Complete:`)
    console.log(`  Total time: ${totalTime.toFixed(2)}ms`)
    console.log(`  Average per insert: ${avgTime.toFixed(2)}ms`)
    console.log(`  Operations per second: ${(1000/avgTime).toFixed(0)}`)
  }

  async benchmarkRange(count) {
    if (this.indexType !== 'bplus') {
      console.log('Range benchmark is optimized for B+ Tree. Current index:', this.indexType)
    }

    console.log(`Performing ${count} range queries...`)
    
    const startTime = performance.now()
    
    for (let i = 0; i < count; i++) {
      const start = Math.floor(Math.random() * 1000)
      const end = start + Math.floor(Math.random() * 100)
      
      await this.currentTable.read({
        where: { gte: start, lte: end },
        limit: 50
      })
    }
    
    const endTime = performance.now()
    const totalTime = endTime - startTime
    const avgTime = totalTime / count
    
    console.log(`\n✓ ${this.indexType.toUpperCase()} Range Query Benchmark Complete:`)
    console.log(`  Total time: ${totalTime.toFixed(2)}ms`)
    console.log(`  Average per range query: ${avgTime.toFixed(2)}ms`)
    console.log(`  Range queries per second: ${(1000/avgTime).toFixed(0)}`)
    
    if (this.indexType === 'bplus') {
      console.log(`  B+ Tree's linked leaves provide excellent range performance!`)
    }
  }

  // Additional methods for create, use, schema, insert, select, etc.
  // (Similar to the existing REPL implementations but unified)

  async handleCreate(args) {
    if (!this.isConnected) {
      console.log('Please connect to a database first')
      return
    }

    if (args[0] !== 'table' || args.length < 3) {
      console.log('Usage: create table <name> <schema_json>')
      return
    }

    const tableName = args[1]
    const schemaJson = args.slice(2).join(' ')

    try {
      const schemaData = JSON.parse(schemaJson)
      const schema = this.createSchemaFromJson(schemaData)
      
      const table = await this.database.createTable(tableName, schema)
      console.log(`✓ Created table: ${tableName} with ${this.indexType.toUpperCase()} indexing`)
      
      this.currentTable = table
      console.log(`✓ Switched to table: ${tableName}`)
      
    } catch (error) {
      console.error(`Failed to create table: ${error.message}`)
    }
  }

  createSchemaFromJson(schemaData) {
    const fields = {}
    
    for (const [fieldName, typeString] of Object.entries(schemaData)) {
      fields[fieldName] = this.parseDataType(typeString)
    }
    
    return new Schema(fields)
  }

  parseDataType(typeString) {
    if (typeString === 'INT32') return DataTypes.INT32
    if (typeString === 'UINT32') return DataTypes.UINT32
    if (typeString === 'INT64') return DataTypes.INT64
    if (typeString === 'FLOAT') return DataTypes.FLOAT
    if (typeString === 'DOUBLE') return DataTypes.DOUBLE
    if (typeString === 'BOOLEAN') return DataTypes.BOOLEAN
    
    const varcharMatch = typeString.match(/VARCHAR\((\d+)\)/)
    if (varcharMatch) {
      return DataTypes.VARCHAR(parseInt(varcharMatch[1]))
    }
    
    const jsonMatch = typeString.match(/JSON\((\d+)\)/)
    if (jsonMatch) {
      return DataTypes.JSON(parseInt(jsonMatch[1]))
    }
    
    const binaryMatch = typeString.match(/BINARY\((\d+)\)/)
    if (binaryMatch) {
      return DataTypes.BINARY(parseInt(binaryMatch[1]))
    }
    
    throw new Error(`Unknown data type: ${typeString}`)
  }
}

// Start the CLI if run directly
if (require.main === module) {
  const cli = new DatabaseCLI()
  cli.start()
}

module.exports = DatabaseCLI