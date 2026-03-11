/**
 * Socket Module - Database Socket Protocol Support
 * 
 * Provides socket-based client-server communication for the B+ tree database system.
 */

const DatabaseServer = require('./server')
const { DatabaseClient, RemoteDatabase, RemoteTable } = require('./client')
const {
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
} = require('./protocol')

module.exports = {
  // Server
  DatabaseServer,
  
  // Client
  DatabaseClient,
  RemoteDatabase,
  RemoteTable,
  
  // Protocol
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