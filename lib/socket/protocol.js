/**
 * Database Socket Protocol
 * 
 * Defines the message format and protocol for socket-based database communication.
 */

const PROTOCOL_VERSION = '1.0.0'

/**
 * Message Types
 */
const MESSAGE_TYPES = {
  // Connection management
  CONNECT: 'CONNECT',
  CONNECT_ACK: 'CONNECT_ACK',
  DISCONNECT: 'DISCONNECT',
  
  // Authentication
  AUTH: 'AUTH',
  AUTH_ACK: 'AUTH_ACK',
  
  // Database operations
  CREATE_TABLE: 'CREATE_TABLE',
  GET_TABLE: 'GET_TABLE',
  LIST_TABLES: 'LIST_TABLES',
  DROP_TABLE: 'DROP_TABLE',
  
  // Table operations
  INSERT: 'INSERT',
  SELECT: 'SELECT',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  COUNT: 'COUNT',
  
  // Range queries (B+ tree advantage)
  RANGE_QUERY: 'RANGE_QUERY',
  
  // Transaction support
  BEGIN_TRANSACTION: 'BEGIN_TRANSACTION',
  COMMIT: 'COMMIT',
  ROLLBACK: 'ROLLBACK',
  
  // Response types
  SUCCESS: 'SUCCESS',
  ERROR: 'ERROR',
  
  // Heartbeat
  PING: 'PING',
  PONG: 'PONG'
}

/**
 * Error Codes
 */
const ERROR_CODES = {
  UNKNOWN_ERROR: 1000,
  INVALID_MESSAGE: 1001,
  AUTHENTICATION_FAILED: 1002,
  PERMISSION_DENIED: 1003,
  TABLE_NOT_FOUND: 1004,
  TABLE_ALREADY_EXISTS: 1005,
  INVALID_SCHEMA: 1006,
  INVALID_QUERY: 1007,
  CONNECTION_ERROR: 1008,
  TRANSACTION_ERROR: 1009
}

/**
 * Message structure:
 * {
 *   id: string,           // Unique message ID for request/response matching
 *   type: string,         // Message type from MESSAGE_TYPES
 *   version: string,      // Protocol version
 *   timestamp: number,    // Unix timestamp
 *   data: object,         // Message payload
 *   sessionId?: string    // Session ID for authenticated connections
 * }
 */

/**
 * Create a protocol message
 */
function createMessage(type, data = {}, id = null, sessionId = null) {
  return {
    id: id || generateId(),
    type,
    version: PROTOCOL_VERSION,
    timestamp: Date.now(),
    data,
    ...(sessionId && { sessionId })
  }
}

/**
 * Create an error response
 */
function createErrorResponse(requestId, code, message, details = null) {
  return createMessage(MESSAGE_TYPES.ERROR, {
    code,
    message,
    ...(details && { details })
  }, requestId)
}

/**
 * Create a success response
 */
function createSuccessResponse(requestId, data = {}, sessionId = null) {
  return createMessage(MESSAGE_TYPES.SUCCESS, data, requestId, sessionId)
}

/**
 * Validate message format
 */
function validateMessage(message) {
  if (!message || typeof message !== 'object') {
    return { valid: false, error: 'Message must be an object' }
  }
  
  if (!message.id || typeof message.id !== 'string') {
    return { valid: false, error: 'Message must have a valid id' }
  }
  
  if (!message.type || !MESSAGE_TYPES[message.type]) {
    return { valid: false, error: 'Message must have a valid type' }
  }
  
  if (!message.version) {
    return { valid: false, error: 'Message must have a version' }
  }
  
  if (!message.timestamp || typeof message.timestamp !== 'number') {
    return { valid: false, error: 'Message must have a valid timestamp' }
  }
  
  return { valid: true }
}

/**
 * Generate unique ID
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

/**
 * Parse JSON message safely
 */
function parseMessage(data) {
  try {
    const message = JSON.parse(data)
    const validation = validateMessage(message)
    
    if (!validation.valid) {
      return { 
        error: createErrorResponse(
          message.id || 'unknown',
          ERROR_CODES.INVALID_MESSAGE,
          validation.error
        )
      }
    }
    
    return { message }
  } catch (err) {
    return { 
      error: createErrorResponse(
        'unknown',
        ERROR_CODES.INVALID_MESSAGE,
        'Invalid JSON format'
      )
    }
  }
}

/**
 * Serialize message to JSON
 */
function serializeMessage(message) {
  return JSON.stringify(message)
}

module.exports = {
  PROTOCOL_VERSION,
  MESSAGE_TYPES,
  ERROR_CODES,
  createMessage,
  createErrorResponse,
  createSuccessResponse,
  validateMessage,
  generateId,
  parseMessage,
  serializeMessage
}