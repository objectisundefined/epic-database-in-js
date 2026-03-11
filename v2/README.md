# epic-database-in-js — v2

A ground-up, production-quality JavaScript database engine, built the way
MySQL and InnoDB would be built if they were written in modern Node.js.

---

## Architecture

```
v2/
├── index.js              Public API
└── src/
    ├── errors.js         Custom error types
    ├── schema.js         DataTypes + Schema (serialisation / deserialisation)
    ├── pager.js          Page-level disk I/O with LRU cache
    ├── bplus-tree.js     Full B+ tree (insert · delete · range · scan)
    ├── table.js          Table CRUD backed by the B+ tree
    ├── database.js       Database — manages multiple tables
    ├── query.js          Fluent query builder (WHERE · ORDER BY · LIMIT · OFFSET)
    ├── transaction.js    Optimistic transactions with undo log
    ├── protocol.js       Length-prefixed JSON wire protocol
    ├── server.js         TCP database server
    └── client.js         TCP database client
```

### Storage layer

Every table is a single `.db` file laid out as fixed-size **4 096-byte pages**:

| Page | Content |
|------|---------|
| 0 | File header (magic, version, root page-id, auto-increment counter, record size) |
| 1+ | B+ tree nodes (internal or leaf) |

The **Pager** reads / writes pages by ID, keeps the hot set in an in-memory
LRU cache, and tracks dirty pages for write-back on flush.

### B+ tree index

Every table row is stored exactly once — in a leaf node of the B+ tree.
The tree is fully disk-based: each node occupies exactly one page.

```
Page layout (4096 bytes)
─────────────────────────────────
[  0 ] type      uint8   (1=internal, 2=leaf)
[1-2 ] keyCount  uint16
[  3 ] flags     uint8
[4- 7] nextLeaf  uint32  (leaf only)
[8-11] prevLeaf  uint32  (leaf only)
[12-15]          reserved
[16+ ] data area (4080 bytes)

Internal node data area:
  child₀, key₀, child₁, key₁, …, key_{N-1}, child_N
  • child = 4-byte page-id
  • key   = 4-byte int32 primary key
  • Capacity: 508 keys per node

Leaf node data area:
  (key₀, value₀), (key₁, value₁), …
  • key   = 4-byte int32
  • value = schema.recordSize bytes
  • Capacity: floor(4080 / (4 + recordSize)) − 1 entries per node
```

Leaf nodes form a **doubly-linked list** for O(log n + k) range queries.

Full rebalancing on delete: redistribute keys from siblings first, then merge.

---

## Quick start

```js
const { Database, Schema, DataTypes } = require('./v2')

// Open / create a database
const db = await Database.connect('shop', './data')

// Define a schema
const schema = new Schema({
  id:       DataTypes.UINT,
  name:     DataTypes.VARCHAR(100),
  price:    DataTypes.DOUBLE,
  in_stock: DataTypes.BOOLEAN,
})

// Create a table (one .db file per table)
const products = await db.createTable('products', schema)

// Insert
await products.insert({ id: 1, name: 'Widget', price: 9.99, in_stock: true })
await products.insert({ id: 2, name: 'Gadget', price: 24.99, in_stock: false })

// Point lookup
const row = (await products.find({ key: 1 }))[0]
// → { id: 1, name: 'Widget', price: 9.99, in_stock: true }

// Range query  (uses the leaf linked-list, O(log n + k))
const cheap = await products.find({ where: { gte: 1, lte: 10 } })

// Fluent query builder
const results = await products.query()
  .where('price', '<=', 20)
  .orderBy('price', 'ASC')
  .limit(5)
  .execute()

// Update (partial — unchanged fields are preserved)
await products.update(1, { price: 8.99 })

// Delete
await products.delete(2)

// Count
console.log(await products.count())   // 1

await db.close()
```

---

## Data types

| Type | Bytes | JS value |
|------|-------|----------|
| `DataTypes.INT` | 4 | `number` (signed 32-bit) |
| `DataTypes.UINT` | 4 | `number` (unsigned 32-bit) |
| `DataTypes.BIGINT` | 8 | `bigint` |
| `DataTypes.FLOAT` | 4 | `number` |
| `DataTypes.DOUBLE` | 8 | `number` |
| `DataTypes.BOOLEAN` | 1 | `boolean` |
| `DataTypes.TIMESTAMP` | 8 | `bigint` (ms since epoch) |
| `DataTypes.VARCHAR(n)` | n+2 | `string` (UTF-8, max n bytes) |
| `DataTypes.JSON(n)` | n+2 | any JSON-serialisable value |

---

## Query builder

```js
const rows = await table.query()
  .where('age', '>=', 18)          // comparison: =, !=, <, <=, >, >=
  .where('name', 'LIKE', 'A%')     // SQL LIKE  (% = any, _ = one char)
  .where('role', 'IN', ['admin', 'mod'])
  .where({ verified: true })        // shorthand equality
  .orderBy('age', 'DESC')
  .limit(10)
  .offset(0)
  .execute()

const first = await table.query().where('id', '=', 5).first()
const count = await table.query().where('active', '=', true).count()
```

Primary-key conditions (`WHERE id >= x AND id <= y`) are pushed down to the
B+ tree range query, so only the matching leaf pages are read.

---

## Transactions

```js
const { Transaction } = require('./v2')

const tx = new Transaction()
await tx.begin()

try {
  await tx.insert(users, { id: 10, name: 'Frank', score: 88 })
  await tx.update(users, 1,  { score: 95 })
  await tx.delete(users, 7)
  await tx.commit()
} catch (err) {
  await tx.rollback()   // restores all three operations
  throw err
}
```

The transaction keeps an in-memory **undo log** (array of inverse operations).
`rollback()` replays the log in reverse order.

---

## Remote access (TCP server / client)

```js
// ── Server ────────────────────────────────────────────────────────────────────
const { DatabaseServer } = require('./v2')

const server = new DatabaseServer({ port: 3306, dataDir: './data' })
await server.start()
console.log('Listening on port 3306')

// ── Client ────────────────────────────────────────────────────────────────────
const { DatabaseClient, Schema, DataTypes } = require('./v2')

const client = new DatabaseClient({ host: 'localhost', port: 3306 })
await client.connect()

await client.useDatabase('shop')
await client.createTable('users', new Schema({ id: DataTypes.UINT, name: DataTypes.VARCHAR(50) }))

await client.insert('users', { id: 1, name: 'Alice' })
const rows = await client.find('users', { where: { gte: 1, lte: 100 } })
await client.close()
await server.stop()
```

### Wire protocol

Every message is framed as:

```
┌───────────────┬────────────┬──────────────────────────┐
│  4B uint32LE  │  1B uint8  │  N bytes UTF-8 JSON body  │
│  payload len  │  msg type  │                           │
└───────────────┴────────────┴──────────────────────────┘
```

---

## Running the tests

```bash
# All v2 tests
node v2/test/schema.test.js
node v2/test/bplus-tree.test.js
node v2/test/table.test.js
node v2/test/integration.test.js
```

---

## Error types

| Error | Code | When |
|-------|------|------|
| `DuplicateKeyError` | `DUPLICATE_KEY` | Insert with an existing primary key |
| `RecordNotFoundError` | `RECORD_NOT_FOUND` | Update / delete a missing key |
| `TableNotFoundError` | `TABLE_NOT_FOUND` | `db.table('missing')` |
| `TableExistsError` | `TABLE_EXISTS` | `createTable` for an existing name |
| `SchemaError` | `SCHEMA_ERROR` | Invalid column definitions or values |
| `TransactionError` | `TRANSACTION_ERROR` | Misused transaction API |
| `ConnectionError` | `CONNECTION_ERROR` | Socket connectivity failures |
