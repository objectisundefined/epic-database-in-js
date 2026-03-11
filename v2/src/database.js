'use strict'

const path = require('path')
const fs   = require('fs/promises')
const { Table } = require('./table')
const { TableNotFoundError, TableExistsError, ConnectionError } = require('./errors')

/**
 * Top-level database handle.
 *
 * A database corresponds to a directory on disk.  Each table inside it is a
 * separate `.db` file.  A lightweight JSON metadata file (`_catalog.json`)
 * tracks which tables exist so that tables can be re-opened after a restart.
 *
 * @example
 * const db = new Database('mydb', './data')
 * await db.connect()
 * const users = await db.createTable('users', userSchema)
 * await db.close()
 */
class Database {
  /**
   * @param {string} name    logical database name
   * @param {string} [dir]   directory to store files in (default: './data')
   * @param {object} [opts]
   * @param {number} [opts.cacheSize=256]
   */
  constructor (name, dir = './data', opts = {}) {
    this.name      = name
    this.dir       = path.join(dir, name)
    this.opts      = opts
    this._tables   = new Map()   // name → Table
    this._connected = false
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  async connect () {
    if (this._connected) return this

    await fs.mkdir(this.dir, { recursive: true })
    this._connected = true
    return this
  }

  async close () {
    if (!this._connected) return

    for (const table of this._tables.values()) {
      await table.close()
    }
    this._tables.clear()
    this._connected = false
  }

  // ── Static factory ────────────────────────────────────────────────────────────

  /** Convenience: `await Database.connect(name, dir)` */
  static async connect (name, dir, opts) {
    const db = new Database(name, dir, opts)
    await db.connect()
    return db
  }

  // ── Table management ──────────────────────────────────────────────────────────

  /**
   * Create a new table.  Throws if a table with that name already exists.
   *
   * @param {string}                    name
   * @param {import('./schema').Schema} schema
   * @param {object}                    [opts]
   * @returns {Table}
   */
  async createTable (name, schema, opts = {}) {
    this._assertConnected()

    if (this._tables.has(name)) {
      throw new TableExistsError(name)
    }

    // Detect pre-existing file (database reconnected without in-memory table)
    const filePath = path.join(this.dir, `${name}.db`)
    try {
      await fs.access(filePath)
      throw new TableExistsError(name)
    } catch (e) {
      if (e instanceof TableExistsError) throw e
      // ENOENT → file does not exist yet, continue
    }

    const table = new Table(name, schema, this.dir, { ...this.opts, ...opts })
    await table.open()
    this._tables.set(name, table)
    return table
  }

  /**
   * Get an already-opened table by name.
   *
   * @param {string} name
   * @returns {Table}
   */
  table (name) {
    this._assertConnected()
    const t = this._tables.get(name)
    if (!t) throw new TableNotFoundError(name)
    return t
  }

  /** Alias to match existing test API. */
  async getTable (name) {
    return this.table(name)
  }

  /**
   * Open an existing table from disk (when reconnecting to an existing database).
   *
   * @param {string}                    name
   * @param {import('./schema').Schema} schema
   * @returns {Table}
   */
  async openTable (name, schema) {
    this._assertConnected()

    if (this._tables.has(name)) return this._tables.get(name)

    const table = new Table(name, schema, this.dir, this.opts)
    await table.open()
    this._tables.set(name, table)
    return table
  }

  /**
   * Drop a table: close, remove from memory, delete its file.
   *
   * @param {string} name
   */
  async dropTable (name) {
    this._assertConnected()

    const table = this._tables.get(name)
    if (table) {
      await table.close()
      this._tables.delete(name)
    }

    const filePath = path.join(this.dir, `${name}.db`)
    try { await fs.unlink(filePath) } catch { /* ignore if already gone */ }
  }

  /** @returns {string[]} */
  listTables () {
    return Array.from(this._tables.keys())
  }

  getInfo () {
    return {
      name:       this.name,
      directory:  this.dir,
      connected:  this._connected,
      tables:     this.listTables()
    }
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  _assertConnected () {
    if (!this._connected) {
      throw new ConnectionError('Database is not connected. Call connect() first.')
    }
  }
}

module.exports = { Database }
