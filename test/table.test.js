const assert = require('assert')
const fs = require('fs/promises')
const path = require('path')
const { Database, Table, DataTypes, Schema, DefaultSchemas } = require('../src/table')

// Test data directory
const testDataDir = './test-data'

// Clean up test data
async function cleanup() {
  try {
    await fs.rm(testDataDir, { recursive: true, force: true })
  } catch (error) {
    // Directory might not exist, that's ok
  }
}

// Test basic table operations
async function testBasicTableOperations() {
  console.log('Testing basic table operations...')
  
  await cleanup()
  
  const db = await Database.connect('test_db', testDataDir)
  
  try {
    // Create a simple schema
    const userSchema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(50),
      age: DataTypes.UINT32,
      active: DataTypes.BOOLEAN
    })
    
    // Create table
    const usersTable = await db.createTable('users', userSchema)
    assert.strictEqual(usersTable.name, 'users')
    console.log('✓ Table creation works')
    
    // Test table info
    const info = usersTable.getInfo()
    assert.strictEqual(info.name, 'users')
    assert.strictEqual(info.schema.length, 4)
    console.log('✓ Table info works')
    
    // Test database info
    const dbInfo = db.getInfo()
    assert.strictEqual(dbInfo.name, 'test_db')
    assert.strictEqual(dbInfo.tablesOpen, 1)
    console.log('✓ Database info works')
    
    await db.close()
  } catch (error) {
    await db.close()
    throw error
  }
}

// Test CRUD operations
async function testCRUDOperations() {
  console.log('Testing CRUD operations...')
  
  await cleanup()
  
  const db = await Database.connect('crud_test_db', testDataDir)
  
  try {
    const schema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(100),
      email: DataTypes.VARCHAR(150),
      age: DataTypes.UINT32,
      active: DataTypes.BOOLEAN,
      created_at: DataTypes.INT64
    })
    
    const table = await db.createTable('users', schema)
    
    // CREATE (Insert) operations
    const userData1 = {
      id: 1,
      name: 'Alice Smith',
      email: 'alice@example.com',
      age: 25,
      active: true,
      created_at: Date.now()
    }
    
    const createResult = await table.create(userData1)
    assert.strictEqual(createResult.success, true)
    assert.strictEqual(createResult.key, 1)
    console.log('✓ CREATE operation works')
    
    // Test duplicate key error
    try {
      await table.create(userData1)
      assert.fail('Should have thrown duplicate key error')
    } catch (error) {
      assert(error.message.includes('already exists'))
      console.log('✓ Duplicate key prevention works')
    }
    
    // Insert more test data
    const userData2 = { id: 2, name: 'Bob Johnson', email: 'bob@example.com', age: 30, active: true, created_at: Date.now() }
    const userData3 = { id: 3, name: 'Charlie Brown', email: 'charlie@example.com', age: 28, active: false, created_at: Date.now() }
    
    await table.create(userData2)
    await table.create(userData3)
    
    // READ operations
    // Read by key
    const readResult = await table.read({ key: 1 })
    assert.strictEqual(readResult.length, 1)
    assert.strictEqual(readResult[0].data.name, 'Alice Smith')
    console.log('✓ READ by key works')
    
    // Read all
    const allUsers = await table.read()
    assert.strictEqual(allUsers.length, 3)
    console.log('✓ READ all works')
    
    // Read with conditions
    const activeUsers = await table.read({ where: { active: true } })
    assert.strictEqual(activeUsers.length, 2)
    console.log('✓ READ with conditions works')
    
    // Read with limit
    const limitedUsers = await table.read({ limit: 2 })
    assert.strictEqual(limitedUsers.length, 2)
    console.log('✓ READ with limit works')
    
    // UPDATE operations
    const updateResult = await table.update(1, { age: 26, email: 'alice.updated@example.com' })
    assert.strictEqual(updateResult.success, true)
    assert.strictEqual(updateResult.key, 1)
    assert.strictEqual(updateResult.newData.age, 26)
    console.log('✓ UPDATE operation works')
    
    // Verify update
    const updatedUser = await table.read({ key: 1 })
    assert.strictEqual(updatedUser[0].data.age, 26)
    assert.strictEqual(updatedUser[0].data.email, 'alice.updated@example.com')
    console.log('✓ UPDATE verification works')
    
    // Test update non-existent record
    try {
      await table.update(999, { age: 50 })
      assert.fail('Should have thrown not found error')
    } catch (error) {
      assert(error.message.includes('not found'))
      console.log('✓ UPDATE non-existent record error works')
    }
    
    // COUNT operation
    const count = await table.count()
    assert.strictEqual(count, 3)
    console.log('✓ COUNT operation works')
    
    // DELETE operations
    const deleteResult = await table.delete(3)
    assert.strictEqual(deleteResult.success, true)
    assert.strictEqual(deleteResult.key, 3)
    assert.strictEqual(deleteResult.deletedData.name, 'Charlie Brown')
    console.log('✓ DELETE operation works')
    
    // Verify deletion
    const remainingUsers = await table.read()
    assert.strictEqual(remainingUsers.length, 2)
    console.log('✓ DELETE verification works')
    
    // Test delete non-existent record
    try {
      await table.delete(999)
      assert.fail('Should have thrown not found error')
    } catch (error) {
      assert(error.message.includes('not found'))
      console.log('✓ DELETE non-existent record error works')
    }
    
    await db.close()
  } catch (error) {
    await db.close()
    throw error
  }
}

// Test multiple tables
async function testMultipleTables() {
  console.log('Testing multiple tables...')
  
  await cleanup()
  
  const db = await Database.connect('multi_table_db', testDataDir)
  
  try {
    // Create users table
    const userSchema = new Schema({
      id: DataTypes.UINT32,
      username: DataTypes.VARCHAR(50),
      email: DataTypes.VARCHAR(100)
    })
    const usersTable = await db.createTable('users', userSchema)
    
    // Create products table
    const productSchema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(100),
      price: DataTypes.DOUBLE,
      in_stock: DataTypes.BOOLEAN
    })
    const productsTable = await db.createTable('products', productSchema)
    
    // Insert data into both tables
    await usersTable.create({ id: 1, username: 'alice', email: 'alice@example.com' })
    await usersTable.create({ id: 2, username: 'bob', email: 'bob@example.com' })
    
    await productsTable.create({ id: 101, name: 'Laptop', price: 999.99, in_stock: true })
    await productsTable.create({ id: 102, name: 'Mouse', price: 25.99, in_stock: false })
    
    // Verify table isolation
    const users = await usersTable.read()
    const products = await productsTable.read()
    
    assert.strictEqual(users.length, 2)
    assert.strictEqual(products.length, 2)
    assert.strictEqual(users[0].data.username, 'alice')
    assert.strictEqual(products[0].data.name, 'Laptop')
    console.log('✓ Multiple tables work independently')
    
    // Test table listing
    const tableNames = db.listTables()
    assert.strictEqual(tableNames.length, 2)
    assert(tableNames.includes('users'))
    assert(tableNames.includes('products'))
    console.log('✓ Table listing works')
    
    // Test getting table by name
    const usersTableRef = await db.getTable('users')
    assert.strictEqual(usersTableRef.name, 'users')
    console.log('✓ Getting table by name works')
    
    await db.close()
  } catch (error) {
    await db.close()
    throw error
  }
}

// Test predefined schemas
async function testPredefinedSchemas() {
  console.log('Testing predefined schemas...')
  
  await cleanup()
  
  const db = await Database.connect('predefined_db', testDataDir)
  
  try {
    // Test User schema
    const usersTable = await db.createTable('users', DefaultSchemas.User)
    await usersTable.create({ id: 1, username: 'testuser', email: 'test@example.com' })
    
    const users = await usersTable.read()
    assert.strictEqual(users.length, 1)
    assert.strictEqual(users[0].data.username, 'testuser')
    console.log('✓ Predefined User schema works')
    
    // Test Product schema
    const productsTable = await db.createTable('products', DefaultSchemas.Product)
    await productsTable.create({
      id: 1,
      name: 'Test Product',
      price: 49.99,
      category_id: 1,
      in_stock: true,
      description: 'A test product'
    })
    
    const products = await productsTable.read()
    assert.strictEqual(products.length, 1)
    assert.strictEqual(products[0].data.name, 'Test Product')
    console.log('✓ Predefined Product schema works')
    
    // Test Event schema
    const eventsTable = await db.createTable('events', DefaultSchemas.Event)
    await eventsTable.create({
      id: 1,
      user_id: 1,
      event_type: 'click',
      timestamp: Date.now(),
      properties: { button: 'submit', page: 'home' }
    })
    
    const events = await eventsTable.read()
    assert.strictEqual(events.length, 1)
    assert.strictEqual(events[0].data.event_type, 'click')
    assert.deepStrictEqual(events[0].data.properties, { button: 'submit', page: 'home' })
    console.log('✓ Predefined Event schema works')
    
    await db.close()
  } catch (error) {
    await db.close()
    throw error
  }
}

// Test persistence
async function testPersistence() {
  console.log('Testing persistence...')
  
  await cleanup()
  
  // Create database and add data
  let db = await Database.connect('persistence_db', testDataDir)
  
  try {
    const schema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(50),
      value: DataTypes.DOUBLE
    })
    
    const table = await db.createTable('test_table', schema)
    
    // Insert test data
    await table.create({ id: 1, name: 'First', value: 10.5 })
    await table.create({ id: 2, name: 'Second', value: 20.7 })
    await table.create({ id: 3, name: 'Third', value: 30.9 })
    
    await db.close()
    
    // Reconnect and verify data persists
    db = await Database.connect('persistence_db', testDataDir)
    const restoredTable = await db.getTable('test_table')
    
    const data = await restoredTable.read()
    assert.strictEqual(data.length, 3)
    assert.strictEqual(data[0].data.name, 'First')
    assert.strictEqual(data[1].data.value, 20.7)
    console.log('✓ Data persistence works')
    
    // Test metadata persistence
    const dbInfo = db.getInfo()
    assert.strictEqual(dbInfo.name, 'persistence_db')
    assert.strictEqual(dbInfo.tables.length, 1)
    assert.strictEqual(dbInfo.tables[0].name, 'test_table')
    console.log('✓ Metadata persistence works')
    
    await db.close()
  } catch (error) {
    await db.close()
    throw error
  }
}

// Test error cases
async function testErrorCases() {
  console.log('Testing error cases...')
  
  await cleanup()
  
  const db = await Database.connect('error_test_db', testDataDir)
  
  try {
    const schema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(50)
    })
    
    const table = await db.createTable('test_table', schema)
    
    // Test missing primary key
    try {
      await table.create({ name: 'No ID' })
      assert.fail('Should have thrown missing primary key error')
    } catch (error) {
      assert(error.message.includes('Primary key'))
      console.log('✓ Missing primary key error works')
    }
    
    // Test creating duplicate table
    try {
      await db.createTable('test_table', schema)
      assert.fail('Should have thrown duplicate table error')
    } catch (error) {
      assert(error.message.includes('already exists'))
      console.log('✓ Duplicate table error works')
    }
    
    // Test getting non-existent table
    try {
      await db.getTable('non_existent')
      assert.fail('Should have thrown table not found error')
    } catch (error) {
      assert(error.message.includes('does not exist'))
      console.log('✓ Non-existent table error works')
    }
    
    await db.close()
  } catch (error) {
    await db.close()
    throw error
  }
}

// Test performance with larger datasets
async function testPerformance() {
  console.log('Testing performance...')
  
  await cleanup()
  
  const db = await Database.connect('perf_db', testDataDir)
  
  try {
    const schema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(50),
      value: DataTypes.DOUBLE,
      timestamp: DataTypes.INT64
    })
    
    const table = await db.createTable('perf_test', schema)
    
    const recordCount = 500 // Smaller for CI/testing
    const startTime = Date.now()
    
    // Batch insert
    console.log(`  Inserting ${recordCount} records...`)
    for (let i = 1; i <= recordCount; i++) {
      await table.create({
        id: i,
        name: `Record ${i}`,
        value: Math.random() * 100,
        timestamp: Date.now()
      })
    }
    
    const insertTime = Date.now() - startTime
    console.log(`  ✓ Inserted ${recordCount} records in ${insertTime}ms (${(insertTime/recordCount).toFixed(2)}ms/record)`)
    
    // Read performance
    const readStart = Date.now()
    const allRecords = await table.read({ limit: recordCount })
    const readTime = Date.now() - readStart
    
    assert.strictEqual(allRecords.length, recordCount)
    console.log(`  ✓ Read ${allRecords.length} records in ${readTime}ms (${(readTime/allRecords.length).toFixed(2)}ms/record)`)
    
    // Update performance
    const updateStart = Date.now()
    for (let i = 1; i <= 50; i++) {
      await table.update(i, { value: Math.random() * 200 })
    }
    const updateTime = Date.now() - updateStart
    console.log(`  ✓ Updated 50 records in ${updateTime}ms (${(updateTime/50).toFixed(2)}ms/record)`)
    
    // Delete performance
    const deleteStart = Date.now()
    for (let i = recordCount - 49; i <= recordCount; i++) {
      await table.delete(i)
    }
    const deleteTime = Date.now() - deleteStart
    console.log(`  ✓ Deleted 50 records in ${deleteTime}ms (${(deleteTime/50).toFixed(2)}ms/record)`)
    
    // Verify final count
    const finalCount = await table.count()
    assert.strictEqual(finalCount, recordCount - 50)
    console.log(`  ✓ Final record count: ${finalCount}`)
    
    await db.close()
  } catch (error) {
    await db.close()
    throw error
  }
}

// Run all tests
async function runAllTests() {
  console.log('=== Table System Test Suite ===\n')
  
  try {
    await testBasicTableOperations()
    await testCRUDOperations()
    await testMultipleTables()
    await testPredefinedSchemas()
    await testPersistence()
    await testErrorCases()
    await testPerformance()
    
    console.log('\n=== All Tests Passed! ===')
  } catch (error) {
    console.error('\n=== Test Failed ===')
    console.error('Error:', error.message)
    console.error('Stack:', error.stack)
    process.exit(1)
  } finally {
    await cleanup()
  }
}

// Export for use in other modules
module.exports = {
  testBasicTableOperations,
  testCRUDOperations,
  testMultipleTables,
  testPredefinedSchemas,
  testPersistence,
  testErrorCases,
  testPerformance,
  runAllTests
}

// Run if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error)
}