# Custom Data Structures Support

This B-tree database supports custom data structures through a flexible schema system. You can define your own data types and schemas using predefined schemas or create entirely custom structures.

## Table of Contents

- [Quick Start](#quick-start)
- [Available Data Types](#available-data-types)
- [Creating Custom Schemas](#creating-custom-schemas)
- [Using Schemas with the Database](#using-schemas-with-the-database)
- [Predefined Schemas](#predefined-schemas)
- [REPL Commands](#repl-commands)
- [Performance Considerations](#performance-considerations)
- [Migration Guide](#migration-guide)

## Quick Start

```javascript
const { DataTypes, Schema, DefaultSchemas } = require('./src/schema')
const { connectDB, createPager } = require('./src/persistent')

// Create a custom schema
const ProductSchema = new Schema({
  id: DataTypes.UINT32,
  name: DataTypes.VARCHAR(100),
  price: DataTypes.DOUBLE,
  in_stock: DataTypes.BOOLEAN,
  tags: DataTypes.JSON(200)
})

// Use with database
const db = connectDB('./products.db')
await db.open()

const pager = await createPager(db, {
  schema: ProductSchema,
  serialize: (obj) => ProductSchema.serialize(obj),
  deserialize: (buffer) => ProductSchema.deserialize(buffer),
})

// Insert data
const product = {
  id: 1,
  name: 'Wireless Headphones',
  price: 99.99,
  in_stock: true,
  tags: ['electronics', 'audio']
}

// The schema handles serialization automatically
```

## Available Data Types

### Numeric Types

- **`DataTypes.INT32`** - 32-bit signed integer (-2,147,483,648 to 2,147,483,647)
- **`DataTypes.UINT32`** - 32-bit unsigned integer (0 to 4,294,967,295)
- **`DataTypes.INT64`** - 64-bit signed integer (timestamps, large numbers)
- **`DataTypes.FLOAT`** - 32-bit floating point number
- **`DataTypes.DOUBLE`** - 64-bit floating point number (higher precision)

### Text Types

- **`DataTypes.VARCHAR(length)`** - Variable-length string up to `length` bytes
  - Null-terminated for proper string handling
  - Automatically truncated if data exceeds length
  - Example: `DataTypes.VARCHAR(255)` for emails

### Boolean Type

- **`DataTypes.BOOLEAN`** - True/false values (1 byte storage)

### Structured Data

- **`DataTypes.JSON(maxLength)`** - JSON objects and arrays
  - Serialized as JSON strings with null termination
  - Perfect for metadata, configurations, and complex data
  - Example: `DataTypes.JSON(500)` for product attributes

### Binary Data

- **`DataTypes.BINARY(length)`** - Fixed-length binary data
  - Useful for hashes, UUIDs, or encoded data
  - Example: `DataTypes.BINARY(16)` for UUID storage

## Creating Custom Schemas

### Basic Schema

```javascript
const UserProfileSchema = new Schema({
  user_id: DataTypes.UINT32,
  display_name: DataTypes.VARCHAR(50),
  bio: DataTypes.VARCHAR(500),
  followers_count: DataTypes.UINT32,
  is_verified: DataTypes.BOOLEAN,
  joined_at: DataTypes.INT64,
  preferences: DataTypes.JSON(300)
})

console.log(`Schema size: ${UserProfileSchema.getRowSize()} bytes`)
```

### IoT Sensor Schema

```javascript
const SensorSchema = new Schema({
  sensor_id: DataTypes.UINT32,
  timestamp: DataTypes.INT64,
  temperature: DataTypes.FLOAT,
  humidity: DataTypes.FLOAT,
  pressure: DataTypes.FLOAT,
  battery_level: DataTypes.UINT32,
  location: DataTypes.JSON(100),      // {lat, lng, altitude}
  metadata: DataTypes.JSON(200)       // device info, calibration data
})
```

### E-commerce Schema

```javascript
const OrderSchema = new Schema({
  order_id: DataTypes.UINT32,
  customer_id: DataTypes.UINT32,
  total_amount: DataTypes.DOUBLE,
  currency: DataTypes.VARCHAR(3),     // USD, EUR, etc.
  status: DataTypes.VARCHAR(20),      // pending, shipped, delivered
  created_at: DataTypes.INT64,
  shipping_address: DataTypes.JSON(400),
  items: DataTypes.JSON(1000)         // array of order items
})
```

## Using Schemas with the Database

### Complete Example

```javascript
const { DataTypes, Schema } = require('./src/schema')
const { connectDB, createPager, getMaxLeafSize, getMaxNodeSize } = require('./src/persistent')

// Define your schema
const LogSchema = new Schema({
  id: DataTypes.UINT32,
  timestamp: DataTypes.INT64,
  level: DataTypes.VARCHAR(10),       // INFO, WARN, ERROR
  message: DataTypes.VARCHAR(1000),
  user_id: DataTypes.UINT32,
  metadata: DataTypes.JSON(500)
})

// Schema-aware database wrapper
class LogDatabase {
  constructor(dbPath) {
    this.dbPath = dbPath
    this.schema = LogSchema
    this.db = null
    this.pager = null
    this.MaxLeafSize = getMaxLeafSize(LogSchema.getRowSize())
    this.MaxNodeSize = getMaxNodeSize()
  }

  async connect() {
    this.db = connectDB(this.dbPath)
    await this.db.open()
    
    this.pager = await createPager(this.db, {
      schema: this.schema,
      serialize: (obj) => this.schema.serialize(obj),
      deserialize: (buffer) => this.schema.deserialize(buffer),
    })
  }

  async close() {
    if (this.pager) await this.pager.flush()
    if (this.db) await this.db.close()
  }

  // Add your business logic methods here
  async addLog(logEntry) {
    // Insert logic using this.pager
  }
}

// Usage
const logDB = new LogDatabase('./application.log.db')
await logDB.connect()

const logEntry = {
  id: 1,
  timestamp: Date.now(),
  level: 'INFO',
  message: 'User logged in successfully',
  user_id: 12345,
  metadata: { ip: '192.168.1.1', user_agent: 'Mozilla/5.0...' }
}

// The schema handles all serialization
```

## Predefined Schemas

The system comes with several ready-to-use schemas:

### `DefaultSchemas.User` (Original)
- `id`: UINT32
- `username`: VARCHAR(32)
- `email`: VARCHAR(255)
- Size: 291 bytes

### `DefaultSchemas.Product`
- `id`: UINT32
- `name`: VARCHAR(100)
- `price`: DOUBLE
- `category_id`: UINT32
- `in_stock`: BOOLEAN
- `description`: VARCHAR(500)
- Size: 617 bytes

### `DefaultSchemas.LogEntry`
- `id`: UINT32
- `timestamp`: INT64
- `level`: VARCHAR(10)
- `message`: VARCHAR(1000)
- `metadata`: JSON(500)
- Size: 1,522 bytes

### `DefaultSchemas.Event`
- `id`: UINT32
- `user_id`: UINT32
- `event_type`: VARCHAR(50)
- `timestamp`: INT64
- `properties`: JSON(2000)
- Size: 2,066 bytes

### `DefaultSchemas.KeyValue`
- `key`: VARCHAR(100)
- `value`: JSON(1000)
- Size: 1,100 bytes

## REPL Commands

The enhanced REPL supports the new schema system:

```bash
# Switch to a predefined schema
> schema Product

# Create a custom schema
> custom {"id": "UINT32", "name": "VARCHAR(100)", "price": "DOUBLE"}

# Show current schema information
> current

# Show example data for current schema
> examples

# Insert data (JSON format)
> insert {"id": 1, "name": "Product Name", "price": 29.99}

# Original format still works for User schema
> insert 1 username email@example.com

# Search data
> select where id >= 1 limit 10

# Show B-tree structure
> btree

# Exit
> quit
```

## Performance Considerations

### Schema Size Impact

- **Smaller schemas** = More records per page = Better cache performance
- **Larger schemas** = Fewer records per page = More I/O operations
- **JSON fields** = Flexible but add serialization overhead

### Optimal Size Guidelines

```javascript
// Good: Compact schema (158 bytes)
const CompactSchema = new Schema({
  id: DataTypes.UINT32,           // 4 bytes
  status: DataTypes.UINT32,       // 4 bytes
  timestamp: DataTypes.INT64,     // 8 bytes
  value: DataTypes.DOUBLE,        // 8 bytes
  metadata: DataTypes.JSON(134)   // 134 bytes
})

// Consider splitting if schema exceeds 1KB
// Large schemas reduce records per page significantly
```

### Page Calculations

```javascript
const schema = new Schema({...})
const rowSize = schema.getRowSize()
const maxRecordsPerPage = getMaxLeafSize(rowSize)

console.log(`Records per page: ${maxRecordsPerPage}`)
console.log(`Page utilization: ${(maxRecordsPerPage * rowSize / 4096 * 100).toFixed(1)}%`)
```

## Migration Guide

### From Original Schema

The original hardcoded User schema is now available as `DefaultSchemas.User`:

```javascript
// Using predefined schema
const pager = await createPager(db, {
  schema: DefaultSchemas.User,
  serialize: (obj) => DefaultSchemas.User.serialize(obj),
  deserialize: (buffer) => DefaultSchemas.User.deserialize(buffer),
})
```

### Gradual Migration

1. **Start with predefined schemas** for common use cases
2. **Create custom schemas** as needed for specific requirements
3. **Test thoroughly** with your data patterns
4. **Monitor performance** with different schema sizes

### Schema Flexibility

- Multiple predefined schemas available for common use cases
- Custom schema creation with flexible data types
- JSON-only format in REPL for consistency
- Schema-aware optimizations throughout

## Best Practices

### Schema Design

1. **Use appropriate data types** - Don't use INT64 when UINT32 suffices
2. **Size VARCHAR fields appropriately** - Balance between storage and flexibility
3. **Limit JSON field sizes** - Large JSON fields impact performance
4. **Consider access patterns** - Frequently queried fields should be efficiently packed
5. **Plan for growth** - Leave room for schema evolution

### Performance Optimization

1. **Measure actual usage** - Profile with real data
2. **Benchmark different schemas** - Test various field arrangements
3. **Monitor page utilization** - Aim for good space efficiency
4. **Consider data compression** - For large JSON or text fields

### Error Handling

```javascript
try {
  const schema = new Schema({
    id: DataTypes.UINT32,
    data: DataTypes.JSON(100)
  })
  
  const serialized = schema.serialize(data)
  const restored = schema.deserialize(serialized)
} catch (error) {
  console.error('Schema operation failed:', error.message)
  // Handle serialization errors appropriately
}
```

## Examples Repository

See the `examples/` directory for complete working examples:

- `examples/custom-schemas.js` - Comprehensive schema examples
- `tests/schema.test.js` - Test suite demonstrating functionality

Run examples:

```bash
# View all available schemas
node examples/custom-schemas.js

# Run tests
node tests/schema.test.js

# Start REPL with schema support
node src/repl.js
```

The custom data structure support makes this B-tree database suitable for a wide variety of applications while maintaining the performance and reliability of the original implementation.