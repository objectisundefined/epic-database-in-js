'use strict'

const assert = require('assert')
const fs     = require('fs/promises')
const path   = require('path')
const os     = require('os')
const { Pager }     = require('../src/pager')
const { BPlusTree } = require('../src/bplus-tree')
const { Schema, DataTypes } = require('../src/schema')

const TMP_DIR = path.join(os.tmpdir(), 'v2-bptree-tests')

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

async function mkTree (fileName, recordSize = 8) {
  const filePath = path.join(TMP_DIR, fileName)
  const pager    = new Pager(filePath)
  await pager.open(recordSize)
  const tree = new BPlusTree(pager, recordSize)
  if (pager.rootPageId === 0) await tree.create()
  return { pager, tree }
}

function makeVal (n, size = 8) {
  const buf = Buffer.alloc(size)
  buf.writeInt32LE(n, 0)
  return buf
}

function readVal (buf) {
  return buf.readInt32LE(0)
}

console.log('\n── B+ Tree tests ────────────────────────────────────────────────────────\n')

;(async () => {
  await fs.mkdir(TMP_DIR, { recursive: true })

  // ── Basic CRUD ──────────────────────────────────────────────────────────────

  await test('get returns null for missing key', async () => {
    const { tree } = await mkTree('get-null.db')
    assert.strictEqual(await tree.get(42), null)
  })

  await test('set and get a single entry', async () => {
    const { tree } = await mkTree('single.db')
    await tree.set(10, makeVal(10))
    const buf = await tree.get(10)
    assert.ok(buf !== null)
    assert.strictEqual(readVal(buf), 10)
  })

  await test('set updates existing key', async () => {
    const { tree } = await mkTree('update.db')
    await tree.set(1, makeVal(100))
    await tree.set(1, makeVal(200))
    assert.strictEqual(readVal(await tree.get(1)), 200)
  })

  await test('delete removes key', async () => {
    const { tree } = await mkTree('delete.db')
    await tree.set(5, makeVal(5))
    assert.ok(await tree.delete(5))
    assert.strictEqual(await tree.get(5), null)
  })

  await test('delete returns false for missing key', async () => {
    const { tree } = await mkTree('del-miss.db')
    assert.strictEqual(await tree.delete(999), false)
  })

  // ── Ordered inserts ─────────────────────────────────────────────────────────

  await test('10 sequential inserts in order', async () => {
    const { tree } = await mkTree('seq10.db')
    for (let i = 1; i <= 10; i++) await tree.set(i, makeVal(i))

    for (let i = 1; i <= 10; i++) {
      assert.strictEqual(readVal(await tree.get(i)), i, `key=${i}`)
    }
  })

  await test('scan returns all entries in key order', async () => {
    const { tree } = await mkTree('scan10.db')
    for (let i = 10; i >= 1; i--) await tree.set(i, makeVal(i))

    const entries = await tree.scan()
    assert.strictEqual(entries.length, 10)
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(entries[i].key, i + 1)
    }
  })

  // ── Range queries ───────────────────────────────────────────────────────────

  await test('range [3, 7] returns 5 entries', async () => {
    const { tree } = await mkTree('range1.db')
    for (let i = 1; i <= 10; i++) await tree.set(i, makeVal(i))

    const res = await tree.range(3, 7)
    assert.strictEqual(res.length, 5)
    assert.deepStrictEqual(res.map(e => e.key), [3, 4, 5, 6, 7])
  })

  await test('range with null bounds returns everything', async () => {
    const { tree } = await mkTree('range-null.db')
    for (let i = 1; i <= 5; i++) await tree.set(i, makeVal(i))

    const res = await tree.range(null, null)
    assert.strictEqual(res.length, 5)
  })

  await test('range with only minKey', async () => {
    const { tree } = await mkTree('range-min.db')
    for (let i = 1; i <= 5; i++) await tree.set(i, makeVal(i))
    const res = await tree.range(3, null)
    assert.deepStrictEqual(res.map(e => e.key), [3, 4, 5])
  })

  await test('range with only maxKey', async () => {
    const { tree } = await mkTree('range-max.db')
    for (let i = 1; i <= 5; i++) await tree.set(i, makeVal(i))
    const res = await tree.range(null, 3)
    assert.deepStrictEqual(res.map(e => e.key), [1, 2, 3])
  })

  // ── Count ───────────────────────────────────────────────────────────────────

  await test('count returns 0 for empty tree', async () => {
    const { tree } = await mkTree('count0.db')
    assert.strictEqual(await tree.count(), 0)
  })

  await test('count returns correct value after inserts', async () => {
    const { tree } = await mkTree('count5.db')
    for (let i = 1; i <= 5; i++) await tree.set(i, makeVal(i))
    assert.strictEqual(await tree.count(), 5)
  })

  await test('count updates after delete', async () => {
    const { tree } = await mkTree('count-del.db')
    for (let i = 1; i <= 3; i++) await tree.set(i, makeVal(i))
    await tree.delete(2)
    assert.strictEqual(await tree.count(), 2)
  })

  // ── Tree splits (many inserts that force page splits) ───────────────────────

  await test('100 inserts all retrievable', async () => {
    const { tree } = await mkTree('split100.db')
    for (let i = 1; i <= 100; i++) await tree.set(i, makeVal(i))
    for (let i = 1; i <= 100; i++) {
      const buf = await tree.get(i)
      assert.ok(buf !== null, `missing key ${i}`)
      assert.strictEqual(readVal(buf), i)
    }
  })

  await test('100 inserts in reverse order all retrievable', async () => {
    const { tree } = await mkTree('split100-rev.db')
    for (let i = 100; i >= 1; i--) await tree.set(i, makeVal(i))
    for (let i = 1; i <= 100; i++) {
      assert.ok(await tree.get(i) !== null, `missing key ${i}`)
    }
  })

  await test('100 random-order inserts all retrievable', async () => {
    const { tree } = await mkTree('split100-rand.db')
    const keys = Array.from({ length: 100 }, (_, i) => i + 1)
    // Shuffle
    for (let i = keys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]]
    }
    for (const k of keys) await tree.set(k, makeVal(k))
    for (const k of keys) {
      const buf = await tree.get(k)
      assert.ok(buf !== null, `missing key ${k}`)
    }
  })

  await test('500 inserts produce correct scan order', async () => {
    const { tree } = await mkTree('scan500.db')
    for (let i = 1; i <= 500; i++) await tree.set(i, makeVal(i))
    const entries = await tree.scan()
    assert.strictEqual(entries.length, 500)
    for (let i = 0; i < 500; i++) {
      assert.strictEqual(entries[i].key, i + 1, `out of order at index ${i}`)
    }
  })

  // ── Delete with rebalancing ─────────────────────────────────────────────────

  await test('delete from middle of many entries', async () => {
    const { tree } = await mkTree('del-mid.db')
    for (let i = 1; i <= 50; i++) await tree.set(i, makeVal(i))
    await tree.delete(25)
    assert.strictEqual(await tree.get(25), null)
    // Remaining entries still intact
    for (let i = 1; i <= 50; i++) {
      if (i === 25) continue
      assert.ok(await tree.get(i) !== null, `missing key ${i}`)
    }
  })

  await test('delete all entries leaves count=0', async () => {
    const { tree } = await mkTree('del-all.db')
    for (let i = 1; i <= 20; i++) await tree.set(i, makeVal(i))
    for (let i = 1; i <= 20; i++) await tree.delete(i)
    assert.strictEqual(await tree.count(), 0)
  })

  // ── Persistence ─────────────────────────────────────────────────────────────

  await test('data persists across pager close/reopen', async () => {
    const filePath = path.join(TMP_DIR, 'persist.db')
    const schema   = new Schema({ id: DataTypes.UINT, v: DataTypes.DOUBLE })
    const recSize  = schema.recordSize

    // Write
    {
      const pager = new Pager(filePath)
      await pager.open(recSize)
      const tree = new BPlusTree(pager, recSize)
      await tree.create()
      for (let i = 1; i <= 5; i++) {
        await tree.set(i, schema.serialize({ id: i, v: i * 1.5 }))
      }
      await pager.flush()
      await pager.close()
    }

    // Read back
    {
      const pager = new Pager(filePath)
      await pager.open(recSize)
      const tree = new BPlusTree(pager, recSize)
      for (let i = 1; i <= 5; i++) {
        const buf = await tree.get(i)
        assert.ok(buf !== null, `missing key ${i} after reopen`)
        const obj = schema.deserialize(buf)
        assert.strictEqual(obj.id, i)
        assert.ok(Math.abs(obj.v - i * 1.5) < 1e-9)
      }
      await pager.close()
    }
  })

  // ── Summary ─────────────────────────────────────────────────────────────────

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`B+ Tree tests: ${passed} passed, ${failed} failed`)
  if (failed > 0) process.exitCode = 1

  // Cleanup
  await fs.rm(TMP_DIR, { recursive: true, force: true })
})().catch(e => { console.error(e); process.exitCode = 1 })
