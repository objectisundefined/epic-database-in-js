'use strict'

const net  = require('net')
const { EventEmitter } = require('events')
const proto = require('./protocol')
const { ConnectionError } = require('./errors')

/**
 * TCP client for a DatabaseServer.
 *
 * @example
 * const client = new DatabaseClient({ host: 'localhost', port: 3306 })
 * await client.connect()
 * await client.useDatabase('mydb')
 * await client.insert('users', { id: 1, name: 'Alice' })
 * const rows = await client.find('users', { where: { gte: 1, lte: 10 } })
 * await client.close()
 */
class DatabaseClient extends EventEmitter {
  /**
   * @param {object} [opts]
   * @param {string} [opts.host='127.0.0.1']
   * @param {number} [opts.port=3306]
   * @param {string} [opts.password]
   * @param {number} [opts.timeout=5000]   connect / request timeout (ms)
   */
  constructor (opts = {}) {
    super()
    this.host    = opts.host     || '127.0.0.1'
    this.port    = opts.port     || 3306
    this.password = opts.password || null
    this.timeout  = opts.timeout  || 5000

    this._socket     = null
    this._connected  = false
    this._pendingCbs = []   // queue of { resolve, reject } for in-flight requests
    this._parser     = new proto.MessageParser((type, body) => {
      this._onMessage(type, body)
    })
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  async connect () {
    if (this._connected) return

    await new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port }, () => {
        this._socket    = socket
        this._connected = true
        resolve()
      })

      socket.on('data',  chunk => this._parser.push(chunk))
      socket.on('error', err   => {
        if (!this._connected) return reject(new ConnectionError(err.message))
        this.emit('error', err)
      })
      socket.on('close', () => {
        this._connected = false
        this.emit('close')
        // Reject all pending callbacks
        for (const { reject: r } of this._pendingCbs) {
          r(new ConnectionError('Connection closed'))
        }
        this._pendingCbs = []
      })

      setTimeout(() => {
        if (!this._connected) {
          socket.destroy()
          reject(new ConnectionError(`Connection timeout (${this.timeout}ms)`))
        }
      }, this.timeout)
    })

    // Authenticate if a password was provided
    if (this.password) {
      await this._request(proto.MSG_AUTH, { password: this.password },
        [proto.MSG_AUTH_OK, proto.MSG_AUTH_ERR])
    }
  }

  async close () {
    if (!this._connected) return
    this._socket.end()
    this._connected = false
  }

  // ── Remote operations ─────────────────────────────────────────────────────────

  async ping () {
    await this._request(proto.MSG_PING, {}, [proto.MSG_PONG])
  }

  async useDatabase (name) {
    await this._request(proto.MSG_USE_DB, { name }, [proto.MSG_USE_DB_OK])
  }

  async listTables () {
    const resp = await this._request(proto.MSG_LIST_TABLES, {}, [proto.MSG_TABLE_RESULT])
    return resp.tables
  }

  /**
   * Create a table on the server.
   * @param {string} name
   * @param {import('./schema').Schema} schema   local Schema object
   */
  async createTable (name, schema) {
    // Serialise the schema (send type metadata only)
    const def = {}
    for (const [colName, col] of schema.columns) {
      def[colName] = { type: col.type, size: col.size }
      if (col.typeInfo.maxLength !== undefined) {
        def[colName].maxLength = col.typeInfo.maxLength
      }
    }
    await this._request(proto.MSG_CREATE_TABLE, { name, schema: def }, [proto.MSG_RESULT])
  }

  async dropTable (name) {
    await this._request(proto.MSG_DROP_TABLE, { name }, [proto.MSG_RESULT])
  }

  async insert (tableName, record) {
    const resp = await this._request(proto.MSG_INSERT, { table: tableName, record }, [proto.MSG_RESULT])
    return resp
  }

  async find (tableName, opts = {}) {
    const resp = await this._request(proto.MSG_FIND, { table: tableName, opts }, [proto.MSG_RESULT])
    return resp.records
  }

  async update (tableName, key, changes) {
    const resp = await this._request(proto.MSG_UPDATE, { table: tableName, key, changes }, [proto.MSG_RESULT])
    return resp.record
  }

  async delete (tableName, key) {
    await this._request(proto.MSG_DELETE, { table: tableName, key }, [proto.MSG_RESULT])
  }

  async count (tableName) {
    const resp = await this._request(proto.MSG_COUNT, { table: tableName }, [proto.MSG_RESULT])
    return resp.count
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  /**
   * Send a message and wait for a response of one of the expected types.
   * Rejects on MSG_ERROR or timeout.
   */
  _request (type, body, expectedTypes) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = this._pendingCbs.indexOf(entry)
        if (idx !== -1) this._pendingCbs.splice(idx, 1)
        reject(new ConnectionError(`Request timeout (type=${type})`))
      }, this.timeout)

      const entry = {
        expectedTypes,
        resolve: (resp) => { clearTimeout(timer); resolve(resp) },
        reject:  (err)  => { clearTimeout(timer); reject(err)   }
      }

      this._pendingCbs.push(entry)
      this._socket.write(proto.encode(type, body))
    })
  }

  _onMessage (type, body) {
    const entry = this._pendingCbs.shift()
    if (!entry) return   // unsolicited message

    if (type === proto.MSG_ERROR) {
      return entry.reject(new Error(body.message || 'Server error'))
    }
    if (entry.expectedTypes.includes(type)) {
      return entry.resolve(body)
    }
    entry.reject(new Error(`Unexpected message type: ${type}`))
  }
}

module.exports = { DatabaseClient }
