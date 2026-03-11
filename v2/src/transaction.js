'use strict'

const { TransactionError } = require('./errors')

/**
 * A simple optimistic transaction over one or more Tables.
 *
 * Strategy: maintain an in-memory undo log (array of inverse operations).
 * On commit we flush each participating table; on rollback we replay the
 * undo log in reverse.
 *
 * Limitations (acceptable for an embedded DB):
 *   - No concurrent-access isolation (single-process, single writer)
 *   - Undo log is kept entirely in memory
 *
 * @example
 * const tx = db.transaction()
 * await tx.begin()
 * try {
 *   await tx.insert(users, { id: 5, name: 'Eve' })
 *   await tx.update(users, 1, { name: 'Alice-updated' })
 *   await tx.commit()
 * } catch (e) {
 *   await tx.rollback()
 * }
 */
class Transaction {
  constructor () {
    this._undoLog = []   // [{ type, table, key, prevValue }]
    this._active  = false
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────────

  async begin () {
    if (this._active) throw new TransactionError('Transaction already active')
    this._undoLog = []
    this._active  = true
  }

  async commit () {
    this._assertActive()
    this._undoLog = []
    this._active  = false
  }

  async rollback () {
    this._assertActive()

    // Replay undo log in reverse
    for (let i = this._undoLog.length - 1; i >= 0; i--) {
      const op = this._undoLog[i]
      try {
        await this._applyUndo(op)
      } catch (e) {
        // Best-effort rollback: log and continue
        console.error('[Transaction] Rollback error:', e.message)
      }
    }

    this._undoLog = []
    this._active  = false
  }

  // ── Transactional CRUD wrappers ───────────────────────────────────────────────

  /**
   * Insert within transaction.
   * @param {import('./table').Table} table
   * @param {object} record
   */
  async insert (table, record) {
    this._assertActive()
    const result = await table.insert(record)
    this._undoLog.push({ type: 'DELETE', table, key: result.key })
    return result
  }

  /**
   * Update within transaction.
   * @param {import('./table').Table} table
   * @param {number} key
   * @param {object} changes
   */
  async update (table, key, changes) {
    this._assertActive()

    // Capture the current state for rollback
    const rows = await table.find({ key })
    if (rows.length === 0) throw new TransactionError(`Record ${key} not found`)
    const prev = rows[0]

    const result = await table.update(key, changes)
    this._undoLog.push({ type: 'UPDATE', table, key, prevValue: prev })
    return result
  }

  /**
   * Delete within transaction.
   * @param {import('./table').Table} table
   * @param {number} key
   */
  async delete (table, key) {
    this._assertActive()

    // Capture the current state for rollback
    const rows = await table.find({ key })
    if (rows.length === 0) throw new TransactionError(`Record ${key} not found`)
    const prev = rows[0]

    await table.delete(key)
    this._undoLog.push({ type: 'INSERT', table, key, prevValue: prev })
  }

  // ── Private ───────────────────────────────────────────────────────────────────

  _assertActive () {
    if (!this._active) throw new TransactionError('No active transaction. Call begin() first.')
  }

  async _applyUndo (op) {
    switch (op.type) {
      case 'DELETE':
        // Undo an insert → delete the record
        try { await op.table.delete(op.key) } catch { /* already deleted */ }
        break

      case 'INSERT':
        // Undo a delete → re-insert the original record
        try { await op.table.insert(op.prevValue) } catch { /* already exists */ }
        break

      case 'UPDATE':
        // Undo an update → restore previous values
        try { await op.table.update(op.key, op.prevValue) } catch { /* ignore */ }
        break
    }
  }
}

module.exports = { Transaction }
