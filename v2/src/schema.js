'use strict'

const { SchemaError } = require('./errors')

// ─── Type constants ────────────────────────────────────────────────────────────
const T_INT = 'INT'
const T_UINT = 'UINT'
const T_BIGINT = 'BIGINT'
const T_FLOAT = 'FLOAT'
const T_DOUBLE = 'DOUBLE'
const T_BOOLEAN = 'BOOLEAN'
const T_VARCHAR = 'VARCHAR'
const T_TIMESTAMP = 'TIMESTAMP'
const T_JSON = 'JSON'

/**
 * Analogous to MySQL column types.
 *
 * Fixed-width types (INT, UINT, BIGINT, FLOAT, DOUBLE, BOOLEAN, TIMESTAMP)
 * are stored as-is.  Variable-prefix types (VARCHAR, JSON) are stored as
 * a 2-byte little-endian length prefix followed by `maxLength` bytes of
 * zero-padded payload, giving every column a constant on-disk width so
 * records in a leaf page are all the same size.
 */
const DataTypes = {
  /** 4-byte signed integer  (-2 147 483 648 … 2 147 483 647) */
  INT: Object.freeze({ type: T_INT, size: 4 }),
  /** 4-byte unsigned integer (0 … 4 294 967 295) */
  UINT: Object.freeze({ type: T_UINT, size: 4 }),
  /** 8-byte signed integer stored as JavaScript BigInt */
  BIGINT: Object.freeze({ type: T_BIGINT, size: 8 }),
  /** 4-byte IEEE 754 single-precision float */
  FLOAT: Object.freeze({ type: T_FLOAT, size: 4 }),
  /** 8-byte IEEE 754 double-precision float */
  DOUBLE: Object.freeze({ type: T_DOUBLE, size: 8 }),
  /** 1-byte boolean (0 = false, 1 = true) */
  BOOLEAN: Object.freeze({ type: T_BOOLEAN, size: 1 }),
  /** 8-byte Unix timestamp in milliseconds, stored as BigInt */
  TIMESTAMP: Object.freeze({ type: T_TIMESTAMP, size: 8 }),
  /** UTF-8 string up to `maxLength` bytes (2-byte length prefix + payload) */
  VARCHAR: (maxLength) => Object.freeze({ type: T_VARCHAR, maxLength, size: maxLength + 2 }),
  /** JSON value serialised as UTF-8, up to `maxLength` bytes */
  JSON: (maxLength = 4096) => Object.freeze({ type: T_JSON, maxLength, size: maxLength + 2 })
}

// Keep the legacy aliases the existing tests use
DataTypes.INT32 = DataTypes.INT
DataTypes.UINT32 = DataTypes.UINT
DataTypes.INT64 = DataTypes.BIGINT

// ─── Column ───────────────────────────────────────────────────────────────────

class Column {
  /**
   * @param {string} name
   * @param {object} typeInfo  – one of the DataTypes values
   * @param {object} [opts]
   * @param {boolean} [opts.primary]
   * @param {boolean} [opts.autoIncrement]
   * @param {boolean} [opts.nullable]
   * @param {*}       [opts.default]
   */
  constructor (name, typeInfo, opts = {}) {
    this.name = name
    this.typeInfo = typeInfo
    this.primary = opts.primary || false
    this.autoIncrement = opts.autoIncrement || false
    this.nullable = opts.nullable !== false  // default true
    this.defaultValue = opts.default !== undefined ? opts.default : null
  }

  get type () { return this.typeInfo.type }
  get size () { return this.typeInfo.size }

  // ── validation ──────────────────────────────────────────────────────────────

  validate (value) {
    if (value === null || value === undefined) {
      if (!this.nullable && !this.autoIncrement) {
        throw new SchemaError(`Column '${this.name}' cannot be null`)
      }
      return
    }

    switch (this.type) {
      case T_INT:
        if (!Number.isInteger(value) || value < -2147483648 || value > 2147483647) {
          throw new SchemaError(`Column '${this.name}': must be a 32-bit signed integer`)
        }
        break

      case T_UINT:
        if (!Number.isInteger(value) || value < 0 || value > 4294967295) {
          throw new SchemaError(`Column '${this.name}': must be a 32-bit unsigned integer`)
        }
        break

      case T_BIGINT:
        if (typeof value !== 'bigint' && !Number.isInteger(value)) {
          throw new SchemaError(`Column '${this.name}': must be an integer or BigInt`)
        }
        break

      case T_FLOAT:
      case T_DOUBLE:
        if (typeof value !== 'number') {
          throw new SchemaError(`Column '${this.name}': must be a number`)
        }
        break

      case T_BOOLEAN:
        if (typeof value !== 'boolean') {
          throw new SchemaError(`Column '${this.name}': must be a boolean`)
        }
        break

      case T_TIMESTAMP:
        if (typeof value !== 'number' && typeof value !== 'bigint') {
          throw new SchemaError(`Column '${this.name}': must be a number or BigInt`)
        }
        break

      case T_VARCHAR: {
        if (typeof value !== 'string') {
          throw new SchemaError(`Column '${this.name}': must be a string`)
        }
        const len = Buffer.byteLength(value, 'utf8')
        if (len > this.typeInfo.maxLength) {
          throw new SchemaError(
            `Column '${this.name}': string too long (${len} > ${this.typeInfo.maxLength})`
          )
        }
        break
      }

      case T_JSON:
        try {
          const s = JSON.stringify(value)
          if (s.length > this.typeInfo.maxLength) {
            throw new SchemaError(`Column '${this.name}': JSON serialisation too long`)
          }
        } catch (e) {
          if (e instanceof SchemaError) throw e
          throw new SchemaError(`Column '${this.name}': value cannot be serialised as JSON`)
        }
        break

      default:
        throw new SchemaError(`Column '${this.name}': unknown type '${this.type}'`)
    }
  }

  // ── serialisation ───────────────────────────────────────────────────────────

  /** Write `value` into `buf` at `offset`.  Returns bytes written. */
  serialize (buf, offset, value) {
    if (value === null || value === undefined) {
      buf.fill(0, offset, offset + this.size)
      return this.size
    }

    switch (this.type) {
      case T_INT:
        buf.writeInt32LE(value, offset)
        break

      case T_UINT:
        buf.writeUInt32LE(value, offset)
        break

      case T_BIGINT: {
        const bi = typeof value === 'bigint' ? value : BigInt(value)
        buf.writeBigInt64LE(bi, offset)
        break
      }

      case T_FLOAT:
        buf.writeFloatLE(value, offset)
        break

      case T_DOUBLE:
        buf.writeDoubleLE(value, offset)
        break

      case T_BOOLEAN:
        buf.writeUInt8(value ? 1 : 0, offset)
        break

      case T_TIMESTAMP: {
        const bi = typeof value === 'bigint' ? value : BigInt(value)
        buf.writeBigInt64LE(bi, offset)
        break
      }

      case T_VARCHAR: {
        const bytes = Buffer.from(value, 'utf8')
        const len = Math.min(bytes.length, this.typeInfo.maxLength)
        buf.writeUInt16LE(len, offset)
        bytes.copy(buf, offset + 2, 0, len)
        buf.fill(0, offset + 2 + len, offset + this.size)
        break
      }

      case T_JSON: {
        const bytes = Buffer.from(JSON.stringify(value), 'utf8')
        const len = Math.min(bytes.length, this.typeInfo.maxLength)
        buf.writeUInt16LE(len, offset)
        bytes.copy(buf, offset + 2, 0, len)
        buf.fill(0, offset + 2 + len, offset + this.size)
        break
      }

      default:
        throw new SchemaError(`Unknown type: ${this.type}`)
    }

    return this.size
  }

  /** Read value from `buf` at `offset`. */
  deserialize (buf, offset) {
    switch (this.type) {
      case T_INT:      return buf.readInt32LE(offset)
      case T_UINT:     return buf.readUInt32LE(offset)
      case T_BIGINT:   return buf.readBigInt64LE(offset)
      case T_FLOAT:    return buf.readFloatLE(offset)
      case T_DOUBLE:   return buf.readDoubleLE(offset)
      case T_BOOLEAN:  return buf.readUInt8(offset) !== 0
      case T_TIMESTAMP: return buf.readBigInt64LE(offset)

      case T_VARCHAR: {
        const len = buf.readUInt16LE(offset)
        return buf.toString('utf8', offset + 2, offset + 2 + len)
      }

      case T_JSON: {
        const len = buf.readUInt16LE(offset)
        const raw = buf.toString('utf8', offset + 2, offset + 2 + len)
        try { return JSON.parse(raw) } catch { return null }
      }

      default:
        throw new SchemaError(`Unknown type: ${this.type}`)
    }
  }
}

// ─── Schema ──────────────────────────────────────────────────────────────────

/**
 * Defines the shape of table rows, including serialisation layout.
 *
 * @example
 * const schema = new Schema({
 *   id:    { type: DataTypes.UINT, primary: true, autoIncrement: true },
 *   name:  DataTypes.VARCHAR(100),
 *   score: DataTypes.DOUBLE,
 * })
 */
class Schema {
  constructor (definition) {
    /** @type {Map<string, Column>} */
    this.columns = new Map()
    /** @type {string|null} Name of the primary-key column */
    this.primaryKey = null
    this.recordSize = 0

    for (const [name, raw] of Object.entries(definition)) {
      let typeInfo, opts = {}

      if (raw && raw.type && typeof raw.type === 'string') {
        // Plain DataType object: { type, size, ... }
        typeInfo = raw
      } else if (raw && raw.typeInfo) {
        // Column-descriptor object: { typeInfo, primary, nullable, ... }
        typeInfo = raw.typeInfo
        opts = raw
      } else {
        typeInfo = raw
      }

      const col = new Column(name, typeInfo, opts)
      this.columns.set(name, col)
      this.recordSize += col.size

      if (col.primary) {
        if (this.primaryKey !== null) {
          throw new SchemaError('Schema can only have one primary key')
        }
        this.primaryKey = name
      }
    }

    // Auto-detect primary key: first column named 'id' or first INT/UINT column
    if (!this.primaryKey) {
      for (const [name, col] of this.columns) {
        if (name === 'id') { this.primaryKey = name; break }
      }
      if (!this.primaryKey) {
        for (const [name, col] of this.columns) {
          if (col.type === T_INT || col.type === T_UINT) {
            this.primaryKey = name
            break
          }
        }
      }
    }
  }

  /** @returns {Column} */
  getColumn (name) {
    const col = this.columns.get(name)
    if (!col) throw new SchemaError(`Column '${name}' not found in schema`)
    return col
  }

  /** Validate a record object against the schema. */
  validate (record) {
    for (const [name, col] of this.columns) {
      const value = record[name]
      if (value !== undefined) {
        col.validate(value)
      } else if (!col.nullable && col.defaultValue === null && !col.autoIncrement) {
        throw new SchemaError(`Missing required field: '${name}'`)
      }
    }
  }

  /** Serialise a record object to a fixed-size Buffer. */
  serialize (record) {
    const buf = Buffer.alloc(this.recordSize)
    let offset = 0
    for (const [name, col] of this.columns) {
      let v = record[name]
      if (v === undefined) v = col.defaultValue
      col.serialize(buf, offset, v)
      offset += col.size
    }
    return buf
  }

  /** Deserialise a fixed-size Buffer back into a plain object. */
  deserialize (buf, startOffset = 0) {
    const record = {}
    let offset = startOffset
    for (const [name, col] of this.columns) {
      record[name] = col.deserialize(buf, offset)
      offset += col.size
    }
    return record
  }

  /** Extract the primary-key value from a record. */
  getPrimaryKey (record) {
    if (!this.primaryKey) throw new SchemaError('No primary key defined in schema')
    return record[this.primaryKey]
  }
}

module.exports = { DataTypes, Column, Schema }
