# epic-database-in-js

A JavaScript database engine built from scratch, developed iteratively across two versions.

---

## Repository layout

```
v1/   original implementation  (B+ tree + B-tree, schema, socket server/client)
v2/   rewrite from scratch      (cleaner architecture, full split/merge, query builder, transactions)
```

---

## v1 — original implementation

An iterative B+ tree database with both B-tree and B+ tree index support, a schema
system, a socket-based server/client pair, an interactive CLI, and example scripts.

**Entry point:** `v1/lib/index.js`

```js
const { Database, Schema, DataTypes } = require('./v1/lib/index')

const db = new Database('mydb')
await db.connect()

const schema = new Schema({
  id:    DataTypes.UINT32,
  name:  DataTypes.VARCHAR(100),
  email: DataTypes.VARCHAR(150),
})

const users = await db.createTable('users', schema)
await users.create({ id: 1, name: 'Alice', email: 'alice@example.com' })
await db.close()
```

Run the v1 test suite:

```bash
npm run test:v1           # bplus-tree + schema tests
npm run test:v1:bplus     # bplus-tree only
npm run test:v1:btree     # b-tree only
```

→ Full docs: [`v1/README.md`](v1/README.md)

---

## v2 — rewrite from scratch

A ground-up rewrite modelled on MySQL/InnoDB internals: every node lives in a
fixed 4 096-byte page, the B+ tree supports full split/merge rebalancing, a
fluent query builder covers WHERE / ORDER BY / LIMIT / OFFSET, and a lightweight
transaction API provides begin / commit / rollback.

**Entry point:** `v2/index.js`

```js
const { Database, Schema, DataTypes } = require('./v2')

const db = await Database.connect('shop', './data')

const schema = new Schema({
  id:    DataTypes.UINT,
  name:  DataTypes.VARCHAR(100),
  price: DataTypes.DOUBLE,
})

const products = await db.createTable('products', schema)
await products.insert({ id: 1, name: 'Widget', price: 9.99 })

const cheap = await products.query()
  .where('price', '<=', 20)
  .orderBy('price', 'ASC')
  .execute()

await db.close()
```

Run the v2 test suite:

```bash
npm run test:v2
```

→ Full docs: [`v2/README.md`](v2/README.md)

---

## Quick-start

```bash
# Clone
git clone https://github.com/objectisundefined/epic-database-in-js.git
cd epic-database-in-js

# Run all tests (v1 + v2)
npm test

# Run per-version suites
npm run test:v1             # v1: bplus-tree + schema
npm run test:v1:bplus       # v1: bplus-tree only
npm run test:v1:btree       # v1: b-tree only
npm run test:v2             # v2: all suites
npm run test:v2:schema
npm run test:v2:bplus
npm run test:v2:table
npm run test:v2:integration

# Interactive CLI (v1)
npm start
```

No external runtime dependencies — only Node.js ≥ 14 is required.
