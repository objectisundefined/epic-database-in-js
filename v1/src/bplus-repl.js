const readline = require('readline')
const { Database, DataTypes, Schema, DefaultSchemas } = require('./table-bplus')

class BPlusTreeREPL {
  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: 'bplus> '
    })
    
    this.database = null
    this.currentTable = null
    this.isConnected = false
  }

  start() {
    console.log('╔════════════════════════════════════════════════════════════════╗')
    console.log('║              B+ Tree Database Interactive REPL                ║')
    console.log('║                                                                ║')
    console.log('║  Enhanced with B+ Tree indexing for better range queries      ║')
    console.log('║  Type "help" for available commands                           ║')
    console.log('╚════════════════════════════════════════════════════════════════╝')
    console.log()

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
          await this.connectDB(args[1])
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
        case 'structure':
          await this.handleStructure()
          break
        case 'benchmark':
          await this.handleBenchmark(args.slice(1))
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
║                    B+ Tree Database Commands                   ║
╠════════════════════════════════════════════════════════════════╣
║ Database Operations:                                           ║
║   connect <db_name>              Connect to a database         ║
║   show tables                    List all tables               ║
║   show schema                    Show current table schema     ║
║   show structure                 Show B+ tree structure        ║
║                                                                ║
║ Table Operations:                                              ║
║   create table <name> <schema>   Create a new table            ║
║   use table <name>               Switch to a table             ║
║   schema <predefined_name>       Use predefined schema         ║
║                                                                ║
║ Data Operations (B+ Tree Optimized):                          ║
║   insert <json_data>             Insert a record               ║
║   select [conditions]            Select records                ║
║   range <start> <end> [limit]    Efficient range query         ║
║   update <key> <json_data>       Update a record               ║
║   delete <key>                   Delete a record               ║
║   count                          Count records                 ║
║                                                                ║
║ B+ Tree Specific:                                              ║
║   structure                      Show B+ tree structure        ║
║   benchmark <operation> <count>  Performance benchmarks        ║
║                                                                ║
║ System:                                                        ║
║   help                           Show this help                ║
║   quit                           Exit REPL                     ║
╚════════════════════════════════════════════════════════════════╝

Examples:
  > connect my_database
  > create table users {"id": "UINT32", "name": "VARCHAR(50)", "email": "VARCHAR(100)"}
  > insert {"id": 1, "name": "John", "email": "john@example.com"}
  > range 1 100 10                 # Get IDs 1-100, limit 10
  > select {"where": {"gte": 50, "lte": 150}}  # Range query
  > benchmark insert 1000          # Benchmark 1000 inserts
`)
  }

  async connectDB(dbName) {
    if (!dbName) {
      console.log('Usage: connect <database_name>')
      return
    }

    if (this.database) {
      await this.database.close()
    }

    this.database = await Database.connect(dbName, './data')
    this.isConnected = true
    console.log(`✓ Connected to database: ${dbName}`)
    console.log(`  Directory: ./data`)
    console.log(`  Index Type: B+ Tree`)
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
        console.log(`\nTable: ${info.name} (B+ Tree Index)`)
        console.log(`Total Row Size: ${info.totalRowSize} bytes`)
        console.log(`Max Leaf Size: ${info.maxLeafSize} records`)
        console.log(`Max Internal Size: ${info.maxInternalSize} keys`)
        console.log('\nSchema:')
        info.schema.forEach(field => {
          console.log(`  ${field.name}: ${field.type} (${field.size} bytes)`)
        })
        break

      case 'structure':
        await this.handleStructure()
        break

      default:
        console.log('Usage: show [tables|schema|structure]')
    }
  }

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
      console.log(`✓ Created table: ${tableName} with B+ Tree indexing`)
      
      this.currentTable = table
      console.log(`✓ Switched to table: ${tableName}`)
      
    } catch (error) {
      console.error(`Failed to create table: ${error.message}`)
    }
  }

  async handleUse(args) {
    if (!this.isConnected) {
      console.log('Please connect to a database first')
      return
    }

    if (args[0] !== 'table' || !args[1]) {
      console.log('Usage: use table <name>')
      return
    }

    try {
      this.currentTable = await this.database.getTable(args[1])
      console.log(`✓ Switched to table: ${args[1]}`)
    } catch (error) {
      console.error(`Failed to switch table: ${error.message}`)
    }
  }

  async handleSchema(schemaName) {
    if (!this.isConnected) {
      console.log('Please connect to a database first')
      return
    }

    if (!schemaName) {
      console.log('Available predefined schemas: User, Product, Event, LogEntry, KeyValue')
      return
    }

    if (!DefaultSchemas[schemaName]) {
      console.log(`Unknown schema: ${schemaName}`)
      return
    }

    const tableName = schemaName.toLowerCase()
    try {
      const table = await this.database.createTable(tableName, DefaultSchemas[schemaName])
      this.currentTable = table
      console.log(`✓ Created table: ${tableName} using ${schemaName} schema`)
    } catch (error) {
      console.error(`Failed to create table: ${error.message}`)
    }
  }

  async handleInsert(jsonData) {
    if (!this.currentTable) {
      console.log('Please select a table first')
      return
    }

    try {
      const data = JSON.parse(jsonData)
      const result = await this.currentTable.create(data)
      console.log(`✓ Inserted record with key: ${result.key}`)
    } catch (error) {
      console.error(`Insert failed: ${error.message}`)
    }
  }

  async handleSelect(conditions) {
    if (!this.currentTable) {
      console.log('Please select a table first')
      return
    }

    try {
      let query = {}
      
      if (conditions) {
        if (conditions.match(/^\d+$/)) {
          // Single key lookup
          query = { key: parseInt(conditions) }
        } else {
          // JSON conditions
          query = JSON.parse(conditions)
        }
      }

      const results = await this.currentTable.read(query)
      
      console.log(`\nFound ${results.length} record(s):`)
      results.forEach((record, index) => {
        console.log(`${index + 1}. ${JSON.stringify(record, null, 2)}`)
      })
    } catch (error) {
      console.error(`Select failed: ${error.message}`)
    }
  }

  async handleRange(args) {
    if (!this.currentTable) {
      console.log('Please select a table first')
      return
    }

    if (args.length < 2) {
      console.log('Usage: range <start_key> <end_key> [limit]')
      return
    }

    try {
      const startKey = parseInt(args[0])
      const endKey = parseInt(args[1])
      const limit = args[2] ? parseInt(args[2]) : undefined

      const query = {
        where: { gte: startKey, lte: endKey }
      }
      
      if (limit) {
        query.limit = limit
      }

      console.log(`🔍 B+ Tree Range Query: ${startKey} to ${endKey}${limit ? ` (limit: ${limit})` : ''}`)
      
      const startTime = performance.now()
      const results = await this.currentTable.read(query)
      const endTime = performance.now()
      
      console.log(`\n✓ Found ${results.length} record(s) in ${(endTime - startTime).toFixed(2)}ms`)
      console.log('B+ Tree efficiently traversed linked leaf nodes for range query')
      
      results.forEach((record, index) => {
        if (index < 10) { // Show first 10 results
          console.log(`${index + 1}. ${JSON.stringify(record, null, 2)}`)
        }
      })
      
      if (results.length > 10) {
        console.log(`... and ${results.length - 10} more records`)
      }
    } catch (error) {
      console.error(`Range query failed: ${error.message}`)
    }
  }

  async handleUpdate(args) {
    if (!this.currentTable) {
      console.log('Please select a table first')
      return
    }

    if (args.length < 2) {
      console.log('Usage: update <key> <json_data>')
      return
    }

    try {
      const key = parseInt(args[0])
      const jsonData = args.slice(1).join(' ')
      const data = JSON.parse(jsonData)
      
      const result = await this.currentTable.update(key, data)
      console.log(`✓ Updated record with key: ${result.key}`)
    } catch (error) {
      console.error(`Update failed: ${error.message}`)
    }
  }

  async handleDelete(key) {
    if (!this.currentTable) {
      console.log('Please select a table first')
      return
    }

    if (!key) {
      console.log('Usage: delete <key>')
      return
    }

    try {
      const result = await this.currentTable.delete(parseInt(key))
      console.log(`✓ Deleted record with key: ${result.key}`)
    } catch (error) {
      console.error(`Delete failed: ${error.message}`)
    }
  }

  async handleCount() {
    if (!this.currentTable) {
      console.log('Please select a table first')
      return
    }

    try {
      const count = await this.currentTable.count()
      console.log(`Total records: ${count}`)
    } catch (error) {
      console.error(`Count failed: ${error.message}`)
    }
  }

  async handleStructure() {
    if (!this.currentTable) {
      console.log('Please select a table first')
      return
    }

    try {
      await this.currentTable.showStructure()
    } catch (error) {
      console.error(`Structure display failed: ${error.message}`)
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

    console.log(`🏃 Starting B+ Tree benchmark: ${operation} x ${count}`)
    
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
        case 'delete':
          await this.benchmarkDelete(count)
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
        id: Date.now() + i, // Ensure unique keys
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
    
    console.log(`\n✓ B+ Tree Insert Benchmark Complete:`)
    console.log(`  Total time: ${totalTime.toFixed(2)}ms`)
    console.log(`  Average per insert: ${avgTime.toFixed(2)}ms`)
    console.log(`  Operations per second: ${(1000/avgTime).toFixed(0)}`)
  }

  async benchmarkRange(count) {
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
    
    console.log(`\n✓ B+ Tree Range Query Benchmark Complete:`)
    console.log(`  Total time: ${totalTime.toFixed(2)}ms`)
    console.log(`  Average per range query: ${avgTime.toFixed(2)}ms`)
    console.log(`  Range queries per second: ${(1000/avgTime).toFixed(0)}`)
    console.log(`  B+ Tree's linked leaves provide excellent range performance!`)
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

// Start the REPL
if (require.main === module) {
  const repl = new BPlusTreeREPL()
  repl.start()
}

module.exports = BPlusTreeREPL