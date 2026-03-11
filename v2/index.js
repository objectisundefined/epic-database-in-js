'use strict'

/**
 * epic-database-in-js  v2
 * ========================
 * A high-performance, embedded, disk-backed JavaScript database built from
 * scratch using a B+ tree index – just like MySQL InnoDB.
 *
 * Key features
 * ─────────────
 *  • B+ tree primary index with proper split / merge (insert, update, delete)
 *  • Page-based storage (4 096-byte pages, LRU cache, write-back dirty tracking)
 *  • Rich schema system: INT, UINT, BIGINT, FLOAT, DOUBLE, BOOLEAN,
 *    TIMESTAMP, VARCHAR(n), JSON(n)
 *  • Full CRUD  (insert / find / update / delete / count)
 *  • Fluent query builder with WHERE, ORDER BY, LIMIT, OFFSET
 *  • Basic transaction support (begin / commit / rollback with undo log)
 *  • TCP server/client – remote access with the same API
 *  • No external runtime dependencies
 *
 * Quick start
 * ─────────────
 *   const { Database, Schema, DataTypes } = require('./v2')
 *
 *   const db = await Database.connect('shop', './data')
 *
 *   const schema = new Schema({
 *     id:    DataTypes.UINT,
 *     name:  DataTypes.VARCHAR(100),
 *     price: DataTypes.DOUBLE,
 *   })
 *
 *   const products = await db.createTable('products', schema)
 *   await products.insert({ id: 1, name: 'Widget', price: 9.99 })
 *
 *   const row = await products.find({ key: 1 })
 *   console.log(row)   // [{ id: 1, name: 'Widget', price: 9.99 }]
 *
 *   await db.close()
 */

const { Database }       = require('./src/database')
const { Table }          = require('./src/table')
const { Schema, DataTypes, Column } = require('./src/schema')
const { BPlusTree }      = require('./src/bplus-tree')
const { Pager }          = require('./src/pager')
const { QueryBuilder }   = require('./src/query')
const { Transaction }    = require('./src/transaction')
const { DatabaseServer } = require('./src/server')
const { DatabaseClient } = require('./src/client')
const errors             = require('./src/errors')

module.exports = {
  // Core
  Database,
  Table,
  Schema,
  DataTypes,
  Column,

  // Indexes & storage (for advanced use)
  BPlusTree,
  Pager,

  // Query builder
  QueryBuilder,

  // Transactions
  Transaction,

  // Remote access
  DatabaseServer,
  DatabaseClient,

  // Error types
  ...errors
}
