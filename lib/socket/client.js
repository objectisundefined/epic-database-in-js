/**
 * Database Socket Client
 * 
 * Provides a clean API for connecting to remote database servers via socket protocol.
 */

const net = require('net')
const EventEmitter = require('events')
const {
  MESSAGE_TYPES,
  ERROR_CODES,
  createMessage,
  parseMessage,
  serializeMessage,
  generateId
} = require('./protocol')

class DatabaseClient extends EventEmitter {
  constructor(options = {}) {
    super()
    
    this.host = options.host || 'localhost'
    this.port = options.port || 3306
    this.timeout = options.timeout || 30000
    this.reconnectDelay = options.reconnectDelay || 5000
    this.maxReconnectAttempts = options.maxReconnectAttempts || 3
    
    this.socket = null
    this.isConnected = false
    this.isAuthenticated = false
    this.database = null
    this.sessionId = null
    
    // Request tracking
    this.pendingRequests = new Map()
    this.requestTimeout = options.requestTimeout || 10000
    
    // Reconnection
    this.reconnectAttempts = 0
    this.shouldReconnect = true
    
    // Heartbeat
    this.heartbeatInterval = options.heartbeatInterval || 30000
    this.heartbeatTimer = null
    this.lastPong = Date.now()
  }

  /**
   * Connect to the database server
   */
  async connect() {
    if (this.isConnected) {
      throw new Error('Client is already connected')
    }

    return new Promise((resolve, reject) => {
      this.socket = new net.Socket()
      
      const timeoutId = setTimeout(() => {
        this.socket.destroy()
        reject(new Error('Connection timeout'))
      }, this.timeout)

      this.socket.connect(this.port, this.host, () => {
        clearTimeout(timeoutId)
        this.isConnected = true
        this.reconnectAttempts = 0
        
        console.log(`🔌 Connected to database server at ${this.host}:${this.port}`)
        this.startHeartbeat()
        this.emit('connected')
        resolve()
      })

      this.socket.on('data', (data) => {
        this.handleMessage(data.toString())
      })

      this.socket.on('close', () => {
        this.handleDisconnect()
      })

      this.socket.on('error', (err) => {
        clearTimeout(timeoutId)
        console.error('Socket error:', err)
        this.emit('error', err)
        
        if (!this.isConnected) {
          reject(err)
        }
      })
    })
  }

  /**
   * Disconnect from the server
   */
  async disconnect() {
    this.shouldReconnect = false
    this.stopHeartbeat()
    
    if (this.socket) {
      this.socket.destroy()
    }
    
    this.isConnected = false
    this.isAuthenticated = false
    this.database = null
    this.sessionId = null
    
    // Reject all pending requests
    for (const [id, request] of this.pendingRequests) {
      clearTimeout(request.timeoutId)
      request.reject(new Error('Connection closed'))
    }
    this.pendingRequests.clear()
    
    console.log('🔌 Disconnected from database server')
    this.emit('disconnected')
  }

  /**
   * Authenticate with the server
   */
  async authenticate(username, password) {
    const response = await this.sendRequest(MESSAGE_TYPES.AUTH, {
      username,
      password
    })
    
    this.isAuthenticated = true
    this.sessionId = response.sessionId
    
    console.log(`🔐 Authenticated as ${response.username}`)
    return response
  }

  /**
   * Connect to a specific database
   */
  async useDatabase(databaseName, indexType = 'bplus') {
    const response = await this.sendRequest(MESSAGE_TYPES.CONNECT, {
      database: databaseName,
      indexType
    })
    
    this.database = databaseName
    console.log(`📦 Connected to database: ${databaseName} (${response.indexType})`)
    
    return new RemoteDatabase(this, databaseName)
  }

  /**
   * Create table
   */
  async createTable(tableName, schema) {
    return await this.sendRequest(MESSAGE_TYPES.CREATE_TABLE, {
      tableName,
      schema
    })
  }

  /**
   * List tables
   */
  async listTables() {
    const response = await this.sendRequest(MESSAGE_TYPES.LIST_TABLES, {})
    return response.tables
  }

  /**
   * Send a request and wait for response
   */
  async sendRequest(type, data = {}) {
    if (!this.isConnected) {
      throw new Error('Not connected to server')
    }

    const message = createMessage(type, data, null, this.sessionId)
    
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(message.id)
        reject(new Error(`Request timeout: ${type}`))
      }, this.requestTimeout)

      this.pendingRequests.set(message.id, {
        resolve,
        reject,
        timeoutId,
        type
      })

      this.sendMessage(message)
    })
  }

  /**
   * Send message to server
   */
  sendMessage(message) {
    if (!this.socket || !this.isConnected) {
      throw new Error('Not connected to server')
    }

    const data = serializeMessage(message)
    this.socket.write(data + '\n')
  }

  /**
   * Handle incoming message
   */
  handleMessage(data) {
    const lines = data.trim().split('\n')
    
    for (const line of lines) {
      if (!line.trim()) continue
      
      const parsed = parseMessage(line)
      if (parsed.error) {
        console.error('Protocol error:', parsed.error)
        continue
      }

      this.processMessage(parsed.message)
    }
  }

  /**
   * Process server message
   */
  processMessage(message) {
    switch (message.type) {
      case MESSAGE_TYPES.SUCCESS:
      case MESSAGE_TYPES.ERROR:
        this.handleResponse(message)
        break
        
      case MESSAGE_TYPES.CONNECT_ACK:
        console.log('Server connection acknowledged')
        break
        
      case MESSAGE_TYPES.PONG:
        this.lastPong = Date.now()
        break
        
      default:
        console.warn('Unknown message type:', message.type)
    }
  }

  /**
   * Handle response to request
   */
  handleResponse(message) {
    const request = this.pendingRequests.get(message.id)
    if (!request) {
      console.warn('Received response for unknown request:', message.id)
      return
    }

    this.pendingRequests.delete(message.id)
    clearTimeout(request.timeoutId)

    if (message.type === MESSAGE_TYPES.SUCCESS) {
      request.resolve(message.data)
    } else {
      const error = new Error(message.data.message || 'Unknown error')
      error.code = message.data.code
      error.details = message.data.details
      request.reject(error)
    }
  }

  /**
   * Handle disconnection
   */
  handleDisconnect() {
    this.isConnected = false
    this.isAuthenticated = false
    this.stopHeartbeat()
    
    console.log('🔌 Disconnected from server')
    this.emit('disconnected')

    // Attempt reconnection if enabled
    if (this.shouldReconnect && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++
      console.log(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`)
      
      setTimeout(() => {
        this.connect().catch(err => {
          console.error('Reconnection failed:', err)
          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached')
            this.emit('reconnectionFailed')
          }
        })
      }, this.reconnectDelay)
    }
  }

  /**
   * Start heartbeat to keep connection alive
   */
  startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      if (Date.now() - this.lastPong > this.heartbeatInterval * 2) {
        console.warn('Heartbeat timeout, disconnecting...')
        this.disconnect()
        return
      }

      try {
        this.sendMessage(createMessage(MESSAGE_TYPES.PING))
      } catch (err) {
        console.error('Failed to send heartbeat:', err)
      }
    }, this.heartbeatInterval)
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  /**
   * Get client status
   */
  getStatus() {
    return {
      isConnected: this.isConnected,
      isAuthenticated: this.isAuthenticated,
      database: this.database,
      host: this.host,
      port: this.port,
      pendingRequests: this.pendingRequests.size,
      reconnectAttempts: this.reconnectAttempts
    }
  }
}

/**
 * Remote Database Wrapper
 * 
 * Provides table operations through the socket connection
 */
class RemoteDatabase {
  constructor(client, databaseName) {
    this.client = client
    this.name = databaseName
  }

  /**
   * Get a table interface
   */
  table(tableName) {
    return new RemoteTable(this.client, tableName)
  }

  /**
   * Create a new table
   */
  async createTable(tableName, schema) {
    return await this.client.createTable(tableName, schema)
  }

  /**
   * List all tables
   */
  async listTables() {
    return await this.client.listTables()
  }
}

/**
 * Remote Table Wrapper
 * 
 * Provides CRUD operations through the socket connection
 */
class RemoteTable {
  constructor(client, tableName) {
    this.client = client
    this.name = tableName
  }

  /**
   * Insert a record
   */
  async insert(record) {
    const response = await this.client.sendRequest(MESSAGE_TYPES.INSERT, {
      tableName: this.name,
      record
    })
    return response.inserted
  }

  /**
   * Find records
   */
  async find(query = {}, options = {}) {
    const response = await this.client.sendRequest(MESSAGE_TYPES.SELECT, {
      tableName: this.name,
      query,
      ...options
    })
    return response.results
  }

  /**
   * Update records
   */
  async update(query, updates) {
    const response = await this.client.sendRequest(MESSAGE_TYPES.UPDATE, {
      tableName: this.name,
      query,
      updates
    })
    return response.updated
  }

  /**
   * Delete records
   */
  async delete(query) {
    const response = await this.client.sendRequest(MESSAGE_TYPES.DELETE, {
      tableName: this.name,
      query
    })
    return response.deleted
  }

  /**
   * Count records
   */
  async count(query = {}) {
    const response = await this.client.sendRequest(MESSAGE_TYPES.COUNT, {
      tableName: this.name,
      query
    })
    return response.count
  }

  /**
   * Range query (B+ tree advantage)
   */
  async range(field, min, max, options = {}) {
    const response = await this.client.sendRequest(MESSAGE_TYPES.RANGE_QUERY, {
      tableName: this.name,
      field,
      min,
      max,
      ...options
    })
    return response.results
  }
}

module.exports = {
  DatabaseClient,
  RemoteDatabase,
  RemoteTable
}