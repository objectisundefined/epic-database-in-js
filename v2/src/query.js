'use strict'

/**
 * Fluent query builder for a Table.
 *
 * @example
 * const results = await table.query()
 *   .where('score', '>=', 90)
 *   .orderBy('score', 'DESC')
 *   .limit(10)
 *   .execute()
 */
class QueryBuilder {
  /**
   * @param {import('./table').Table} table
   */
  constructor (table) {
    this._table      = table
    this._conditions = []   // [{ field, op, value }]
    this._orderField = null
    this._orderDir   = 'ASC'
    this._limitVal   = null
    this._offsetVal  = 0

    // Primary-key range hints (passed straight to the B+ tree range query)
    this._pkMin = null
    this._pkMax = null
  }

  // ── Fluent modifiers ──────────────────────────────────────────────────────────

  /**
   * Add a WHERE condition.
   *
   * Two call signatures:
   *   .where(field, op, value)   e.g. .where('age', '>=', 18)
   *   .where({ field: value })   equality shorthand
   *
   * Supported ops: '=', '!=', '<', '<=', '>', '>=', 'LIKE', 'IN'
   */
  where (fieldOrObj, op, value) {
    if (typeof fieldOrObj === 'object' && fieldOrObj !== null) {
      for (const [f, v] of Object.entries(fieldOrObj)) {
        this._conditions.push({ field: f, op: '=', value: v })
        this._updatePkHint(f, '=', v)
      }
    } else {
      this._conditions.push({ field: fieldOrObj, op, value })
      this._updatePkHint(fieldOrObj, op, value)
    }
    return this
  }

  /** @param {'ASC'|'DESC'} [dir='ASC'] */
  orderBy (field, dir = 'ASC') {
    this._orderField = field
    this._orderDir   = dir.toUpperCase()
    return this
  }

  limit (n) {
    this._limitVal = n
    return this
  }

  offset (n) {
    this._offsetVal = n
    return this
  }

  // ── Terminal methods ──────────────────────────────────────────────────────────

  /** Execute and return all matching records. */
  async execute () {
    const rawOpts = {}

    if (this._pkMin !== null || this._pkMax !== null) {
      rawOpts.where = {}
      if (this._pkMin !== null) rawOpts.where.gte = this._pkMin
      if (this._pkMax !== null) rawOpts.where.lte = this._pkMax
    }

    let records = await this._table.find(rawOpts)

    // Apply in-memory filters for non-PK conditions
    const nonPkConds = this._conditions.filter(c => {
      const pk = this._table.schema.primaryKey
      return c.field !== pk
    })

    if (nonPkConds.length > 0) {
      records = records.filter(r => this._matchAll(r, nonPkConds))
    }

    // Sorting
    if (this._orderField) {
      const f   = this._orderField
      const dir = this._orderDir === 'DESC' ? -1 : 1
      records = records.slice().sort((a, b) => {
        if (a[f] < b[f]) return -dir
        if (a[f] > b[f]) return dir
        return 0
      })
    }

    // Offset / limit
    if (this._offsetVal) records = records.slice(this._offsetVal)
    if (this._limitVal !== null) records = records.slice(0, this._limitVal)

    return records
  }

  /** Execute and return the first record or null. */
  async first () {
    const results = await this.limit(1).execute()
    return results[0] ?? null
  }

  /** Count matching records. */
  async count () {
    const results = await this.execute()
    return results.length
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  /** Keep track of primary-key range hints to speed up tree traversal. */
  _updatePkHint (field, op, value) {
    const pk = this._table.schema.primaryKey
    if (field !== pk) return

    switch (op) {
      case '=':  this._pkMin = value; this._pkMax = value; break
      case '>=': this._pkMin = value; break
      case '>':  this._pkMin = value + 1; break
      case '<=': this._pkMax = value; break
      case '<':  this._pkMax = value - 1; break
    }
  }

  _matchAll (record, conditions) {
    return conditions.every(c => this._match(record, c))
  }

  _match (record, { field, op, value }) {
    const rv = record[field]
    switch (op) {
      case '=':    return rv === value
      case '!=':   return rv !== value
      case '<':    return rv < value
      case '<=':   return rv <= value
      case '>':    return rv > value
      case '>=':   return rv >= value
      case 'IN':   return Array.isArray(value) && value.includes(rv)
      case 'LIKE': {
        // Simple SQL LIKE: % matches any sequence, _ matches one char
        const pattern = '^' + String(value)
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')  // escape regex special chars
          .replace(/%/g, '.*')
          .replace(/_/g, '.') + '$'
        return new RegExp(pattern, 'i').test(String(rv))
      }
      default: return true
    }
  }
}

/**
 * Mixin: add `.query()` method to a Table instance.
 * Called by Table itself — not needed directly by users.
 */
function addQueryBuilder (TableClass) {
  TableClass.prototype.query = function () {
    return new QueryBuilder(this)
  }
}

module.exports = { QueryBuilder, addQueryBuilder }
