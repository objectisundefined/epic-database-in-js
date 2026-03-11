'use strict'

const assert = require('assert')
const fs     = require('fs/promises')
const path   = require('path')
const os     = require('os')
const { Database }   = require('../src/database')
const { Schema, DataTypes } = require('../src/schema')
const {
  DuplicateKeyError,
  RecordNotFoundError,
  TableExistsError
} = require('../src/errors')

const TMP_DIR = path.join(os.tmpdir(), 'v2-table-tests')

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

/** Open a fresh, isolated database for each test. */
async function mkDb (name) {
  const db = await Database.connect(name, TMP_DIR)
  return db
}

const USER_SCHEMA = new Schema({
  id:    DataTypes.UINT,
  name:  DataTypes.VARCHAR(50),
  score: DataTypes.DOUBLE
})

console.log('\n── Table tests ──────────────────────────────────────────────────────────\n')

;(async () => {
  await fs.mkdir(TMP_DIR, { recursive: true })

  // ── Database ─────────────────────────────────────────────────────────────────

  await test('Database.connect creates directory', async () => {
    const db = await mkDb('dir-test')
    assert.ok(db._connected)
    await db.close()
  })

  await test('Database.listTables returns created tables', async () => {
    const db = await mkDb('list-test')
    await db.createTable('alpha', USER_SCHEMA)
    await db.createTable('beta',  USER_SCHEMA)
    const names = db.listTables()
    assert.ok(names.includes('alpha'))
    assert.ok(names.includes('beta'))
    await db.close()
  })

  await test('createTable throws TableExistsError on duplicate', async () => {
    const db = await mkDb('dup-tbl')
    await db.createTable('t', USER_SCHEMA)
    await assert.rejects(() => db.createTable('t', USER_SCHEMA), TableExistsError)
    await db.close()
  })

  await test('dropTable removes table', async () => {
    const db = await mkDb('drop-test')
    await db.createTable('tmp', USER_SCHEMA)
    await db.dropTable('tmp')
    assert.strictEqual(db.listTables().includes('tmp'), false)
    await db.close()
  })

  // ── Insert ────────────────────────────────────────────────────────────────────

  await test('insert returns correct key', async () => {
    const db = await mkDb('ins-key')
    const t  = await db.createTable('t', USER_SCHEMA)
    const { key } = await t.insert({ id: 42, name: 'Bob', score: 77.7 })
    assert.strictEqual(key, 42)
    await db.close()
  })

  await test('insert throws DuplicateKeyError on duplicate PK', async () => {
    const db = await mkDb('dup-key')
    const t  = await db.createTable('t', USER_SCHEMA)
    await t.insert({ id: 1, name: 'A', score: 1 })
    await assert.rejects(() => t.insert({ id: 1, name: 'B', score: 2 }), DuplicateKeyError)
    await db.close()
  })

  await test('insert auto-assigns PK when omitted', async () => {
    const db = await mkDb('auto-pk')
    const t  = await db.createTable('t', USER_SCHEMA)
    const r1 = await t.insert({ name: 'Auto1', score: 1 })
    const r2 = await t.insert({ name: 'Auto2', score: 2 })
    assert.ok(r1.key > 0)
    assert.ok(r2.key > r1.key)
    await db.close()
  })

  // ── Find ──────────────────────────────────────────────────────────────────────

  await test('find by key returns single record', async () => {
    const db = await mkDb('find-key')
    const t  = await db.createTable('t', USER_SCHEMA)
    await t.insert({ id: 3, name: 'Carol', score: 55.5 })
    const rows = await t.find({ key: 3 })
    assert.strictEqual(rows.length, 1)
    assert.strictEqual(rows[0].name, 'Carol')
    assert.ok(Math.abs(rows[0].score - 55.5) < 1e-9)
    await db.close()
  })

  await test('find by key returns empty array for missing', async () => {
    const db = await mkDb('find-miss')
    const t  = await db.createTable('t', USER_SCHEMA)
    const rows = await t.find({ key: 999 })
    assert.strictEqual(rows.length, 0)
    await db.close()
  })

  await test('find all returns all records', async () => {
    const db = await mkDb('find-all')
    const t  = await db.createTable('t', USER_SCHEMA)
    for (let i = 1; i <= 5; i++) {
      await t.insert({ id: i, name: `User${i}`, score: i * 10 })
    }
    const rows = await t.find()
    assert.strictEqual(rows.length, 5)
    await db.close()
  })

  await test('find with range where clause', async () => {
    const db = await mkDb('find-range')
    const t  = await db.createTable('t', USER_SCHEMA)
    for (let i = 1; i <= 20; i++) await t.insert({ id: i, name: `U${i}`, score: i })
    const rows = await t.find({ where: { gte: 5, lte: 10 } })
    assert.strictEqual(rows.length, 6)
    assert.ok(rows.every(r => r.id >= 5 && r.id <= 10))
    await db.close()
  })

  await test('find with limit', async () => {
    const db = await mkDb('find-limit')
    const t  = await db.createTable('t', USER_SCHEMA)
    for (let i = 1; i <= 10; i++) await t.insert({ id: i, name: `U${i}`, score: i })
    const rows = await t.find({ limit: 3 })
    assert.strictEqual(rows.length, 3)
    await db.close()
  })

  await test('find with offset', async () => {
    const db = await mkDb('find-offset')
    const t  = await db.createTable('t', USER_SCHEMA)
    for (let i = 1; i <= 5; i++) await t.insert({ id: i, name: `U${i}`, score: i })
    const rows = await t.find({ offset: 3 })
    assert.strictEqual(rows.length, 2)
    await db.close()
  })

  // ── Update ────────────────────────────────────────────────────────────────────

  await test('update modifies a field', async () => {
    const db = await mkDb('upd-field')
    const t  = await db.createTable('t', USER_SCHEMA)
    await t.insert({ id: 1, name: 'Dave', score: 60 })
    await t.update(1, { score: 95 })
    const row = (await t.find({ key: 1 }))[0]
    assert.strictEqual(row.score, 95)
    await db.close()
  })

  await test('update preserves un-changed fields', async () => {
    const db = await mkDb('upd-preserve')
    const t  = await db.createTable('t', USER_SCHEMA)
    await t.insert({ id: 2, name: 'Eve', score: 80 })
    await t.update(2, { name: 'Eve-updated' })
    const row = (await t.find({ key: 2 }))[0]
    assert.strictEqual(row.name, 'Eve-updated')
    assert.strictEqual(row.score, 80)
    await db.close()
  })

  await test('update throws RecordNotFoundError for missing key', async () => {
    const db = await mkDb('upd-miss')
    const t  = await db.createTable('t', USER_SCHEMA)
    await assert.rejects(() => t.update(999, { score: 0 }), RecordNotFoundError)
    await db.close()
  })

  // ── Delete ────────────────────────────────────────────────────────────────────

  await test('delete removes record', async () => {
    const db = await mkDb('del-rec')
    const t  = await db.createTable('t', USER_SCHEMA)
    await t.insert({ id: 7, name: 'Frank', score: 40 })
    await t.delete(7)
    assert.strictEqual((await t.find({ key: 7 })).length, 0)
    await db.close()
  })

  await test('delete throws RecordNotFoundError for missing key', async () => {
    const db = await mkDb('del-miss')
    const t  = await db.createTable('t', USER_SCHEMA)
    await assert.rejects(() => t.delete(404), RecordNotFoundError)
    await db.close()
  })

  // ── Count ─────────────────────────────────────────────────────────────────────

  await test('count returns 0 for empty table', async () => {
    const db = await mkDb('cnt0')
    const t  = await db.createTable('t', USER_SCHEMA)
    assert.strictEqual(await t.count(), 0)
    await db.close()
  })

  await test('count returns correct number after inserts', async () => {
    const db = await mkDb('cnt5')
    const t  = await db.createTable('t', USER_SCHEMA)
    for (let i = 1; i <= 5; i++) await t.insert({ id: i, name: `U${i}`, score: i })
    assert.strictEqual(await t.count(), 5)
    await db.close()
  })

  // ── Large dataset ─────────────────────────────────────────────────────────────

  await test('500 records insert, range-query, and delete', async () => {
    const db = await mkDb('large500')
    const t  = await db.createTable('t', USER_SCHEMA)

    for (let i = 1; i <= 500; i++) {
      await t.insert({ id: i, name: `User${i}`, score: i * 0.5 })
    }

    assert.strictEqual(await t.count(), 500)

    const range = await t.find({ where: { gte: 100, lte: 200 } })
    assert.strictEqual(range.length, 101)

    // Verify ordering
    for (let i = 0; i < range.length - 1; i++) {
      assert.ok(range[i].id < range[i + 1].id, 'records not in ascending order')
    }

    // Delete half
    for (let i = 1; i <= 250; i++) await t.delete(i)
    assert.strictEqual(await t.count(), 250)

    await db.close()
  })

  // ── Query builder ─────────────────────────────────────────────────────────────

  await test('query().where().execute() filters correctly', async () => {
    const db = await mkDb('qb-where')
    const t  = await db.createTable('t', USER_SCHEMA)
    for (let i = 1; i <= 10; i++) await t.insert({ id: i, name: `U${i}`, score: i * 10 })

    const rows = await t.query().where('score', '>=', 50).execute()
    assert.ok(rows.every(r => r.score >= 50))
    await db.close()
  })

  await test('query().orderBy().execute() sorts correctly', async () => {
    const db = await mkDb('qb-order')
    const t  = await db.createTable('t', USER_SCHEMA)
    for (let i = 1; i <= 5; i++) await t.insert({ id: i, name: `U${i}`, score: (6 - i) * 10 })

    const rows = await t.query().orderBy('score', 'ASC').execute()
    for (let i = 0; i < rows.length - 1; i++) {
      assert.ok(rows[i].score <= rows[i + 1].score)
    }
    await db.close()
  })

  await test('query().limit().offset() paginates correctly', async () => {
    const db = await mkDb('qb-page')
    const t  = await db.createTable('t', USER_SCHEMA)
    for (let i = 1; i <= 10; i++) await t.insert({ id: i, name: `U${i}`, score: i })

    const page1 = await t.query().limit(3).offset(0).execute()
    const page2 = await t.query().limit(3).offset(3).execute()
    assert.strictEqual(page1.length, 3)
    assert.strictEqual(page2.length, 3)
    assert.notDeepStrictEqual(page1, page2)
    await db.close()
  })

  // ── Multiple schemas ─────────────────────────────────────────────────────────

  await test('tables with different schemas co-exist', async () => {
    const db = await mkDb('multi-schema')

    const logSchema = new Schema({
      id:        DataTypes.UINT,
      level:     DataTypes.UINT,
      message:   DataTypes.VARCHAR(200),
      timestamp: DataTypes.BIGINT
    })

    const users = await db.createTable('users', USER_SCHEMA)
    const logs  = await db.createTable('logs',  logSchema)

    await users.insert({ id: 1, name: 'Alice', score: 90 })
    await logs.insert({ id: 1, level: 2, message: 'hello', timestamp: BigInt(Date.now()) })

    assert.strictEqual(await users.count(), 1)
    assert.strictEqual(await logs.count(), 1)

    const u = (await users.find({ key: 1 }))[0]
    assert.strictEqual(u.name, 'Alice')

    await db.close()
  })

  // ── Summary ───────────────────────────────────────────────────────────────────

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Table tests: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1

  await fs.rm(TMP_DIR, { recursive: true, force: true })
})().catch(e => { console.error(e); process.exitCode = 1 })
