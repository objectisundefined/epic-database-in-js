/**
 * Database Socket Server
 * 
 * Provides socket-based access to the B+ tree database system.
 */

const net = require('net')
const EventEmitter = require('events')
const Database = require('../core/database')
const { Schema, DataTypes } = require('../schema/index')
const {
  MESSAGE_TYPES,
  ERROR_CODES,
  createMessage,
  createErrorResponse,
  createSuccessResponse,
  parseMessage,
  serializeMessage,
  generateId
} = require('./protocol')

class DatabaseServer extends EventEmitter {
  constructor(options = {}) {
    super()
    
    this.port = options.port || 3306
    this.host = options.host || 'localhost'
    this.maxConnections = options.maxConnections || 100
    this.requireAuth = options.requireAuth || false
    this.credentials = options.credentials || new Map()
    this.dbDir = options.dbDir || './data'
    this.dbOptions = options.dbOptions || {}
    
    this.server = null
    this.clients = new Map()
    this.databases = new Map()
    this.isRunning = false
    
    // Authentication sessions
    this.sessions = new Map()
    this.sessionTimeout = options.sessionTimeout || 3600000 // 1 hour
  }

  /**
   * Start the database server
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Server is already running')
    }

    this.server = net.createServer()
    
    this.server.on('connection', (socket) => {
      this.handleConnection(socket)
    })
    
    this.server.on('error', (err) => {
      console.error('Server error:', err)
      this.emit('error', err)
    })

    return new Promise((resolve, reject) => {
      this.server.listen(this.port, this.host, (err) => {
        if (err) {
          reject(err)
          return
        }
        
        this.isRunning = true
        console.log(`🚀 Database server listening on ${this.host}:${this.port}`)
        console.log(`   Max connections: ${this.maxConnections}`)
        console.log(`   Authentication: ${this.requireAuth ? 'enabled' : 'disabled'}`)
        
        this.emit('listening')
        resolve()
      })
    })
  }

  /**
   * Stop the database server
   */
  async stop() {
    if (!this.isRunning) return

    // Close all client connections
    for (const client of this.clients.values()) {
      client.socket.destroy()
    }
    
    // Close all databases
    for (const db of this.databases.values()) {
      await db.disconnect()
    }

    return new Promise((resolve) => {
      this.server.close(() => {
        this.isRunning = false
        console.log('📦 Database server stopped')
        this.emit('stopped')
        resolve()
      })
    })
  }

  /**
   * Handle new client connection
   */
  handleConnection(socket) {
    if (this.clients.size >= this.maxConnections) {
      console.log('Connection rejected: max connections reached')
      socket.destroy()
      return
    }

    const clientId = generateId()
    const client = {
      id: clientId,
      socket: socket,
      authenticated: !this.requireAuth,
      sessionId: null,
      database: null,
      connectedAt: Date.now(),
      lastActivity: Date.now()
    }

    this.clients.set(clientId, client)
    
    console.log(`📱 Client connected: ${clientId} (${this.clients.size}/${this.maxConnections})`)

    // Handle incoming messages
    socket.on('data', (data) => {
      this.handleMessage(client, data.toString())
    })

    // Handle client disconnect
    socket.on('close', () => {
      this.handleDisconnect(client)
    })

    socket.on('error', (err) => {
      console.error(`Client ${clientId} error:`, err)
      this.handleDisconnect(client)
    })

    // Send connection acknowledgment
    this.sendMessage(client, createMessage(MESSAGE_TYPES.CONNECT_ACK, {
      clientId,
      serverVersion: '2.0.0',
      requiresAuth: this.requireAuth
    }))
  }

  /**
   * Handle client disconnect
   */
  handleDisconnect(client) {
    console.log(`📱 Client disconnected: ${client.id}`)
    
    if (client.sessionId) {
      this.sessions.delete(client.sessionId)
    }
    
    this.clients.delete(client.id)
    this.emit('clientDisconnected', client.id)
  }

  /**
   * Handle incoming message from client
   */
  async handleMessage(client, data) {
    client.lastActivity = Date.now()
    
    const parsed = parseMessage(data)
    if (parsed.error) {
      this.sendMessage(client, parsed.error)
      return
    }

    const message = parsed.message
    
    try {
      await this.processMessage(client, message)
    } catch (err) {
      console.error('Error processing message:', err)
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.UNKNOWN_ERROR,
        err.message
      ))
    }
  }

  /**
   * Process client message
   */
  async processMessage(client, message) {
    // Check authentication for protected operations
    if (this.requireAuth && !client.authenticated && 
        message.type !== MESSAGE_TYPES.AUTH && 
        message.type !== MESSAGE_TYPES.PING) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.AUTHENTICATION_FAILED,
        'Authentication required'
      ))
      return
    }

    switch (message.type) {
      case MESSAGE_TYPES.AUTH:
        await this.handleAuth(client, message)
        break
        
      case MESSAGE_TYPES.CONNECT:
        await this.handleConnect(client, message)
        break
        
      case MESSAGE_TYPES.CREATE_TABLE:
        await this.handleCreateTable(client, message)
        break
        
      case MESSAGE_TYPES.GET_TABLE:
        await this.handleGetTable(client, message)
        break
        
      case MESSAGE_TYPES.LIST_TABLES:
        await this.handleListTables(client, message)
        break
        
      case MESSAGE_TYPES.INSERT:
        await this.handleInsert(client, message)
        break
        
      case MESSAGE_TYPES.SELECT:
        await this.handleSelect(client, message)
        break
        
      case MESSAGE_TYPES.UPDATE:
        await this.handleUpdate(client, message)
        break
        
      case MESSAGE_TYPES.DELETE:
        await this.handleDelete(client, message)
        break
        
      case MESSAGE_TYPES.COUNT:
        await this.handleCount(client, message)
        break
        
      case MESSAGE_TYPES.RANGE_QUERY:
        await this.handleRangeQuery(client, message)
        break
        
      case MESSAGE_TYPES.PING:
        this.sendMessage(client, createMessage(MESSAGE_TYPES.PONG, {}, message.id))
        break
        
      default:
        this.sendMessage(client, createErrorResponse(
          message.id,
          ERROR_CODES.INVALID_MESSAGE,
          `Unknown message type: ${message.type}`
        ))
    }
  }

  /**
   * Handle authentication
   */
  async handleAuth(client, message) {
    const { username, password } = message.data
    
    if (!this.credentials.has(username) || this.credentials.get(username) !== password) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.AUTHENTICATION_FAILED,
        'Invalid credentials'
      ))
      return
    }

    const sessionId = generateId()
    client.authenticated = true
    client.sessionId = sessionId
    
    this.sessions.set(sessionId, {
      clientId: client.id,
      username,
      createdAt: Date.now()
    })

    this.sendMessage(client, createSuccessResponse(message.id, {
      sessionId,
      username
    }))
  }

  /**
   * Handle database connection
   */
  async handleConnect(client, message) {
    const { database: dbName, indexType = 'bplus' } = message.data
    
    if (!dbName) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_MESSAGE,
        'Database name is required'
      ))
      return
    }

    try {
      let database = this.databases.get(dbName)
      
      if (!database) {
        database = new Database(dbName, this.dbDir, {
          indexType,
          ...this.dbOptions
        })
        await database.connect()
        this.databases.set(dbName, database)
      }

      client.database = database
      
      this.sendMessage(client, createSuccessResponse(message.id, {
        database: dbName,
        indexType: database.indexType,
        connected: true
      }))
    } catch (err) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.CONNECTION_ERROR,
        err.message
      ))
    }
  }

  /**
   * Handle create table operation
   */
  async handleCreateTable(client, message) {
    if (!client.database) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.CONNECTION_ERROR,
        'No database connected'
      ))
      return
    }

    const { tableName, schema: schemaData } = message.data
    
    try {
      const schema = new Schema(schemaData)
      const table = await client.database.createTable(tableName, schema)
      
      this.sendMessage(client, createSuccessResponse(message.id, {
        tableName,
        created: true,
        schema: schemaData
      }))
    } catch (err) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        err.message.includes('already exists') ? ERROR_CODES.TABLE_ALREADY_EXISTS : ERROR_CODES.INVALID_SCHEMA,
        err.message
      ))
    }
  }

  /**
   * Handle table operations
   */
  async handleInsert(client, message) {
    const table = await this.getTable(client, message)
    if (!table) return

    try {
      const result = await table.create(message.data.record)
      this.sendMessage(client, createSuccessResponse(message.id, { inserted: result }))
    } catch (err) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_QUERY,
        err.message
      ))
    }
  }

  async handleSelect(client, message) {
    const table = await this.getTable(client, message)
    if (!table) return

    try {
      const { query = {}, limit, offset } = message.data
      const results = await table.find(query, { limit, offset })
      this.sendMessage(client, createSuccessResponse(message.id, { results }))
    } catch (err) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_QUERY,
        err.message
      ))
    }
  }

  async handleUpdate(client, message) {
    const table = await this.getTable(client, message)
    if (!table) return

    try {
      const { query, updates } = message.data
      const result = await table.update(query, updates)
      this.sendMessage(client, createSuccessResponse(message.id, { updated: result }))
    } catch (err) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_QUERY,
        err.message
      ))
    }
  }

  async handleDelete(client, message) {
    const table = await this.getTable(client, message)
    if (!table) return

    try {
      const result = await table.delete(message.data.query)
      this.sendMessage(client, createSuccessResponse(message.id, { deleted: result }))
    } catch (err) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_QUERY,
        err.message
      ))
    }
  }

  async handleCount(client, message) {
    const table = await this.getTable(client, message)
    if (!table) return

    try {
      const count = await table.count(message.data.query || {})
      this.sendMessage(client, createSuccessResponse(message.id, { count }))
    } catch (err) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_QUERY,
        err.message
      ))
    }
  }

  async handleRangeQuery(client, message) {
    const table = await this.getTable(client, message)
    if (!table) return

    try {
      const { field, min, max, limit } = message.data
      const results = await table.range(field, min, max, { limit })
      this.sendMessage(client, createSuccessResponse(message.id, { results }))
    } catch (err) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.INVALID_QUERY,
        err.message
      ))
    }
  }

  async handleListTables(client, message) {
    if (!client.database) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.CONNECTION_ERROR,
        'No database connected'
      ))
      return
    }

    try {
      const tables = Array.from(client.database.tables.keys())
      this.sendMessage(client, createSuccessResponse(message.id, { tables }))
    } catch (err) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.UNKNOWN_ERROR,
        err.message
      ))
    }
  }

  /**
   * Get table for operation
   */
  async getTable(client, message) {
    if (!client.database) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.CONNECTION_ERROR,
        'No database connected'
      ))
      return null
    }

    try {
      const table = await client.database.getTable(message.data.tableName)
      return table
    } catch (err) {
      this.sendMessage(client, createErrorResponse(
        message.id,
        ERROR_CODES.TABLE_NOT_FOUND,
        err.message
      ))
      return null
    }
  }

  /**
   * Send message to client
   */
  sendMessage(client, message) {
    try {
      const data = serializeMessage(message)
      client.socket.write(data + '\n')
    } catch (err) {
      console.error('Error sending message to client:', err)
    }
  }

  /**
   * Add user credentials
   */
  addUser(username, password) {
    this.credentials.set(username, password)
  }

  /**
   * Remove user credentials
   */
  removeUser(username) {
    this.credentials.delete(username)
  }

  /**
   * Get server statistics
   */
  getStats() {
    return {
      isRunning: this.isRunning,
      connectedClients: this.clients.size,
      maxConnections: this.maxConnections,
      databases: Array.from(this.databases.keys()),
      activeSessions: this.sessions.size,
      uptime: this.isRunning ? Date.now() - this.startTime : 0
    }
  }
}

module.exports = DatabaseServer