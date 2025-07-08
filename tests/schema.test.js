const assert = require('assert')
const { DataTypes, Schema, DefaultSchemas } = require('../src/schema')
const { connectDB, createPager } = require('../src/persistent')

// Test data for different schemas
const testUser = {
  id: 1,
  username: 'testuser',
  email: 'test@example.com'
}

const testProduct = {
  id: 1001,
  name: 'Test Product',
  price: 29.99,
  category_id: 5,
  in_stock: true,
  description: 'A test product for validation'
}

const testEvent = {
  id: 500,
  user_id: 123,
  event_type: 'click',
  timestamp: Date.now(),
  properties: { button: 'submit', page: 'checkout' }
}

async function testSchemaBasics() {
  console.log('Testing schema basics...')
  
  // Test User schema (original)
  const userBuffer = DefaultSchemas.User.serialize(testUser)
  const userRestored = DefaultSchemas.User.deserialize(userBuffer)
  
  assert.strictEqual(userRestored.id, testUser.id)
  assert.strictEqual(userRestored.username, testUser.username)
  assert.strictEqual(userRestored.email, testUser.email)
  console.log('✓ User schema serialization/deserialization works')
  
  // Test Product schema
  const productBuffer = DefaultSchemas.Product.serialize(testProduct)
  const productRestored = DefaultSchemas.Product.deserialize(productBuffer)
  
  assert.strictEqual(productRestored.id, testProduct.id)
  assert.strictEqual(productRestored.name, testProduct.name)
  assert.strictEqual(productRestored.price, testProduct.price)
  assert.strictEqual(productRestored.in_stock, testProduct.in_stock)
  console.log('✓ Product schema serialization/deserialization works')
  
  // Test Event schema with JSON data
  const eventBuffer = DefaultSchemas.Event.serialize(testEvent)
  const eventRestored = DefaultSchemas.Event.deserialize(eventBuffer)
  
  assert.strictEqual(eventRestored.id, testEvent.id)
  assert.strictEqual(eventRestored.user_id, testEvent.user_id)
  assert.strictEqual(eventRestored.event_type, testEvent.event_type)
  assert.deepStrictEqual(eventRestored.properties, testEvent.properties)
  console.log('✓ Event schema with JSON serialization/deserialization works')
}

async function testCustomSchema() {
  console.log('Testing custom schema creation...')
  
  const customSchema = new Schema({
    id: DataTypes.UINT32,
    name: DataTypes.VARCHAR(50),
    score: DataTypes.FLOAT,
    active: DataTypes.BOOLEAN,
    metadata: DataTypes.JSON(100)
  })
  
  const testData = {
    id: 42,
    name: 'Custom Test',
    score: 95.5,
    active: true,
    metadata: { level: 'advanced', tags: ['test', 'custom'] }
  }
  
  const buffer = customSchema.serialize(testData)
  const restored = customSchema.deserialize(buffer)
  
  assert.strictEqual(restored.id, testData.id)
  assert.strictEqual(restored.name, testData.name)
  assert.strictEqual(Math.round(restored.score * 10) / 10, testData.score) // Float precision
  assert.strictEqual(restored.active, testData.active)
  assert.deepStrictEqual(restored.metadata, testData.metadata)
  
  console.log('✓ Custom schema works correctly')
  console.log(`  Schema size: ${customSchema.getRowSize()} bytes`)
}

async function testDataTypes() {
  console.log('Testing individual data types...')
  
  // Test all basic data types
  const typeTestSchema = new Schema({
    int32_val: DataTypes.INT32,
    uint32_val: DataTypes.UINT32,
    int64_val: DataTypes.INT64,
    float_val: DataTypes.FLOAT,
    double_val: DataTypes.DOUBLE,
    bool_val: DataTypes.BOOLEAN,
    varchar_val: DataTypes.VARCHAR(20),
    json_val: DataTypes.JSON(100)
  })
  
  const typeTestData = {
    int32_val: -123456,
    uint32_val: 123456,
    int64_val: Date.now(),
    float_val: 3.14159,
    double_val: 2.718281828459045,
    bool_val: true,
    varchar_val: 'Hello World',
    json_val: { test: true, number: 42 }
  }
  
  const buffer = typeTestSchema.serialize(typeTestData)
  const restored = typeTestSchema.deserialize(buffer)
  
  assert.strictEqual(restored.int32_val, typeTestData.int32_val)
  assert.strictEqual(restored.uint32_val, typeTestData.uint32_val)
  assert.strictEqual(restored.int64_val, typeTestData.int64_val)
  assert.strictEqual(Math.round(restored.float_val * 100000) / 100000, Math.round(typeTestData.float_val * 100000) / 100000)
  assert.strictEqual(restored.double_val, typeTestData.double_val)
  assert.strictEqual(restored.bool_val, typeTestData.bool_val)
  assert.strictEqual(restored.varchar_val, typeTestData.varchar_val)
  assert.deepStrictEqual(restored.json_val, typeTestData.json_val)
  
  console.log('✓ All data types work correctly')
}

async function testDatabaseIntegration() {
  console.log('Testing database integration with custom schemas...')
  
  // Test with Product schema
  const db = connectDB('./tests/test_products.db')
  await db.open()
  
  const pager = await createPager(db, {
    schema: DefaultSchemas.Product,
    serialize: (obj) => DefaultSchemas.Product.serialize(obj),
    deserialize: (buffer) => DefaultSchemas.Product.deserialize(buffer),
  })
  
  // Test page creation and schema integration
  assert(pager.rowSize === DefaultSchemas.Product.getRowSize())
  console.log('✓ Database pager correctly uses custom schema row size')
  
  await db.close()
}

async function testEdgeCases() {
  console.log('Testing edge cases...')
  
  // Test empty strings and null values
  const edgeSchema = new Schema({
    id: DataTypes.UINT32,
    optional_string: DataTypes.VARCHAR(50),
    optional_json: DataTypes.JSON(100)
  })
  
  const edgeData = {
    id: 1,
    optional_string: '',
    optional_json: null
  }
  
  const buffer = edgeSchema.serialize(edgeData)
  const restored = edgeSchema.deserialize(buffer)
  
  assert.strictEqual(restored.id, edgeData.id)
  assert.strictEqual(restored.optional_string, '')
  assert.strictEqual(restored.optional_json, null)
  
  console.log('✓ Edge cases (empty strings, null values) handled correctly')
  
  // Test string truncation
  const longString = 'a'.repeat(100)
  const truncData = {
    id: 2,
    optional_string: longString,
    optional_json: { data: 'test' }
  }
  
  const truncBuffer = edgeSchema.serialize(truncData)
  const truncRestored = edgeSchema.deserialize(truncBuffer)
  
  assert(truncRestored.optional_string.length <= 49) // -1 for null terminator
  console.log('✓ String truncation works correctly')
}

async function testPerformance() {
  console.log('Testing performance...')
  
  const perfSchema = DefaultSchemas.Event
  const testData = {
    id: 1,
    user_id: 12345,
    event_type: 'page_view',
    timestamp: Date.now(),
    properties: { page: '/home', duration: 1500, referrer: 'google' }
  }
  
  const iterations = 10000
  
  // Test serialization performance
  const serializeStart = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) {
    perfSchema.serialize({ ...testData, id: i })
  }
  const serializeEnd = process.hrtime.bigint()
  const serializeTime = Number(serializeEnd - serializeStart) / 1000000 // Convert to milliseconds
  
  // Test deserialization performance
  const buffer = perfSchema.serialize(testData)
  const deserializeStart = process.hrtime.bigint()
  for (let i = 0; i < iterations; i++) {
    perfSchema.deserialize(buffer)
  }
  const deserializeEnd = process.hrtime.bigint()
  const deserializeTime = Number(deserializeEnd - deserializeStart) / 1000000
  
  console.log(`✓ Performance test completed:`)
  console.log(`  Serialization: ${iterations} ops in ${serializeTime.toFixed(2)}ms (${(iterations / serializeTime * 1000).toFixed(0)} ops/sec)`)
  console.log(`  Deserialization: ${iterations} ops in ${deserializeTime.toFixed(2)}ms (${(iterations / deserializeTime * 1000).toFixed(0)} ops/sec)`)
}

async function runAllTests() {
  console.log('=== Running Custom Data Structure Tests ===\n')
  
  try {
    await testSchemaBasics()
    console.log()
    
    await testCustomSchema()
    console.log()
    
    await testDataTypes()
    console.log()
    
    await testDatabaseIntegration()
    console.log()
    
    await testEdgeCases()
    console.log()
    
    await testPerformance()
    console.log()
    
    console.log('=== All Tests Passed! ===')
  } catch (error) {
    console.error('Test failed:', error.message)
    console.error(error.stack)
    process.exit(1)
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAllTests().catch(console.error)
}

module.exports = {
  runAllTests,
  testSchemaBasics,
  testCustomSchema,
  testDataTypes,
  testDatabaseIntegration,
  testEdgeCases,
  testPerformance
}