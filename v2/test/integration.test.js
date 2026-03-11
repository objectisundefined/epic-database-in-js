'use strict'

/**
 * Integration tests – server / client + transaction support.
 *
 * The server is started on a random port for each relevant test, exercising
 * the full network stack end-to-end.
 */

const assert = require('assert')
const fs     = require('fs/promises')
const path   = require('path')
const os     = require('os')

const { Database }       = require('../src/database')
const { Schema, DataTypes } = require('../src/schema')
const { Transaction }    = require('../src/transaction')
const { DatabaseServer } = require('../src/server')
const { DatabaseClient } = require('../src/client')
const { RecordNotFoundError } = require('../src/errors')

const TMP_DIR = path.join(os.tmpdir(), 'v2-integration-tests')

let passed = 0
let failed = 0

async function test (name, fn) {
  try {
    await fn()
    console.log(`  ✅  ${name}`)
    passed++
  } catch (e) {
    console.log(`  ❌  ${name}`)
    console.log(`       ${e.message}`)
    if (process.env.VERBOSE) console.error(e.stack)
    failed++
  }
}

const SCHEMA = new Schema({
  id:    DataTypes.UINT,
  name:  DataTypes.VARCHAR(50),
  score: DataTypes.DOUBLE
})

// ── Transaction tests ─────────────────────────────────────────────────────────

console.log('\n── Integration tests ────────────────────────────────────────────────────\n')
console.log('  Transaction tests:')

;(async () => {
  await fs.mkdir(TMP_DIR, { recursive: true })

  await test('commit persists changes', async () => {
    const db = await Database.connect('tx-commit', TMP_DIR)
    const t  = await db.createTable('t', SCHEMA)
    await t.insert({ id: 1, name: 'Alice', score: 90 })

    const tx = new Transaction()
    await tx.begin()
    await tx.update(t, 1, { score: 100 })
    await tx.commit()

    const row = (await t.find({ key: 1 }))[0]
    assert.strictEqual(row.score, 100)
    await db.close()
  })

  await test('rollback reverts changes', async () => {
    const db = await Database.connect('tx-rollback', TMP_DIR)
    const t  = await db.createTable('t', SCHEMA)
    await t.insert({ id: 1, name: 'Bob', score: 80 })

    const tx = new Transaction()
    await tx.begin()
    await tx.update(t, 1, { score: 999 })
    await tx.rollback()

    const row = (await t.find({ key: 1 }))[0]
    assert.strictEqual(row.score, 80)
    await db.close()
  })

  await test('rollback reverts insert', async () => {
    const db = await Database.connect('tx-rollback-ins', TMP_DIR)
    const t  = await db.createTable('t', SCHEMA)

    const tx = new Transaction()
    await tx.begin()
    await tx.insert(t, { id: 5, name: 'Carol', score: 70 })
    await tx.rollback()

    assert.strictEqual((await t.find({ key: 5 })).length, 0)
    await db.close()
  })

  await test('rollback reverts delete', async () => {
    const db = await Database.connect('tx-rollback-del', TMP_DIR)
    const t  = await db.createTable('t', SCHEMA)
    await t.insert({ id: 9, name: 'Dan', score: 60 })

    const tx = new Transaction()
    await tx.begin()
    await tx.delete(t, 9)
    await tx.rollback()

    const row = (await t.find({ key: 9 }))[0]
    assert.ok(row, 'record should be restored after rollback')
    assert.strictEqual(row.name, 'Dan')
    await db.close()
  })

  // ── Server / client tests ──────────────────────────────────────────────────

  console.log('\n  Server / client tests:')

  const DATA_DIR = path.join(TMP_DIR, 'server-data')
  await fs.mkdir(DATA_DIR, { recursive: true })

  // Find a free port
  const port = 13306 + Math.floor(Math.random() * 1000)

  const server = new DatabaseServer({ port, dataDir: DATA_DIR })
  await server.start()

  const client = new DatabaseClient({ port, timeout: 5000 })
  await client.connect()

  await test('server ping/pong', async () => {
    await client.ping()   // no throw = pass
  })

  await test('useDatabase selects database', async () => {
    await client.useDatabase('testdb')   // no throw = pass
  })

  await test('createTable on server', async () => {
    await client.createTable('users', SCHEMA)
  })

  await test('listTables returns created table', async () => {
    const tables = await client.listTables()
    assert.ok(tables.includes('users'))
  })

  await test('remote insert and find', async () => {
    await client.insert('users', { id: 1, name: 'Remote-Alice', score: 88 })
    const rows = await client.find('users', { key: 1 })
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0].name, 'Remote-Alice')
  })

  await test('remote update', async () => {
    await client.update('users', 1, { score: 99 })
    const rows = await client.find('users', { key: 1 })
    assert.strictEqual(rows[0].score, 99)
  })

  await test('remote count', async () => {
    await client.insert('users', { id: 2, name: 'Remote-Bob', score: 75 })
    const n = await client.count('users')
    assert.strictEqual(n, 2)
  })

  await test('remote delete', async () => {
    await client.delete('users', 2)
    const n = await client.count('users')
    assert.strictEqual(n, 1)
  })

  await test('dropTable removes table', async () => {
    await client.dropTable('users')
    const tables = await client.listTables()
    assert.strictEqual(tables.includes('users'), false)
  })

  await client.close()
  await server.stop()

  // ── Summary ───────────────────────────────────────────────────────────────────

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Integration tests: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1

  await fs.rm(TMP_DIR, { recursive: true, force: true })
})().catch(e => { console.error(e); process.exitCode = 1 })
