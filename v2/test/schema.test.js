'use strict'

const assert = require('assert')
const { Schema, DataTypes, Column } = require('../src/schema')
const { SchemaError } = require('../src/errors')

let passed = 0
let failed = 0

function test (name, fn) {
  try {
    fn()
    console.log(`  ✅  ${name}`)
    passed++
  } catch (e) {
    console.log(`  ❌  ${name}`)
    console.log(`       ${e.message}`)
    failed++
  }
}

console.log('\n── Schema tests ─────────────────────────────────────────────────────────\n')

// ── DataTypes ─────────────────────────────────────────────────────────────────

test('DataTypes.INT has correct size', () => {
  assert.strictEqual(DataTypes.INT.size, 4)
})

test('DataTypes.UINT has correct size', () => {
  assert.strictEqual(DataTypes.UINT.size, 4)
})

test('DataTypes.BIGINT has correct size', () => {
  assert.strictEqual(DataTypes.BIGINT.size, 8)
})

test('DataTypes.FLOAT has correct size', () => {
  assert.strictEqual(DataTypes.FLOAT.size, 4)
})

test('DataTypes.DOUBLE has correct size', () => {
  assert.strictEqual(DataTypes.DOUBLE.size, 8)
})

test('DataTypes.BOOLEAN has correct size', () => {
  assert.strictEqual(DataTypes.BOOLEAN.size, 1)
})

test('DataTypes.TIMESTAMP has correct size', () => {
  assert.strictEqual(DataTypes.TIMESTAMP.size, 8)
})

test('DataTypes.VARCHAR(100) has size 102', () => {
  assert.strictEqual(DataTypes.VARCHAR(100).size, 102)
})

test('DataTypes.JSON(256) has size 258', () => {
  assert.strictEqual(DataTypes.JSON(256).size, 258)
})

// ── Schema creation ────────────────────────────────────────────────────────────

test('Schema computes correct recordSize', () => {
  const schema = new Schema({
    id:   DataTypes.UINT,    // 4
    name: DataTypes.VARCHAR(10), // 12
    active: DataTypes.BOOLEAN  // 1
  })
  assert.strictEqual(schema.recordSize, 17)
})

test('Schema detects primary key named id', () => {
  const schema = new Schema({
    id:   DataTypes.UINT,
    name: DataTypes.VARCHAR(20)
  })
  assert.strictEqual(schema.primaryKey, 'id')
})

test('Schema detects explicit primary key', () => {
  const schema = new Schema({
    uid:  { typeInfo: DataTypes.UINT, primary: true },
    name: DataTypes.VARCHAR(20)
  })
  assert.strictEqual(schema.primaryKey, 'uid')
})

test('Schema throws on two primary keys', () => {
  assert.throws(() => new Schema({
    a: { typeInfo: DataTypes.UINT, primary: true },
    b: { typeInfo: DataTypes.UINT, primary: true }
  }), SchemaError)
})

// ── Validation ────────────────────────────────────────────────────────────────

test('Column.validate INT accepts valid integer', () => {
  const col = new Column('x', DataTypes.INT)
  assert.doesNotThrow(() => col.validate(42))
})

test('Column.validate INT rejects float', () => {
  const col = new Column('x', DataTypes.INT)
  assert.throws(() => col.validate(1.5), SchemaError)
})

test('Column.validate INT rejects overflow', () => {
  const col = new Column('x', DataTypes.INT)
  assert.throws(() => col.validate(3000000000), SchemaError)
})

test('Column.validate VARCHAR rejects too-long string', () => {
  const col = new Column('x', DataTypes.VARCHAR(5))
  assert.throws(() => col.validate('toolong'), SchemaError)
})

test('Column.validate nullable allows null', () => {
  const col = new Column('x', DataTypes.INT, { nullable: true })
  assert.doesNotThrow(() => col.validate(null))
})

test('Column.validate non-nullable throws on null', () => {
  const col = new Column('x', DataTypes.INT, { nullable: false })
  assert.throws(() => col.validate(null), SchemaError)
})

// ── Serialisation / deserialisation ──────────────────────────────────────────

test('INT round-trips correctly', () => {
  const schema = new Schema({ id: DataTypes.INT })
  const buf = schema.serialize({ id: -42 })
  const obj = schema.deserialize(buf)
  assert.strictEqual(obj.id, -42)
})

test('UINT round-trips correctly', () => {
  const schema = new Schema({ id: DataTypes.UINT })
  const buf = schema.serialize({ id: 4294967295 })
  const obj = schema.deserialize(buf)
  assert.strictEqual(obj.id, 4294967295)
})

test('BIGINT round-trips correctly', () => {
  const schema = new Schema({ id: DataTypes.BIGINT })
  const buf = schema.serialize({ id: 9007199254740992n })
  const obj = schema.deserialize(buf)
  assert.strictEqual(obj.id, 9007199254740992n)
})

test('FLOAT round-trips approximately', () => {
  const schema = new Schema({ v: DataTypes.FLOAT })
  const buf = schema.serialize({ v: 3.14 })
  const obj = schema.deserialize(buf)
  assert.ok(Math.abs(obj.v - 3.14) < 0.001)
})

test('DOUBLE round-trips exactly', () => {
  const schema = new Schema({ v: DataTypes.DOUBLE })
  const buf = schema.serialize({ v: 3.141592653589793 })
  const obj = schema.deserialize(buf)
  assert.strictEqual(obj.v, 3.141592653589793)
})

test('BOOLEAN round-trips true', () => {
  const schema = new Schema({ v: DataTypes.BOOLEAN })
  const buf = schema.serialize({ v: true })
  assert.strictEqual(schema.deserialize(buf).v, true)
})

test('BOOLEAN round-trips false', () => {
  const schema = new Schema({ v: DataTypes.BOOLEAN })
  const buf = schema.serialize({ v: false })
  assert.strictEqual(schema.deserialize(buf).v, false)
})

test('VARCHAR round-trips ASCII string', () => {
  const schema = new Schema({ s: DataTypes.VARCHAR(50) })
  const buf = schema.serialize({ s: 'hello world' })
  assert.strictEqual(schema.deserialize(buf).s, 'hello world')
})

test('VARCHAR round-trips UTF-8 string', () => {
  const schema = new Schema({ s: DataTypes.VARCHAR(50) })
  const str = 'héllo wörld'
  const buf = schema.serialize({ s: str })
  assert.strictEqual(schema.deserialize(buf).s, str)
})

test('JSON round-trips object', () => {
  const schema = new Schema({ data: DataTypes.JSON(256) })
  const obj = { foo: 'bar', nums: [1, 2, 3] }
  const buf = schema.serialize({ data: obj })
  assert.deepStrictEqual(schema.deserialize(buf).data, obj)
})

test('Multi-column schema round-trips', () => {
  const schema = new Schema({
    id:     DataTypes.UINT,
    name:   DataTypes.VARCHAR(30),
    score:  DataTypes.DOUBLE,
    active: DataTypes.BOOLEAN
  })
  const record = { id: 7, name: 'Alice', score: 99.5, active: true }
  const buf = schema.serialize(record)
  const got = schema.deserialize(buf)
  assert.strictEqual(got.id,     record.id)
  assert.strictEqual(got.name,   record.name)
  assert.strictEqual(got.score,  record.score)
  assert.strictEqual(got.active, record.active)
})

test('Schema.getPrimaryKey extracts correct value', () => {
  const schema = new Schema({ id: DataTypes.UINT, name: DataTypes.VARCHAR(20) })
  assert.strictEqual(schema.getPrimaryKey({ id: 5, name: 'x' }), 5)
})

// ── Summary ───────────────────────────────────────────────────────────────────

console.log(`\n${'─'.repeat(60)}`)
console.log(`Schema tests: ${passed} passed, ${failed} failed`)
if (failed > 0) process.exitCode = 1
