'use strict'

const net  = require('net')
const { EventEmitter } = require('events')
const { Database } = require('./database')
const { Schema, DataTypes } = require('./schema')
const proto = require('./protocol')

/**
 * TCP database server.
 *
 * The server accepts connections from DatabaseClient instances (or any
 * client that speaks the wire protocol defined in protocol.js).
 *
 * Each connected session gets its own in-memory state:
 *   - current database reference
 *   - optional authentication status
 *
 * @example
 * const server = new DatabaseServer({ port: 3306, dataDir: './data' })
 * await server.start()
 * // … later:
 * await server.stop()
 */
class DatabaseServer extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {number} [opts.port=3306]
   * @param {string} [opts.host='127.0.0.1']
   * @param {string} [opts.dataDir='./data']
   * @param {string} [opts.password]           if set, clients must authenticate
   */
  constructor (opts = {}) {
    super()
    this.port    = opts.port    || 3306
    this.host    = opts.host    || '127.0.0.1'
    this.dataDir = opts.dataDir || './data'
    this.password = opts.password || null

    this._server  = null
    this._running = false
    this._dbs     = new Map()   // dbName → Database
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  async start () {
    if (this._running) return

    await new Promise((resolve, reject) => {
      this._server = net.createServer(socket => this._handleConnection(socket))
      this._server.once('error', reject)
      this._server.listen(this.port, this.host, () => {
        this._running = true
        this.emit('listening', { port: this.port, host: this.host })
        resolve()
      })
    })
  }

  async stop () {
    if (!this._running) return

    // Close all databases
    for (const db of this._dbs.values()) {
      try { await db.close() } catch { /* ignore */ }
    }
    this._dbs.clear()

    await new Promise((resolve) => this._server.close(resolve))
    this._running = false
    this.emit('closed')
  }

  // ── Connection handling ───────────────────────────────────────────────────────

  _handleConnection (socket) {
    const session = {
      socket,
      db:             null,
      authenticated:  !this.password   // auto-auth if no password set
    }

    const parser = new proto.MessageParser((type, body) => {
      this._dispatch(session, type, body)
    })

    socket.on('data',  chunk => parser.push(chunk))
    socket.on('error', err   => this.emit('clientError', err))
    socket.on('close', ()    => { if (session.db) session.db.close() })

    this.emit('connection', { address: socket.remoteAddress })
  }

  // ── Message dispatcher ────────────────────────────────────────────────────────

  async _dispatch (session, type, body) {
    try {
      switch (type) {
        case proto.MSG_PING:
          return this._send(session, proto.MSG_PONG, {})

        case proto.MSG_AUTH:
          return this._handleAuth(session, body)

        case proto.MSG_USE_DB:
          return this._handleUseDb(session, body)

        case proto.MSG_LIST_TABLES:
          return this._handleListTables(session, body)

        case proto.MSG_CREATE_TABLE:
          return this._handleCreateTable(session, body)

        case proto.MSG_DROP_TABLE:
          return this._handleDropTable(session, body)

        case proto.MSG_INSERT:
          return this._handleInsert(session, body)

        case proto.MSG_FIND:
          return this._handleFind(session, body)

        case proto.MSG_UPDATE:
          return this._handleUpdate(session, body)

        case proto.MSG_DELETE:
          return this._handleDelete(session, body)

        case proto.MSG_COUNT:
          return this._handleCount(session, body)

        default:
          return this._sendError(session, `Unknown message type: ${type}`)
      }
    } catch (err) {
      this._sendError(session, err.message)
    }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────

  _handleAuth (session, { password }) {
    if (password === this.password) {
      session.authenticated = true
      this._send(session, proto.MSG_AUTH_OK, {})
    } else {
      this._send(session, proto.MSG_AUTH_ERR, { message: 'Invalid password' })
    }
  }

  async _handleUseDb (session, { name }) {
    this._requireAuth(session)

    if (!this._dbs.has(name)) {
      const db = new Database(name, this.dataDir)
      await db.connect()
      this._dbs.set(name, db)
    }

    session.db = this._dbs.get(name)
    this._send(session, proto.MSG_USE_DB_OK, { name })
  }

  _handleListTables (session) {
    this._requireAuth(session)
    this._requireDb(session)
    this._send(session, proto.MSG_TABLE_RESULT, { tables: session.db.listTables() })
  }

  async _handleCreateTable (session, { name, schema: schemaDef }) {
    this._requireAuth(session)
    this._requireDb(session)

    // Re-hydrate DataTypes from the schema definition sent over the wire
    const schema = this._hydrateSchema(schemaDef)
    await session.db.createTable(name, schema)
    this._send(session, proto.MSG_RESULT, { ok: true })
  }

  async _handleDropTable (session, { name }) {
    this._requireAuth(session)
    this._requireDb(session)
    await session.db.dropTable(name)
    this._send(session, proto.MSG_RESULT, { ok: true })
  }

  async _handleInsert (session, { table: tableName, record }) {
    this._requireAuth(session)
    this._requireDb(session)
    const table  = session.db.table(tableName)
    const result = await table.insert(record)
    this._send(session, proto.MSG_RESULT, { key: result.key, record: result.record })
  }

  async _handleFind (session, { table: tableName, opts }) {
    this._requireAuth(session)
    this._requireDb(session)
    const table   = session.db.table(tableName)
    const records = await table.find(opts || {})
    this._send(session, proto.MSG_RESULT, { records })
  }

  async _handleUpdate (session, { table: tableName, key, changes }) {
    this._requireAuth(session)
    this._requireDb(session)
    const table   = session.db.table(tableName)
    const updated = await table.update(key, changes)
    this._send(session, proto.MSG_RESULT, { record: updated })
  }

  async _handleDelete (session, { table: tableName, key }) {
    this._requireAuth(session)
    this._requireDb(session)
    const table = session.db.table(tableName)
    await table.delete(key)
    this._send(session, proto.MSG_RESULT, { ok: true })
  }

  async _handleCount (session, { table: tableName }) {
    this._requireAuth(session)
    this._requireDb(session)
    const table = session.db.table(tableName)
    const count = await table.count()
    this._send(session, proto.MSG_RESULT, { count })
  }

  // ── Helpers ────────────────────────────────────────────────────────────────────

  _send (session, type, body) {
    if (session.socket.writable) {
      session.socket.write(proto.encode(type, body))
    }
  }

  _sendError (session, message) {
    this._send(session, proto.MSG_ERROR, { message })
  }

  _requireAuth (session) {
    if (!session.authenticated) throw new Error('Not authenticated')
  }

  _requireDb (session) {
    if (!session.db) throw new Error('No database selected. Send MSG_USE_DB first.')
  }

  /**
   * Re-hydrate a schema definition sent over the wire.
   * The client sends { columnName: { type, size, maxLength? } }.
   */
  _hydrateSchema (def) {
    const hydrated = {}
    for (const [name, info] of Object.entries(def)) {
      switch (info.type) {
        case 'VARCHAR': hydrated[name] = DataTypes.VARCHAR(info.maxLength); break
        case 'JSON':    hydrated[name] = DataTypes.JSON(info.maxLength);    break
        default:        hydrated[name] = DataTypes[info.type] || info;       break
      }
    }
    return new Schema(hydrated)
  }
}

module.exports = { DatabaseServer }
