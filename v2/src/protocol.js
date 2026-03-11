'use strict'

/**
 * Wire protocol for the database server/client.
 *
 * Every message is framed as:
 *
 *   [ 4-byte uint32LE: total payload length ]
 *   [ 1-byte uint8:    message type         ]
 *   [ N-byte UTF-8 JSON payload             ]
 *
 * The framing lets us multiplex request/response pairs over a single TCP
 * connection, and the JSON payload keeps the implementation simple while
 * remaining human-readable.
 */

const MSG_PING        = 0x01
const MSG_PONG        = 0x02
const MSG_QUERY       = 0x10   // client → server
const MSG_RESULT      = 0x11   // server → client (success)
const MSG_ERROR       = 0x20   // server → client (failure)
const MSG_AUTH        = 0x30
const MSG_AUTH_OK     = 0x31
const MSG_AUTH_ERR    = 0x32
const MSG_USE_DB      = 0x40
const MSG_USE_DB_OK   = 0x41
const MSG_CREATE_TABLE  = 0x50
const MSG_DROP_TABLE    = 0x51
const MSG_LIST_TABLES   = 0x52
const MSG_TABLE_RESULT  = 0x53
const MSG_INSERT      = 0x60
const MSG_FIND        = 0x61
const MSG_UPDATE      = 0x62
const MSG_DELETE      = 0x63
const MSG_COUNT       = 0x64

const HEADER_BYTES = 5   // 4 (length) + 1 (type)

/**
 * Encode a message into a Buffer ready to write to a socket.
 *
 * @param {number} type    message-type constant
 * @param {object} [body]  any JSON-serialisable object
 * @returns {Buffer}
 */
function encode (type, body = {}) {
  const json    = JSON.stringify(body)
  const payload = Buffer.from(json, 'utf8')
  const buf     = Buffer.alloc(HEADER_BYTES + payload.length)
  buf.writeUInt32LE(payload.length, 0)
  buf.writeUInt8(type, 4)
  payload.copy(buf, HEADER_BYTES)
  return buf
}

/**
 * Stateful stream parser.  Feed it chunks from a socket's `data` event and
 * it fires `onMessage(type, body)` once per complete message.
 */
class MessageParser {
  constructor (onMessage) {
    this._onMessage = onMessage
    this._buf = Buffer.alloc(0)
  }

  push (chunk) {
    this._buf = Buffer.concat([this._buf, chunk])
    this._drain()
  }

  _drain () {
    while (this._buf.length >= HEADER_BYTES) {
      const len  = this._buf.readUInt32LE(0)
      const type = this._buf.readUInt8(4)
      const total = HEADER_BYTES + len

      if (this._buf.length < total) break   // wait for more data

      const payload = this._buf.slice(HEADER_BYTES, total)
      this._buf     = this._buf.slice(total)

      let body
      try {
        body = JSON.parse(payload.toString('utf8'))
      } catch {
        body = {}
      }

      this._onMessage(type, body)
    }
  }
}

module.exports = {
  // Message type constants
  MSG_PING, MSG_PONG,
  MSG_QUERY, MSG_RESULT, MSG_ERROR,
  MSG_AUTH, MSG_AUTH_OK, MSG_AUTH_ERR,
  MSG_USE_DB, MSG_USE_DB_OK,
  MSG_CREATE_TABLE, MSG_DROP_TABLE, MSG_LIST_TABLES, MSG_TABLE_RESULT,
  MSG_INSERT, MSG_FIND, MSG_UPDATE, MSG_DELETE, MSG_COUNT,

  // Utilities
  encode,
  MessageParser,
  HEADER_BYTES
}
