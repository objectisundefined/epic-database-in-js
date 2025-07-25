const { DataTypes, Schema, DefaultSchemas } = require('../src/schema')
const { connectDB, createPager } = require('../src/persistent')

// Example 1: E-commerce Product Catalog
const ProductSchema = new Schema({
  id: DataTypes.UINT32,
  name: DataTypes.VARCHAR(100),
  sku: DataTypes.VARCHAR(50),
  price: DataTypes.DOUBLE,
  category_id: DataTypes.UINT32,
  in_stock: DataTypes.BOOLEAN,
  weight: DataTypes.FLOAT,
  description: DataTypes.VARCHAR(500),
  tags: DataTypes.JSON(200),
  created_at: DataTypes.INT64
})

// Example 2: IoT Sensor Data
const SensorDataSchema = new Schema({
  sensor_id: DataTypes.UINT32,
  timestamp: DataTypes.INT64,
  temperature: DataTypes.FLOAT,
  humidity: DataTypes.FLOAT,
  pressure: DataTypes.FLOAT,
  battery_level: DataTypes.UINT32,
  location: DataTypes.JSON(100),
  metadata: DataTypes.JSON(300)
})

// Example 3: Social Media Posts
const PostSchema = new Schema({
  id: DataTypes.UINT32,
  user_id: DataTypes.UINT32,
  content: DataTypes.VARCHAR(2000),
  likes: DataTypes.UINT32,
  shares: DataTypes.UINT32,
  created_at: DataTypes.INT64,
  updated_at: DataTypes.INT64,
  is_published: DataTypes.BOOLEAN,
  tags: DataTypes.JSON(500),
  media_urls: DataTypes.JSON(1000)
})

// Example 4: Financial Transactions
const TransactionSchema = new Schema({
  id: DataTypes.UINT32,
  from_account: DataTypes.VARCHAR(50),
  to_account: DataTypes.VARCHAR(50),
  amount: DataTypes.DOUBLE,
  currency: DataTypes.VARCHAR(3),
  timestamp: DataTypes.INT64,
  transaction_type: DataTypes.VARCHAR(20),
  status: DataTypes.VARCHAR(20),
  metadata: DataTypes.JSON(800)
})

// Example 5: Configuration Management
const ConfigSchema = new Schema({
  key: DataTypes.VARCHAR(100),
  value: DataTypes.JSON(2000),
  environment: DataTypes.VARCHAR(20),
  version: DataTypes.UINT32,
  created_at: DataTypes.INT64,
  is_active: DataTypes.BOOLEAN
})

async function demonstrateCustomSchemas() {
  console.log('=== Custom Data Structure Examples ===\n')

  // Demonstrate each schema
  const schemas = [
    { name: 'Product Catalog', schema: ProductSchema },
    { name: 'IoT Sensor Data', schema: SensorDataSchema },
    { name: 'Social Media Posts', schema: PostSchema },
    { name: 'Financial Transactions', schema: TransactionSchema },
    { name: 'Configuration Management', schema: ConfigSchema }
  ]

  for (const { name, schema } of schemas) {
    console.log(`${name} Schema (${schema.getRowSize()} bytes):`)
    schema.getFields().forEach(field => {
      console.log(`  - ${field.name}: ${field.type.size} bytes`)
    })
    console.log()
  }

  // Example usage with Product Schema
  console.log('=== Example: Working with Product Catalog ===')
  
  const db = connectDB('./examples/products.db')
  await db.open()

  const pager = await createPager(db, {
    schema: ProductSchema,
    serialize: (obj) => ProductSchema.serialize(obj),
    deserialize: (buffer) => ProductSchema.deserialize(buffer),
  })

  // Sample product data
  const sampleProducts = [
    {
      id: 1,
      name: 'Wireless Headphones',
      sku: 'WH-001',
      price: 99.99,
      category_id: 100,
      in_stock: true,
      weight: 0.25,
      description: 'High-quality wireless headphones with noise cancellation',
      tags: ['electronics', 'audio', 'wireless'],
      created_at: Date.now()
    },
    {
      id: 2,
      name: 'Bluetooth Speaker',
      sku: 'BS-002',
      price: 149.99,
      category_id: 100,
      in_stock: false,
      weight: 0.8,
      description: 'Portable Bluetooth speaker with excellent sound quality',
      tags: ['electronics', 'audio', 'portable'],
      created_at: Date.now()
    },
    {
      id: 3,
      name: 'Smart Watch',
      sku: 'SW-003',
      price: 299.99,
      category_id: 200,
      in_stock: true,
      weight: 0.05,
      description: 'Advanced smart watch with health monitoring features',
      tags: ['electronics', 'wearable', 'health'],
      created_at: Date.now()
    }
  ]

  console.log('Serializing and storing products...')
  for (const product of sampleProducts) {
    const serialized = ProductSchema.serialize(product)
    console.log(`Product ${product.id} serialized to ${serialized.length} bytes`)
    
    const deserialized = ProductSchema.deserialize(serialized)
    console.log('Deserialized:', JSON.stringify(deserialized, null, 2))
    console.log('---')
  }

  await db.close()

  // Example with IoT Sensor Data
  console.log('\n=== Example: IoT Sensor Data Schema ===')
  
  const sensorData = {
    sensor_id: 12345,
    timestamp: Date.now(),
    temperature: 23.5,
    humidity: 65.2,
    pressure: 1013.25,
    battery_level: 85,
    location: { lat: 37.7749, lng: -122.4194, altitude: 10 },
    metadata: { device_type: 'BME280', firmware_version: '1.2.3', last_calibration: '2024-01-15' }
  }

  const sensorBuffer = SensorDataSchema.serialize(sensorData)
  const sensorRestored = SensorDataSchema.deserialize(sensorBuffer)
  
  console.log('Original sensor data:', JSON.stringify(sensorData, null, 2))
  console.log('Serialized size:', sensorBuffer.length, 'bytes')
  console.log('Restored data:', JSON.stringify(sensorRestored, null, 2))

  console.log('\n=== Schema Comparison ===')
  console.log('Default User schema:', DefaultSchemas.User.getRowSize(), 'bytes')
  console.log('Product schema:', ProductSchema.getRowSize(), 'bytes')
  console.log('Sensor data schema:', SensorDataSchema.getRowSize(), 'bytes')
  console.log('Post schema:', PostSchema.getRowSize(), 'bytes')
  console.log('Transaction schema:', TransactionSchema.getRowSize(), 'bytes')
  console.log('Config schema:', ConfigSchema.getRowSize(), 'bytes')
}

// Run examples if this file is executed directly
if (require.main === module) {
  demonstrateCustomSchemas().catch(console.error)
}

module.exports = {
  ProductSchema,
  SensorDataSchema,
  PostSchema,
  TransactionSchema,
  ConfigSchema,
  demonstrateCustomSchemas
}