const rl = require('readline')
const { Database, Table, DataTypes, Schema, DefaultSchemas } = require('./table')

class TableREPL {
  constructor() {
    this.db = null
    this.currentTable = null
    this.interface = null
  }

  async start() {
    console.log('=== Table-based Database REPL ===')
    console.log('Enhanced B-tree database with table support and full CRUD operations\n')
    
    this.interface = rl.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    this.showHelp()
    await this.connectToDatabase()
    this.startREPL()
  }

  showHelp() {
    console.log('Available commands:')
    console.log('  connect <db_name>              - Connect to a database')
    console.log('  create table <name> <schema>   - Create a new table')
    console.log('  use table <name>               - Switch to a table')
    console.log('  show tables                    - List all tables')
    console.log('  show schema                    - Show current table schema')
    console.log('  show structure                 - Show B-tree structure')
    console.log('')
    console.log('  insert <json_data>             - Insert a record')
    console.log('  select [conditions]            - Select records')
    console.log('  update <key> <json_data>       - Update a record')
    console.log('  delete <key>                   - Delete a record')
    console.log('  count                          - Count records in current table')
    console.log('')
    console.log('  schema <predefined_name>       - Use predefined schema')
    console.log('  help                           - Show this help')
    console.log('  quit                           - Exit')
    console.log('')
    console.log('Predefined schemas: User, Product, LogEntry, Event, KeyValue')
    console.log('')
  }

  async connectToDatabase() {
    const dbName = 'interactive_db'
    this.db = await Database.connect(dbName)
    console.log(`Connected to database: ${dbName}`)
    
    // Show existing tables
    const tables = this.db.listTables()
    if (tables.length > 0) {
      console.log(`Existing tables: ${tables.join(', ')}`)
    } else {
      console.log('No existing tables found')
    }
    console.log('')
  }

  startREPL() {
    this.interface.write('> ')

    this.interface.on('line', async (line) => {
      try {
        line = line.trim()
        if (!line) {
          this.interface.write('> ')
          return
        }

        await this.processCommand(line)
      } catch (error) {
        console.error('Error:', error.message)
      }

      this.interface.write('> ')
    })
  }

  async processCommand(line) {
    const args = this.parseCommand(line)
    const command = args[0].toLowerCase()

    switch (command) {
      case 'connect':
        await this.handleConnect(args[1])
        break

      case 'create':
        if (args[1] === 'table') {
          await this.handleCreateTable(args[2], args.slice(3).join(' '))
        } else {
          console.log('Usage: create table <name> <schema>')
        }
        break

      case 'use':
        if (args[1] === 'table') {
          await this.handleUseTable(args[2])
        } else {
          console.log('Usage: use table <name>')
        }
        break

      case 'show':
        await this.handleShow(args[1])
        break

      case 'insert':
        await this.handleInsert(args.slice(1).join(' '))
        break

      case 'select':
        await this.handleSelect(args.slice(1).join(' '))
        break

      case 'update':
        await this.handleUpdate(args[1], args.slice(2).join(' '))
        break

      case 'delete':
        await this.handleDelete(args[1])
        break

      case 'count':
        await this.handleCount()
        break

      case 'schema':
        await this.handleSchema(args[1])
        break

      case 'help':
        this.showHelp()
        break

      case 'quit':
      case 'exit':
        await this.handleQuit()
        break

      default:
        console.log(`Unknown command: ${command}. Type 'help' for available commands.`)
    }
  }

  parseCommand(line) {
    // Simple command parsing that preserves JSON strings
    const args = []
    let current = ''
    let inQuotes = false
    let braceLevel = 0

    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      
      if (char === '"' && line[i-1] !== '\\') {
        inQuotes = !inQuotes
        current += char
      } else if (char === '{' && !inQuotes) {
        braceLevel++
        current += char
      } else if (char === '}' && !inQuotes) {
        braceLevel--
        current += char
      } else if (char === ' ' && !inQuotes && braceLevel === 0) {
        if (current.trim()) {
          args.push(current.trim())
          current = ''
        }
      } else {
        current += char
      }
    }
    
    if (current.trim()) {
      args.push(current.trim())
    }

    return args
  }

  async handleConnect(dbName) {
    if (!dbName) {
      console.log('Usage: connect <db_name>')
      return
    }

    if (this.db) {
      await this.db.close()
    }

    this.db = await Database.connect(dbName)
    this.currentTable = null
    console.log(`Connected to database: ${dbName}`)
  }

  async handleCreateTable(tableName, schemaStr) {
    if (!this.db) {
      console.log('Please connect to a database first')
      return
    }

    if (!tableName || !schemaStr) {
      console.log('Usage: create table <name> <schema>')
      console.log('Example: create table users {"id": "UINT32", "name": "VARCHAR(50)", "email": "VARCHAR(100)"}')
      return
    }

    try {
      const schemaConfig = JSON.parse(schemaStr)
      const schema = this.buildSchema(schemaConfig)
      
      const table = await this.db.createTable(tableName, schema)
      console.log(`✓ Created table: ${tableName}`)
      console.log(`  Schema: ${schema.getRowSize()} bytes per record`)
      
      // Automatically switch to the new table
      this.currentTable = table
      console.log(`✓ Switched to table: ${tableName}`)
    } catch (error) {
      console.error('Failed to create table:', error.message)
    }
  }

  buildSchema(schemaConfig) {
    const fields = {}
    
    for (const [name, typeStr] of Object.entries(schemaConfig)) {
      fields[name] = this.parseDataType(typeStr)
    }
    
    return new Schema(fields)
  }

  parseDataType(typeStr) {
    const type = typeStr.toUpperCase()
    
    if (type === 'INT32') return DataTypes.INT32
    if (type === 'UINT32') return DataTypes.UINT32
    if (type === 'INT64') return DataTypes.INT64
    if (type === 'FLOAT') return DataTypes.FLOAT
    if (type === 'DOUBLE') return DataTypes.DOUBLE
    if (type === 'BOOLEAN') return DataTypes.BOOLEAN
    
    const varcharMatch = type.match(/VARCHAR\((\d+)\)/)
    if (varcharMatch) return DataTypes.VARCHAR(parseInt(varcharMatch[1]))
    
    const jsonMatch = type.match(/JSON\((\d+)\)/)
    if (jsonMatch) return DataTypes.JSON(parseInt(jsonMatch[1]))
    
    const binaryMatch = type.match(/BINARY\((\d+)\)/)
    if (binaryMatch) return DataTypes.BINARY(parseInt(binaryMatch[1]))
    
    throw new Error(`Unknown data type: ${typeStr}`)
  }

  async handleUseTable(tableName) {
    if (!this.db) {
      console.log('Please connect to a database first')
      return
    }

    try {
      this.currentTable = await this.db.getTable(tableName)
      console.log(`✓ Switched to table: ${tableName}`)
      
      const info = this.currentTable.getInfo()
      console.log(`  Schema: ${info.totalRowSize} bytes per record, ${info.schema.length} fields`)
    } catch (error) {
      console.error('Failed to switch table:', error.message)
    }
  }

  async handleShow(what) {
    if (!this.db) {
      console.log('Please connect to a database first')
      return
    }

    switch (what) {
      case 'tables':
        const tables = this.db.listTables()
        if (tables.length > 0) {
          console.log('Tables:')
          tables.forEach(table => {
            const indicator = this.currentTable && this.currentTable.name === table ? ' *' : ''
            console.log(`  - ${table}${indicator}`)
          })
        } else {
          console.log('No tables found')
        }
        break

      case 'schema':
        if (!this.currentTable) {
          console.log('No table selected. Use "use table <name>" first.')
          return
        }
        
        const info = this.currentTable.getInfo()
        console.log(`Table: ${info.name}`)
        console.log(`Row size: ${info.totalRowSize} bytes`)
        console.log('Fields:')
        info.schema.forEach(field => {
          console.log(`  - ${field.name}: ${field.type} (${field.size} bytes)`)
        })
        break

      case 'structure':
        if (!this.currentTable) {
          console.log('No table selected. Use "use table <name>" first.')
          return
        }
        await this.currentTable.showStructure()
        break

      default:
        console.log('Usage: show [tables|schema|structure]')
    }
  }

  async handleInsert(dataStr) {
    if (!this.currentTable) {
      console.log('No table selected. Use "use table <name>" first.')
      return
    }

    if (!dataStr) {
      console.log('Usage: insert <json_data>')
      console.log('Example: insert {"id": 1, "name": "John", "email": "john@example.com"}')
      return
    }

    try {
      const data = JSON.parse(dataStr)
      const result = await this.currentTable.create(data)
      console.log(`✓ Inserted record with key: ${result.key}`)
    } catch (error) {
      console.error('Insert failed:', error.message)
    }
  }

  async handleSelect(conditionsStr) {
    if (!this.currentTable) {
      console.log('No table selected. Use "use table <name>" first.')
      return
    }

    try {
      let conditions = {}
      
      if (conditionsStr.trim()) {
        // Parse conditions (simplified)
        if (conditionsStr.startsWith('{')) {
          conditions = JSON.parse(conditionsStr)
        } else {
          // Simple key lookup
          const key = parseInt(conditionsStr)
          if (!isNaN(key)) {
            conditions = { key }
          }
        }
      }

      const results = await this.currentTable.read(conditions)
      
      if (results.length === 0) {
        console.log('No records found')
      } else {
        console.log(`Found ${results.length} record(s):`)
        results.forEach((record, index) => {
          console.log(`  ${index + 1}. Key: ${record.key}`)
          console.log(`     Data: ${JSON.stringify(record.data, null, 2).replace(/\n/g, '\n     ')}`)
        })
      }
    } catch (error) {
      console.error('Select failed:', error.message)
    }
  }

  async handleUpdate(keyStr, dataStr) {
    if (!this.currentTable) {
      console.log('No table selected. Use "use table <name>" first.')
      return
    }

    if (!keyStr || !dataStr) {
      console.log('Usage: update <key> <json_data>')
      console.log('Example: update 1 {"name": "John Updated", "email": "john.new@example.com"}')
      return
    }

    try {
      const key = parseInt(keyStr)
      const data = JSON.parse(dataStr)
      
      const result = await this.currentTable.update(key, data)
      console.log(`✓ Updated record with key: ${result.key}`)
      console.log(`  Changed fields: ${Object.keys(data).join(', ')}`)
    } catch (error) {
      console.error('Update failed:', error.message)
    }
  }

  async handleDelete(keyStr) {
    if (!this.currentTable) {
      console.log('No table selected. Use "use table <name>" first.')
      return
    }

    if (!keyStr) {
      console.log('Usage: delete <key>')
      return
    }

    try {
      const key = parseInt(keyStr)
      const result = await this.currentTable.delete(key)
      console.log(`✓ Deleted record with key: ${result.key}`)
    } catch (error) {
      console.error('Delete failed:', error.message)
    }
  }

  async handleCount() {
    if (!this.currentTable) {
      console.log('No table selected. Use "use table <name>" first.')
      return
    }

    try {
      const count = await this.currentTable.count()
      console.log(`Total records: ${count}`)
    } catch (error) {
      console.error('Count failed:', error.message)
    }
  }

  async handleSchema(schemaName) {
    if (!this.db) {
      console.log('Please connect to a database first')
      return
    }

    if (!schemaName) {
      console.log('Available predefined schemas:')
      Object.keys(DefaultSchemas).forEach(name => {
        const schema = DefaultSchemas[name]
        console.log(`  - ${name}: ${schema.getRowSize()} bytes`)
      })
      return
    }

    if (!DefaultSchemas[schemaName]) {
      console.log(`Unknown schema: ${schemaName}`)
      return
    }

    try {
      const tableName = schemaName.toLowerCase()
      const table = await this.db.createTable(tableName, DefaultSchemas[schemaName])
      this.currentTable = table
      
      console.log(`✓ Created table '${tableName}' with ${schemaName} schema`)
      console.log(`✓ Switched to table: ${tableName}`)
      
      const info = table.getInfo()
      console.log(`  Schema: ${info.totalRowSize} bytes per record`)
    } catch (error) {
      if (error.message.includes('already exists')) {
        // Table exists, just switch to it
        try {
          this.currentTable = await this.db.getTable(schemaName.toLowerCase())
          console.log(`✓ Switched to existing table: ${schemaName.toLowerCase()}`)
        } catch (switchError) {
          console.error('Failed to switch to table:', switchError.message)
        }
      } else {
        console.error('Failed to create table:', error.message)
      }
    }
  }

  async handleQuit() {
    console.log('Closing database...')
    if (this.db) {
      await this.db.close()
    }
    this.interface.close()
    process.exit(0)
  }
}

// Start the REPL
if (require.main === module) {
  const repl = new TableREPL()
  repl.start().catch(console.error)
}

module.exports = TableREPL