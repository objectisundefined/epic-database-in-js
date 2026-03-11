'use strict'

const path = require('path')
const { Pager } = require('./pager')
const { BPlusTree } = require('./bplus-tree')
const { DuplicateKeyError, RecordNotFoundError } = require('./errors')
const { QueryBuilder } = require('./query')

/**
 * A persistent table backed by a B+ tree index.
 *
 * Every table maps to a single `.db` file on disk.  The file is organised
 * as a sequence of 4 096-byte pages:
 *
 *   page 0  – pager file-header  (magic, root page-id, auto-increment, …)
 *   page 1+ – B+ tree nodes
 *
 * The primary key must be a 32-bit integer (INT or UINT column).  An
 * optional `autoIncrement` column is managed internally.
 */
class Table {
  /**
   * @param {string}                      name      table name
   * @param {import('./schema').Schema}   schema
   * @param {string}                      dataDir   directory for .db files
   * @param {object}                      [opts]
   * @param {number}                      [opts.cacheSize=256]
   */
  constructor (name, schema, dataDir, opts = {}) {
    this.name    = name
    this.schema  = schema
    this.dataDir = dataDir
    this.opts    = opts

    this.filePath = path.join(dataDir, `${name}.db`)
    this._pager   = null
    this._tree    = null
    this._open    = false
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  async open () {
    const pager = new Pager(this.filePath, {
      cacheSize: this.opts.cacheSize || 256
    })
    await pager.open(this.schema.recordSize)

    const tree = new BPlusTree(pager, this.schema.recordSize)

    if (pager.rootPageId === 0) {
      // Brand-new file – create an empty root leaf
      await tree.create()
    }

    this._pager = pager
    this._tree  = tree
    this._open  = true
  }

  async close () {
    if (!this._open) return
    await this._pager.flush()
    await this._pager.close()
    this._open = false
  }

  async flush () {
    if (this._open) await this._pager.flush()
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────────

  /**
   * Insert a new record.
   *
   * If the primary-key column has `autoIncrement: true` (or the schema has no
   * explicit primary key), the ID is assigned automatically from the pager's
   * `nextAutoId` counter.
   *
   * @param  {object} record
   * @returns {{ key: number, record: object }}
   */
  async insert (record) {
    this._assertOpen()

    // Resolve primary key
    let pk = record[this.schema.primaryKey]

    if (pk === undefined || pk === null) {
      // Auto-assign
      pk = this._pager.nextAutoId++
      record = { ...record, [this.schema.primaryKey]: pk }
    }

    this.schema.validate(record)

    const existing = await this._tree.get(pk)
    if (existing !== null) {
      throw new DuplicateKeyError(pk)
    }

    const buf = this.schema.serialize(record)
    await this._tree.set(pk, buf)

    // Keep nextAutoId ahead of any manually supplied key
    if (pk >= this._pager.nextAutoId) {
      this._pager.nextAutoId = pk + 1
    }

    return { key: pk, record }
  }

  // Legacy alias used by existing tests
  async create (record) { return this.insert(record) }

  /**
   * Find records by various criteria.
   *
   * @param {object}  [opts]
   * @param {number}  [opts.key]           exact primary-key lookup
   * @param {object}  [opts.where]         { gte, gt, lte, lt }
   * @param {number}  [opts.limit]
   * @param {number}  [opts.offset=0]
   * @returns {object[]}
   */
  async find (opts = {}) {
    this._assertOpen()

    let entries

    if (opts.key !== undefined) {
      const buf = await this._tree.get(opts.key)
      if (buf === null) return []
      return [this.schema.deserialize(buf)]
    }

    if (opts.where) {
      const { gte, gt, lte, lt } = opts.where
      const minKey = gte !== undefined ? gte : (gt !== undefined ? gt + 1 : null)
      const maxKey = lte !== undefined ? lte : (lt !== undefined ? lt - 1 : null)
      entries = await this._tree.range(minKey, maxKey)

      // Handle strict bounds
      if (gt !== undefined) entries = entries.filter(e => e.key > gt)
      if (lt !== undefined) entries = entries.filter(e => e.key < lt)
    } else {
      entries = await this._tree.scan()
    }

    let records = entries.map(e => this.schema.deserialize(e.value))

    const offset = opts.offset || 0
    if (offset) records = records.slice(offset)
    if (opts.limit !== undefined) records = records.slice(0, opts.limit)

    return records
  }

  // Legacy alias
  async read (opts = {}) { return this.find(opts) }

  /**
   * Update an existing record by primary key (partial update).
   *
   * @param {number} key
   * @param {object} changes
   */
  async update (key, changes) {
    this._assertOpen()

    const buf = await this._tree.get(key)
    if (buf === null) {
      throw new RecordNotFoundError(key)
    }

    const current = this.schema.deserialize(buf)
    const updated = { ...current, ...changes, [this.schema.primaryKey]: key }
    this.schema.validate(updated)

    const newBuf = this.schema.serialize(updated)
    await this._tree.set(key, newBuf)

    return updated
  }

  /**
   * Delete a record by primary key.
   *
   * @param {number} key
   */
  async delete (key) {
    this._assertOpen()

    const deleted = await this._tree.delete(key)
    if (!deleted) {
      throw new RecordNotFoundError(key)
    }
  }

  /** Return the total number of records. */
  async count () {
    this._assertOpen()
    return this._tree.count()
  }

  // ── Info / debug ──────────────────────────────────────────────────────────────

  getInfo () {
    return {
      name:             this.name,
      filePath:         this.filePath,
      indexType:        'B+ Tree',
      recordSize:       this.schema.recordSize,
      leafMaxKeys:      this._tree ? this._tree._leafMaxKeys : null,
      internalMaxKeys:  this._tree ? this._tree._internalMaxKeys : null,
      ...(this._pager ? this._pager.stats : {})
    }
  }

  async showStructure () {
    this._assertOpen()
    return this._tree.printTree()
  }

  /** Return a fluent QueryBuilder scoped to this table. */
  query () {
    return new QueryBuilder(this)
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  _assertOpen () {
    if (!this._open) throw new Error(`Table '${this.name}' is not open`)
  }
}

module.exports = { Table }
