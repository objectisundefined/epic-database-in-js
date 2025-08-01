/**
 * B+ Tree Database - Main Entry Point
 * 
 * This is the primary entry point for the B+ Tree database system.
 * It provides a clean, organized API for all database functionality.
 */

// Core database components
const Database = require('./core/database')
const Table = require('./core/table')

// Schema system
const { Schema, DataTypes, DefaultSchemas } = require('./schema/index')

// Index implementations
const BTreeIndex = require('./index/btree')
const BPlusTreeIndex = require('./index/bplus-tree')

// Storage layer
const Storage = require('./storage/storage')
const Pager = require('./storage/pager')

// Socket support
const { DatabaseServer, DatabaseClient, RemoteDatabase, RemoteTable } = require('./socket/index')

/**
 * Main Database API - B+ Tree Implementation (Recommended)
 */
class BPlusDatabase {
  static async connect(name, dbDir = './data', options = {}) {
    const db = new Database(name, dbDir, { indexType: 'bplus', ...options })
    await db.connect()
    return db
  }
}

/**
 * Legacy Database API - B-Tree Implementation
 */
class BTreeDatabase {
  static async connect(name, dbDir = './data', options = {}) {
    const db = new Database(name, dbDir, { indexType: 'btree', ...options })
    await db.connect()
    return db
  }
}

// Main exports (recommended B+ Tree by default)
module.exports = {
  // Primary API (B+ Tree)
  Database: BPlusDatabase,
  
  // Legacy API
  BTreeDatabase,
  BPlusDatabase,
  
  // Schema system
  Schema,
  DataTypes,
  DefaultSchemas,
  
  // Core components
  Table,
  
  // Index implementations
  BTreeIndex,
  BPlusTreeIndex,
  
  // Storage layer
  Storage,
  Pager,
  
  // Socket support
  DatabaseServer,
  DatabaseClient,
  RemoteDatabase,
  RemoteTable,
  
  // Version info
  version: '2.0.0',
  indexType: 'B+ Tree'
}

// Convenience exports for different use cases
module.exports.btree = {
  Database: BTreeDatabase,
  Schema,
  DataTypes,
  DefaultSchemas
}

module.exports.bplus = {
  Database: BPlusDatabase,
  Schema,
  DataTypes,
  DefaultSchemas
}