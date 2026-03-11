# Table System Guide

The B-tree database now supports a comprehensive table system with full CRUD operations. This document provides a complete guide to using tables in the database.

## Overview

The table system provides:
- **Multiple tables** per database with separate schemas
- **Full CRUD operations** (Create, Read, Update, Delete)
- **Schema-based data validation** with multiple data types
- **Persistent storage** with B-tree indexing
- **Interactive REPL** for database operations
- **Performance optimizations** for large datasets

## Quick Start

### 1. Basic Usage

```javascript
const { Database, Schema, DataTypes } = require('./src/table')

// Connect to a database
const db = await Database.connect('my_database')

// Define a schema
const userSchema = new Schema({
  id: DataTypes.UINT32,
  name: DataTypes.VARCHAR(100),
  email: DataTypes.VARCHAR(150),
  age: DataTypes.UINT32,
  active: DataTypes.BOOLEAN,
  created_at: DataTypes.INT64
})

// Create a table
const usersTable = await db.createTable('users', userSchema)

// Insert data
await usersTable.create({
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  age: 30,
  active: true,
  created_at: Date.now()
})

// Read data
const users = await usersTable.read()
console.log(users)

// Update data
await usersTable.update(1, { age: 31, email: 'john.updated@example.com' })

// Delete data
await usersTable.delete(1)

// Close database
await db.close()
```

### 2. Using Predefined Schemas

```javascript
const { Database, DefaultSchemas } = require('./src/table')

const db = await Database.connect('my_database')

// Create tables with predefined schemas
const usersTable = await db.createTable('users', DefaultSchemas.User)
const productsTable = await db.createTable('products', DefaultSchemas.Product)
const eventsTable = await db.createTable('events', DefaultSchemas.Event)

// Insert data using predefined schema
await usersTable.create({ 
  id: 1, 
  username: 'johndoe', 
  email: 'john@example.com' 
})

await productsTable.create({
  id: 101,
  name: 'Laptop',
  price: 999.99,
  category_id: 1,
  in_stock: true,
  description: 'High-performance laptop'
})
```

## CRUD Operations

### Create (Insert)

```javascript
// Basic insert
const result = await table.create({
  id: 1,
  name: 'John Doe',
  email: 'john@example.com'
})
// Returns: { success: true, key: 1, data: {...} }

// Validates primary key and schema
// Throws error if key already exists or required fields missing
```

### Read (Select)

```javascript
// Read all records
const allRecords = await table.read()

// Read by primary key
const user = await table.read({ key: 1 })

// Read with conditions
const activeUsers = await table.read({ 
  where: { active: true } 
})

// Read with limit and offset
const page1 = await table.read({ 
  limit: 10, 
  offset: 0 
})

// Read with range conditions
const recentUsers = await table.read({
  where: { 
    gte: 100,  // ID >= 100
    lte: 200   // ID <= 200
  },
  limit: 50
})
```

### Update

```javascript
// Update specific fields
const result = await table.update(1, {
  email: 'newemail@example.com',
  age: 31
})
// Returns: { success: true, key: 1, oldData: {...}, newData: {...} }

// Primary key cannot be changed
// Merges new data with existing record
```

### Delete

```javascript
// Delete by primary key
const result = await table.delete(1)
// Returns: { success: true, key: 1, deletedData: {...} }

// Throws error if record doesn't exist
```

## Data Types

The table system supports multiple data types:

| Type | Size | Description | Example |
|------|------|-------------|---------|
| `DataTypes.INT32` | 4 bytes | Signed 32-bit integer | `DataTypes.INT32` |
| `DataTypes.UINT32` | 4 bytes | Unsigned 32-bit integer | `DataTypes.UINT32` |
| `DataTypes.INT64` | 8 bytes | Signed 64-bit integer | `DataTypes.INT64` |
| `DataTypes.FLOAT` | 4 bytes | 32-bit floating point | `DataTypes.FLOAT` |
| `DataTypes.DOUBLE` | 8 bytes | 64-bit floating point | `DataTypes.DOUBLE` |
| `DataTypes.BOOLEAN` | 1 byte | True/false value | `DataTypes.BOOLEAN` |
| `DataTypes.VARCHAR(n)` | n bytes | Variable-length string | `DataTypes.VARCHAR(100)` |
| `DataTypes.JSON(n)` | n bytes | JSON objects/arrays | `DataTypes.JSON(500)` |
| `DataTypes.BINARY(n)` | n bytes | Binary data | `DataTypes.BINARY(256)` |

### Example Schema with All Types

```javascript
const complexSchema = new Schema({
  id: DataTypes.UINT32,              // Primary key
  name: DataTypes.VARCHAR(100),      // String field
  price: DataTypes.DOUBLE,           // Decimal number
  quantity: DataTypes.INT32,         // Integer (can be negative)
  in_stock: DataTypes.BOOLEAN,       // Boolean flag
  created_at: DataTypes.INT64,       // Timestamp
  metadata: DataTypes.JSON(500),     // JSON data
  image_data: DataTypes.BINARY(1024) // Binary data
})
```

## Predefined Schemas

The system includes several predefined schemas for common use cases:

### User Schema (291 bytes)
```javascript
DefaultSchemas.User = new Schema({
  id: DataTypes.UINT32,
  username: DataTypes.VARCHAR(32),
  email: DataTypes.VARCHAR(255)
})
```

### Product Schema (617 bytes)
```javascript
DefaultSchemas.Product = new Schema({
  id: DataTypes.UINT32,
  name: DataTypes.VARCHAR(100),
  price: DataTypes.DOUBLE,
  category_id: DataTypes.UINT32,
  in_stock: DataTypes.BOOLEAN,
  description: DataTypes.VARCHAR(500)
})
```

### Event Schema (2,066 bytes)
```javascript
DefaultSchemas.Event = new Schema({
  id: DataTypes.UINT32,
  user_id: DataTypes.UINT32,
  event_type: DataTypes.VARCHAR(50),
  timestamp: DataTypes.INT64,
  properties: DataTypes.JSON(2000)
})
```

### LogEntry Schema (1,522 bytes)
```javascript
DefaultSchemas.LogEntry = new Schema({
  id: DataTypes.UINT32,
  timestamp: DataTypes.INT64,
  level: DataTypes.VARCHAR(10),
  message: DataTypes.VARCHAR(1000),
  metadata: DataTypes.JSON(500)
})
```

### KeyValue Schema (1,100 bytes)
```javascript
DefaultSchemas.KeyValue = new Schema({
  key: DataTypes.VARCHAR(100),
  value: DataTypes.JSON(1000)
})
```

## Interactive REPL

Start the table-based REPL for interactive database operations:

```bash
node src/table-repl.js
```

### REPL Commands

```bash
# Database operations
connect <db_name>              # Connect to a database
show tables                    # List all tables
show schema                    # Show current table schema
show structure                 # Show B-tree structure

# Table operations
create table <name> <schema>   # Create a new table
use table <name>               # Switch to a table
schema <predefined_name>       # Create table with predefined schema

# Data operations
insert <json_data>             # Insert a record
select [conditions]            # Select records
update <key> <json_data>       # Update a record
delete <key>                   # Delete a record
count                          # Count records

# Utility
help                           # Show help
quit                           # Exit
```

### REPL Examples

```bash
# Create a custom table
> create table users {"id": "UINT32", "name": "VARCHAR(50)", "email": "VARCHAR(100)"}

# Insert data
> insert {"id": 1, "name": "John Doe", "email": "john@example.com"}

# Select data
> select
> select 1
> select {"where": {"name": "John Doe"}}

# Update data
> update 1 {"email": "john.updated@example.com"}

# Delete data
> delete 1

# Use predefined schema
> schema User
> insert {"id": 1, "username": "johndoe", "email": "john@example.com"}
```

## Database Management

### Multiple Databases

```javascript
// Each database is isolated
const userDB = await Database.connect('users_db')
const logDB = await Database.connect('logs_db')
const analyticsDB = await Database.connect('analytics_db')

// Create different tables in different databases
await userDB.createTable('accounts', userSchema)
await logDB.createTable('errors', logSchema)
await analyticsDB.createTable('events', eventSchema)
```

### Table Management

```javascript
const db = await Database.connect('my_database')

// Create multiple tables
const usersTable = await db.createTable('users', userSchema)
const productsTable = await db.createTable('products', productSchema)
const ordersTable = await db.createTable('orders', orderSchema)

// List tables
const tableNames = db.listTables()
console.log(tableNames) // ['users', 'products', 'orders']

// Get table by name
const table = await db.getTable('users')

// Drop table
await db.dropTable('old_table')

// Database info
const info = db.getInfo()
console.log(info.name, info.tables.length)
```

## Advanced Usage

### Complex Queries

```javascript
// Range queries
const results = await table.read({
  where: {
    gte: 100,  // ID >= 100
    lte: 500   // ID <= 500
  },
  limit: 100,
  offset: 50
})

// Field-based filtering
const activeUsers = await table.read({
  where: {
    active: true,
    age: 25
  }
})

// Pagination
const page1 = await table.read({ limit: 20, offset: 0 })
const page2 = await table.read({ limit: 20, offset: 20 })
```

### Performance Optimization

```javascript
// Batch operations for better performance
const batchInsert = async (table, records) => {
  for (const record of records) {
    await table.create(record)
  }
}

// Use appropriate limits for large datasets
const processLargeDataset = async (table) => {
  let offset = 0
  const batchSize = 1000
  
  while (true) {
    const batch = await table.read({ 
      limit: batchSize, 
      offset 
    })
    
    if (batch.length === 0) break
    
    // Process batch
    for (const record of batch) {
      // Process individual record
    }
    
    offset += batchSize
  }
}
```

### Schema Design Best Practices

```javascript
// 1. Choose appropriate field sizes
const efficientSchema = new Schema({
  id: DataTypes.UINT32,              // Use UINT32 for positive IDs
  title: DataTypes.VARCHAR(100),     // Size based on expected content
  description: DataTypes.VARCHAR(500), // Larger for longer text
  metadata: DataTypes.JSON(200)      // Size based on JSON complexity
})

// 2. Consider data types carefully
const typeOptimizedSchema = new Schema({
  id: DataTypes.UINT32,              // Primary key
  price: DataTypes.DOUBLE,           // Decimal precision needed
  quantity: DataTypes.INT32,         // Can be negative
  timestamp: DataTypes.INT64,        // Unix timestamp
  is_active: DataTypes.BOOLEAN       // Simple flag
})

// 3. Plan for data growth
const scalableSchema = new Schema({
  id: DataTypes.UINT32,              // Supports 4B+ records
  content: DataTypes.VARCHAR(2000),  // Room for expansion
  tags: DataTypes.JSON(1000)         // Flexible metadata
})
```

## Performance Characteristics

### Benchmarks

| Operation | Performance | Notes |
|-----------|-------------|--------|
| Insert | ~5-10ms per record | B-tree maintains balance |
| Read by key | ~1-2ms per record | Direct B-tree lookup |
| Range scan | ~0.1ms per record | Sequential leaf traversal |
| Update | ~2-5ms per record | In-place modification |
| Delete | ~5-10ms per record | B-tree rebalancing |

### Optimization Tips

1. **Use appropriate data types** - Smaller types = better performance
2. **Batch operations** - Process multiple records together
3. **Limit result sets** - Use `limit` for large queries
4. **Primary key design** - Use sequential IDs when possible
5. **Schema size** - Smaller schemas = more records per page

## Error Handling

```javascript
try {
  // Table operations
  await table.create(data)
} catch (error) {
  if (error.message.includes('already exists')) {
    console.log('Record already exists')
  } else if (error.message.includes('Primary key')) {
    console.log('Missing required primary key')
  } else {
    console.error('Unexpected error:', error)
  }
}
```

## Examples

See the `examples/` directory for complete working examples:

- `examples/table-crud.js` - Comprehensive CRUD operations demo
- `src/table-repl.js` - Interactive REPL interface
- `tests/table.test.js` - Complete test suite

## API Reference

### Database Class

```javascript
// Static methods
Database.connect(name, dbDir)     // Connect to database

// Instance methods
createTable(name, schema)         // Create a new table
getTable(name)                    // Get existing table
dropTable(name)                   // Delete a table
listTables()                      // List table names
getInfo()                         // Get database info
close()                           // Close database
```

### Table Class

```javascript
// CRUD operations
create(data)                      // Insert record
read(conditions)                  // Select records
update(key, data)                 // Update record
delete(key)                       // Delete record

// Utility methods
count()                           // Count records
getInfo()                         // Get table info
showStructure()                   // Show B-tree structure
open()                            // Open table
close()                           // Close table
```

### Schema Class

```javascript
new Schema(fields)                // Create schema
getRowSize()                      // Get record size
serialize(obj)                    // Serialize to buffer
deserialize(buffer)               // Deserialize from buffer
getField(name)                    // Get field info
getFields()                       // Get all fields
```

This table system provides a complete database solution with modern CRUD operations while maintaining the performance benefits of B-tree indexing.