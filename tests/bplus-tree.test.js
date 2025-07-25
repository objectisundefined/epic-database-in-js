const { Database, DataTypes, Schema } = require('../src/table-bplus')
const fs = require('fs/promises')
const path = require('path')

// Test utilities
async function cleanupTestData() {
  try {
    const testDir = './test-data'
    await fs.rm(testDir, { recursive: true, force: true })
  } catch (error) {
    // Directory might not exist, that's fine
  }
}

async function runTest(testName, testFn) {
  console.log(`\n🧪 Testing: ${testName}`)
  try {
    await testFn()
    console.log(`✅ ${testName} passed`)
    return true
  } catch (error) {
    console.error(`❌ ${testName} failed:`, error.message)
    console.error(error.stack)
    return false
  }
}

// Test the B+ tree implementation
async function testBPlusTreeImplementation() {
  console.log('╔════════════════════════════════════════════════════════════════╗')
  console.log('║                    B+ Tree Implementation Tests                ║')
  console.log('╚════════════════════════════════════════════════════════════════╝')

  let passedTests = 0
  let totalTests = 0

  // Test 1: Basic Database Connection
  totalTests++
  const passed1 = await runTest('Database Connection and Table Creation', async () => {
    await cleanupTestData()
    
    const db = await Database.connect('test_db', './test-data')
    
    const schema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(50),
      value: DataTypes.INT32
    })
    
    const table = await db.createTable('test_table', schema)
    
    const info = table.getInfo()
    
    if (info.indexType !== 'B+ Tree') {
      throw new Error('Expected B+ Tree index type')
    }
    
    if (!info.maxLeafSize || !info.maxInternalSize) {
      throw new Error('Missing max size information')
    }
    
    await db.close()
  })
  if (passed1) passedTests++

  // Test 2: Basic CRUD Operations
  totalTests++
  const passed2 = await runTest('Basic CRUD Operations', async () => {
    const db = await Database.connect('crud_test', './test-data')
    const schema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(30),
      score: DataTypes.DOUBLE
    })
    const table = await db.createTable('crud_table', schema)

    // Create
    const result1 = await table.create({ id: 1, name: 'Alice', score: 95.5 })
    if (result1.key !== 1) throw new Error('Create failed - wrong key')
    
    const result2 = await table.create({ id: 2, name: 'Bob', score: 87.2 })
    if (result2.key !== 2) throw new Error('Create failed - wrong key')

    // Read by key
    const alice = await table.read({ key: 1 })
    if (alice.length !== 1 || alice[0].name !== 'Alice') {
      throw new Error('Read by key failed')
    }

    // Read all
    const all = await table.read()
    if (all.length !== 2) throw new Error('Read all failed')

    // Update
    await table.update(1, { score: 98.0 })
    const updatedAlice = await table.read({ key: 1 })
    if (updatedAlice[0].score !== 98.0) throw new Error('Update failed')

    // Delete
    await table.delete(2)
    const remaining = await table.read()
    if (remaining.length !== 1) throw new Error('Delete failed')

    await db.close()
  })
  if (passed2) passedTests++

  // Test 3: Range Queries
  totalTests++
  const passed3 = await runTest('Range Query Operations', async () => {
    const db = await Database.connect('range_test', './test-data')
    const schema = new Schema({
      id: DataTypes.UINT32,
      value: DataTypes.VARCHAR(20)
    })
    const table = await db.createTable('range_table', schema)

    // Insert test data
    for (let i = 1; i <= 20; i++) {
      await table.create({ id: i, value: `Value${i}` })
    }

    // Test range query 1-10
    const range1 = await table.read({ where: { gte: 1, lte: 10 } })
    if (range1.length !== 10) throw new Error('Range 1-10 failed')
    
    // Test range query 5-15
    const range2 = await table.read({ where: { gte: 5, lte: 15 } })
    if (range2.length !== 11) throw new Error('Range 5-15 failed')
    
    // Test range query with limit
    const range3 = await table.read({ where: { gte: 1, lte: 20 }, limit: 5 })
    if (range3.length !== 5) throw new Error('Range with limit failed')
    
    // Verify order
    for (let i = 0; i < range3.length - 1; i++) {
      if (range3[i].id >= range3[i + 1].id) {
        throw new Error('Range results not in order')
      }
    }

    await db.close()
  })
  if (passed3) passedTests++

  // Test 4: Sequential Access Performance
  totalTests++
  const passed4 = await runTest('Sequential Access via Linked Leaves', async () => {
    const db = await Database.connect('sequential_test', './test-data')
    const schema = new Schema({
      id: DataTypes.UINT32,
      data: DataTypes.VARCHAR(10)
    })
    const table = await db.createTable('seq_table', schema)

    // Insert 50 records
    for (let i = 1; i <= 50; i++) {
      await table.create({ id: i, data: `Data${i}` })
    }

    // Get all records - should use linked leaf traversal
    const startTime = performance.now()
    const allRecords = await table.read()
    const endTime = performance.now()

    if (allRecords.length !== 50) throw new Error('Sequential read failed')
    
    // Verify they're in order
    for (let i = 0; i < allRecords.length - 1; i++) {
      if (allRecords[i].id >= allRecords[i + 1].id) {
        throw new Error('Records not in sequential order')
      }
    }

    console.log(`   Sequential access of 50 records: ${(endTime - startTime).toFixed(2)}ms`)

    await db.close()
  })
  if (passed4) passedTests++

  // Test 5: Large Dataset Performance
  totalTests++
  const passed5 = await runTest('Large Dataset Performance', async () => {
    const db = await Database.connect('large_test', './test-data')
    const schema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(20),
      category: DataTypes.UINT32
    })
    const table = await db.createTable('large_table', schema)

    console.log('   Inserting 500 records...')
    const insertStart = performance.now()
    
    for (let i = 1; i <= 500; i++) {
      await table.create({
        id: i,
        name: `Record${i}`,
        category: i % 10
      })
      
      if (i % 100 === 0) {
        console.log(`     Progress: ${i}/500`)
      }
    }
    
    const insertEnd = performance.now()
    console.log(`   Insertion time: ${(insertEnd - insertStart).toFixed(2)}ms`)

    // Test range queries on large dataset
    const rangeStart = performance.now()
    const range = await table.read({ where: { gte: 100, lte: 200 } })
    const rangeEnd = performance.now()
    
    if (range.length !== 101) throw new Error('Large dataset range query failed')
    console.log(`   Range query (100-200): ${(rangeEnd - rangeStart).toFixed(2)}ms`)

    // Test point queries
    const pointStart = performance.now()
    const point1 = await table.read({ key: 250 })
    const point2 = await table.read({ key: 300 })
    const point3 = await table.read({ key: 450 })
    const pointEnd = performance.now()
    
    if (point1.length !== 1 || point2.length !== 1 || point3.length !== 1) {
      throw new Error('Point queries failed')
    }
    console.log(`   Point queries (3): ${(pointEnd - pointStart).toFixed(2)}ms`)

    await db.close()
  })
  if (passed5) passedTests++

  // Test 6: Tree Structure Integrity
  totalTests++
  const passed6 = await runTest('B+ Tree Structure Integrity', async () => {
    const db = await Database.connect('structure_test', './test-data')
    const schema = new Schema({
      id: DataTypes.UINT32,
      value: DataTypes.INT32
    })
    const table = await db.createTable('structure_table', schema)

    // Insert records to force tree growth
    const records = [5, 2, 8, 1, 3, 7, 9, 4, 6, 10, 15, 12, 20, 11, 16, 13, 18, 14, 19, 17]
    
    for (const id of records) {
      await table.create({ id, value: id * 10 })
    }

    // Verify we can find all records
    for (const id of records) {
      const result = await table.read({ key: id })
      if (result.length !== 1 || result[0].id !== id) {
        throw new Error(`Failed to find record ${id}`)
      }
    }

    // Test tree structure display (should not throw)
    await table.showStructure()

    // Verify range queries work across tree structure
    const fullRange = await table.read({ where: { gte: 1, lte: 20 } })
    if (fullRange.length !== 20) throw new Error('Full range query failed')

    await db.close()
  })
  if (passed6) passedTests++

  // Test 7: Error Handling
  totalTests++
  const passed7 = await runTest('Error Handling', async () => {
    const db = await Database.connect('error_test', './test-data')
    const schema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(20)
    })
    const table = await db.createTable('error_table', schema)

    // Test duplicate key error
    await table.create({ id: 1, name: 'Test1' })
    
    try {
      await table.create({ id: 1, name: 'Test2' })
      throw new Error('Should have thrown duplicate key error')
    } catch (error) {
      if (!error.message.includes('already exists')) {
        throw new Error('Wrong error message for duplicate key')
      }
    }

    // Test update non-existent record
    try {
      await table.update(999, { name: 'Updated' })
      throw new Error('Should have thrown not found error')
    } catch (error) {
      if (!error.message.includes('not found')) {
        throw new Error('Wrong error message for missing record')
      }
    }

    // Test delete non-existent record
    try {
      await table.delete(999)
      throw new Error('Should have thrown not found error')
    } catch (error) {
      if (!error.message.includes('not found')) {
        throw new Error('Wrong error message for missing record')
      }
    }

    await db.close()
  })
  if (passed7) passedTests++

  // Test 8: Multiple Tables
  totalTests++
  const passed8 = await runTest('Multiple Tables in Database', async () => {
    const db = await Database.connect('multi_test', './test-data')
    
    // Create multiple tables
    const userSchema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(30)
    })
    
    const productSchema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(50),
      price: DataTypes.DOUBLE
    })

    const usersTable = await db.createTable('users', userSchema)
    const productsTable = await db.createTable('products', productSchema)

    // Insert data into both tables
    await usersTable.create({ id: 1, name: 'Alice' })
    await usersTable.create({ id: 2, name: 'Bob' })
    
    await productsTable.create({ id: 101, name: 'Laptop', price: 999.99 })
    await productsTable.create({ id: 102, name: 'Mouse', price: 29.99 })

    // Verify table isolation
    const users = await usersTable.read()
    const products = await productsTable.read()
    
    if (users.length !== 2) throw new Error('Users table data incorrect')
    if (products.length !== 2) throw new Error('Products table data incorrect')

    // Verify table list
    const tableNames = db.listTables()
    if (!tableNames.includes('users') || !tableNames.includes('products')) {
      throw new Error('Table list incorrect')
    }

    await db.close()
  })
  if (passed8) passedTests++

  // Cleanup
  await cleanupTestData()

  // Results
  console.log('\n' + '='.repeat(60))
  console.log(`TEST RESULTS: ${passedTests}/${totalTests} tests passed`)
  
  if (passedTests === totalTests) {
    console.log('🎉 All tests passed! B+ Tree implementation is working correctly.')
  } else {
    console.log(`❌ ${totalTests - passedTests} tests failed. Please review the implementation.`)
  }
  
  console.log('='.repeat(60))

  return passedTests === totalTests
}

// Performance comparison test
async function performanceComparisonTest() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗')
  console.log('║                    B+ Tree Performance Analysis                ║')
  console.log('╚════════════════════════════════════════════════════════════════╝')

  await cleanupTestData()
  
  const db = await Database.connect('perf_test', './test-data')
  const schema = new Schema({
    id: DataTypes.UINT32,
    name: DataTypes.VARCHAR(30),
    value: DataTypes.DOUBLE
  })
  const table = await db.createTable('perf_table', schema)

  console.log('📊 Performance Benchmarks:')

  // Insert performance
  console.log('\n1. Insert Performance:')
  const insertCounts = [100, 500, 1000]
  
  for (const count of insertCounts) {
    const startTime = performance.now()
    
    for (let i = 1; i <= count; i++) {
      await table.create({
        id: Date.now() + i, // Ensure unique IDs
        name: `User${i}`,
        value: Math.random() * 100
      })
    }
    
    const endTime = performance.now()
    const totalTime = endTime - startTime
    const avgTime = totalTime / count
    
    console.log(`   ${count} inserts: ${totalTime.toFixed(2)}ms (${avgTime.toFixed(2)}ms avg)`)
  }

  // Range query performance
  console.log('\n2. Range Query Performance:')
  const currentCount = await table.count()
  const rangeSizes = [10, 50, 100, 200]
  
  for (const size of rangeSizes) {
    const start = Math.floor(Math.random() * (currentCount - size))
    const end = start + size
    
    const startTime = performance.now()
    const results = await table.read({ where: { gte: start, lte: end } })
    const endTime = performance.now()
    
    console.log(`   Range ${size}: ${(endTime - startTime).toFixed(2)}ms (found ${results.length} records)`)
  }

  // Sequential scan performance
  console.log('\n3. Sequential Scan Performance:')
  const seqStart = performance.now()
  const allRecords = await table.read()
  const seqEnd = performance.now()
  
  console.log(`   Full scan (${allRecords.length} records): ${(seqEnd - seqStart).toFixed(2)}ms`)
  console.log(`   Records per ms: ${(allRecords.length / (seqEnd - seqStart)).toFixed(2)}`)

  await db.close()
  await cleanupTestData()
}

// Run all tests
if (require.main === module) {
  testBPlusTreeImplementation()
    .then((success) => {
      if (success) {
        return performanceComparisonTest()
      }
    })
    .then(() => {
      console.log('\n✅ All tests completed!')
    })
    .catch((error) => {
      console.error('❌ Test suite failed:', error)
      process.exit(1)
    })
}

module.exports = {
  testBPlusTreeImplementation,
  performanceComparisonTest
}