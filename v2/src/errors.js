'use strict'

/**
 * Base error for all database errors.
 */
class DatabaseError extends Error {
  constructor (message, code) {
    super(message)
    this.name = 'DatabaseError'
    this.code = code
  }
}

class TableNotFoundError extends DatabaseError {
  constructor (tableName) {
    super(`Table '${tableName}' not found`, 'TABLE_NOT_FOUND')
    this.name = 'TableNotFoundError'
    this.tableName = tableName
  }
}

class TableExistsError extends DatabaseError {
  constructor (tableName) {
    super(`Table '${tableName}' already exists`, 'TABLE_EXISTS')
    this.name = 'TableExistsError'
    this.tableName = tableName
  }
}

class SchemaError extends DatabaseError {
  constructor (message) {
    super(message, 'SCHEMA_ERROR')
    this.name = 'SchemaError'
  }
}

class DuplicateKeyError extends DatabaseError {
  constructor (key) {
    super(`Duplicate key: ${key}`, 'DUPLICATE_KEY')
    this.name = 'DuplicateKeyError'
    this.key = key
  }
}

class RecordNotFoundError extends DatabaseError {
  constructor (key) {
    super(`Record with key '${key}' not found`, 'RECORD_NOT_FOUND')
    this.name = 'RecordNotFoundError'
    this.key = key
  }
}

class ConnectionError extends DatabaseError {
  constructor (message) {
    super(message, 'CONNECTION_ERROR')
    this.name = 'ConnectionError'
  }
}

class TransactionError extends DatabaseError {
  constructor (message) {
    super(message, 'TRANSACTION_ERROR')
    this.name = 'TransactionError'
  }
}

module.exports = {
  DatabaseError,
  TableNotFoundError,
  TableExistsError,
  SchemaError,
  DuplicateKeyError,
  RecordNotFoundError,
  ConnectionError,
  TransactionError
}
