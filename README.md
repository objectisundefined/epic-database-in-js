# B-Tree Database with Custom Data Structure Support

A JavaScript implementation of a B-tree database that now supports custom data structures through a flexible schema system.

## Original Project

This project is based on the "Build Your Own Database" tutorial series:

- [C Tutorial](https://cstack.github.io/db_tutorial/parts/part13.html)
- [C# Tutorial](https://www.codeproject.com/Articles/1029838/Build-Your-Own-Database)
- [B-Tree Reference](https://www.jianshu.com/p/a267c785e122)
- [B+ Tree Reference](https://www.guru99.com/introduction-b-plus-tree.html)

## 🚀 New Features: Custom Data Structure Support

### What's New

- ✅ **Flexible Schema System** - Define custom data structures with various types
- ✅ **Multiple Data Types** - INT32, UINT32, INT64, FLOAT, DOUBLE, BOOLEAN, VARCHAR, JSON, BINARY
- ✅ **Predefined Schemas** - Ready-to-use schemas for common use cases
- ✅ **Dynamic Serialization** - Automatic serialization/deserialization based on schema
- ✅ **Enhanced REPL** - Interactive shell with schema switching, JSON data support, and full CRUD operations (Create, Read, Update, Delete)
- ✅ **Schema Flexibility** - Multiple predefined schemas and custom schema support
- ✅ **Performance Optimized** - Schema-aware page size calculations

### Quick Example

```javascript
const { DataTypes, Schema } = require('./src/schema')
const { connectDB, createPager } = require('./src/persistent')

// Define a custom schema
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

// Insert product data
const product = {
  id: 1,
  name: 'Wireless Headphones',
  price: 99.99,
  in_stock: true,
  tags: ['electronics', 'audio']
}
```

## Getting Started

### Running the Enhanced REPL

```bash
node src/repl.js
```

#### Available Commands

```bash
# Switch to predefined schemas
> schema Product
> schema LogEntry
> schema Event

# Create custom schema
> custom {"id": "UINT32", "name": "VARCHAR(100)", "price": "DOUBLE"}

# Show current schema
> current

# Insert data (JSON format)
> insert {"id": 1, "name": "Product Name", "price": 29.99}

# Update existing data by ID
> update {"id": 1, "name": "Updated Product Name", "price": 39.99}

# Remove data by ID
> remove 1

# Search data
> select where id >= 1 limit 10

# Show B-tree structure
> btree

# Exit
> quit
```

### Available Schemas

| Schema | Size | Use Case |
|--------|------|----------|
| User | 291 bytes | User accounts |
| Product | 617 bytes | E-commerce products |
| LogEntry | 1,522 bytes | Application logs |
| Event | 2,066 bytes | Analytics events |
| KeyValue | 1,100 bytes | Configuration storage |

### Running Examples

```bash
# View all schema examples
node examples/custom-schemas.js

# Run comprehensive tests
node tests/schema.test.js
```

## Data Types

| Type | Size | Description |
|------|------|-------------|
| `DataTypes.INT32` | 4 bytes | Signed 32-bit integer |
| `DataTypes.UINT32` | 4 bytes | Unsigned 32-bit integer |
| `DataTypes.INT64` | 8 bytes | Signed 64-bit integer |
| `DataTypes.FLOAT` | 4 bytes | 32-bit floating point |
| `DataTypes.DOUBLE` | 8 bytes | 64-bit floating point |
| `DataTypes.BOOLEAN` | 1 byte | True/false value |
| `DataTypes.VARCHAR(n)` | n bytes | Variable-length string |
| `DataTypes.JSON(n)` | n bytes | JSON objects/arrays |
| `DataTypes.BINARY(n)` | n bytes | Binary data |

## Example Use Cases

### IoT Sensor Data

```javascript
const SensorSchema = new Schema({
  sensor_id: DataTypes.UINT32,
  timestamp: DataTypes.INT64,
  temperature: DataTypes.FLOAT,
  humidity: DataTypes.FLOAT,
  location: DataTypes.JSON(100),
  metadata: DataTypes.JSON(200)
})
```

### Financial Transactions

```javascript
const TransactionSchema = new Schema({
  id: DataTypes.UINT32,
  from_account: DataTypes.VARCHAR(50),
  to_account: DataTypes.VARCHAR(50),
  amount: DataTypes.DOUBLE,
  currency: DataTypes.VARCHAR(3),
  timestamp: DataTypes.INT64,
  metadata: DataTypes.JSON(800)
})
```

### Social Media Posts

```javascript
const PostSchema = new Schema({
  id: DataTypes.UINT32,
  user_id: DataTypes.UINT32,
  content: DataTypes.VARCHAR(2000),
  likes: DataTypes.UINT32,
  created_at: DataTypes.INT64,
  tags: DataTypes.JSON(500)
})
```

## Performance

The schema system is optimized for performance:

- **10,000+ serializations/sec** - Fast data encoding
- **400,000+ deserializations/sec** - Efficient data decoding
- **Schema-aware paging** - Optimal page utilization
- **Minimal overhead** - Direct binary serialization

## Documentation

- **[Complete Guide](CUSTOM_SCHEMAS.md)** - Comprehensive documentation with examples
- **[API Reference](src/schema.js)** - Schema and data type definitions
- **[Examples](examples/)** - Real-world usage examples
- **[Tests](tests/)** - Test suite with edge cases

## File Structure

```
├── src/
│   ├── schema.js          # Schema system and data types
│   ├── persistent.js      # Enhanced B-tree implementation
│   ├── repl.js           # Interactive shell with schema support
│   └── tree/             # B-tree step implementations
├── examples/
│   └── custom-schemas.js  # Schema examples and demos
├── tests/
│   └── schema.test.js     # Comprehensive test suite
├── CUSTOM_SCHEMAS.md      # Detailed documentation
└── README.md             # This file
```

## Schema Usage

The enhanced B-tree implementation provides:

- Multiple predefined schemas for common use cases
- Custom schema creation with flexible data types
- Automatic serialization/deserialization
- Schema-aware performance optimizations

## Migration

To work with different data structures:

1. Use predefined schemas (`DefaultSchemas.User`, `DefaultSchemas.Product`, etc.) for common patterns
2. Create custom schemas for specific use cases
3. Test with your data patterns
4. Monitor performance with different schema sizes

## Testing

```bash
# Run all tests
node tests/schema.test.js

# Run specific examples
node examples/custom-schemas.js

# Interactive testing
node src/repl.js
```

## Development

The B-tree implementation supports:

- Persistent storage with 4KB pages
- Automatic node splitting and balancing
- Range queries and exact lookups
- Schema-aware serialization
- Configurable data structures

## Quick Development Commands

```bash
cp test.db t.db
vim t.db
:%!xxd
rm -rf t.db
```

## Contributing

When adding new features:

1. Add comprehensive tests
2. Update documentation
3. Consider performance impact
4. Follow existing code patterns
5. Ensure schema compatibility

This enhanced B-tree database is now suitable for a wide variety of applications while maintaining the simplicity and performance of the original implementation.
