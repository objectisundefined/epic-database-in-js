# Socket Protocol Documentation

## Overview

The B+ Tree Database now supports socket-based client-server communication, enabling remote database access, multi-client support, and optional authentication. This document describes the socket protocol, API usage, and implementation details.

## Features

- 🔌 **TCP Socket Communication**: Fast, reliable binary protocol
- 🔐 **Optional Authentication**: User-based access control
- 🌐 **Multi-Client Support**: Concurrent connections with session management
- ⚡ **High Performance**: Optimized for B+ tree range queries
- 🔄 **Auto-Reconnection**: Client-side connection recovery
- 💓 **Heartbeat Monitoring**: Connection health monitoring
- 📊 **Real-time Statistics**: Server performance metrics

## Quick Start

### Starting the Server

```bash
# Start server with defaults (port 3306, no auth)
npm run server

# Start with custom settings
./bin/db-server --port 8080 --auth --max-connections 50

# Start with configuration file
./bin/db-server --config server-config.json
```

### Client Connection

```javascript
const { DatabaseClient } = require('bplus-tree-database')

// Connect to server
const client = new DatabaseClient({
  host: 'localhost',
  port: 3306
})

await client.connect()

// Use database
const db = await client.useDatabase('my_app')

// Create table
await db.createTable('users', {
  id: DataTypes.UINT32,
  name: DataTypes.VARCHAR(100),
  email: DataTypes.VARCHAR(150)
})

// Insert data
const users = db.table('users')
await users.insert({ id: 1, name: 'John', email: 'john@example.com' })

// Query data
const results = await users.find({ name: 'John' })
console.log(results)

// Disconnect
await client.disconnect()
```

## Protocol Specification

### Message Format

All messages are JSON objects with the following structure:

```json
{
  "id": "unique-message-id",
  "type": "MESSAGE_TYPE",
  "version": "1.0.0",
  "timestamp": 1640995200000,
  "data": { /* message payload */ },
  "sessionId": "optional-session-id"
}
```

### Message Types

#### Connection Management
- `CONNECT` - Connect to a database
- `CONNECT_ACK` - Server connection acknowledgment
- `DISCONNECT` - Graceful disconnection

#### Authentication
- `AUTH` - Authenticate user
- `AUTH_ACK` - Authentication response

#### Database Operations
- `CREATE_TABLE` - Create new table
- `GET_TABLE` - Get table metadata
- `LIST_TABLES` - List all tables
- `DROP_TABLE` - Delete table

#### Table Operations
- `INSERT` - Insert record
- `SELECT` - Query records
- `UPDATE` - Update records
- `DELETE` - Delete records
- `COUNT` - Count records
- `RANGE_QUERY` - B+ tree range query

#### Response Types
- `SUCCESS` - Operation successful
- `ERROR` - Operation failed

#### System
- `PING` / `PONG` - Heartbeat

### Error Codes

| Code | Description |
|------|-------------|
| 1000 | Unknown error |
| 1001 | Invalid message format |
| 1002 | Authentication failed |
| 1003 | Permission denied |
| 1004 | Table not found |
| 1005 | Table already exists |
| 1006 | Invalid schema |
| 1007 | Invalid query |
| 1008 | Connection error |
| 1009 | Transaction error |

## API Reference

### DatabaseServer

```javascript
const { DatabaseServer } = require('bplus-tree-database')

const server = new DatabaseServer({
  port: 3306,              // Server port
  host: 'localhost',       // Server host
  maxConnections: 100,     // Max concurrent connections
  requireAuth: false,      // Enable authentication
  dbDir: './data',         // Database directory
  sessionTimeout: 3600000  // Session timeout (1 hour)
})

// Start server
await server.start()

// Add user (if auth enabled)
server.addUser('username', 'password')

// Get statistics
const stats = server.getStats()

// Stop server
await server.stop()
```

### DatabaseClient

```javascript
const { DatabaseClient } = require('bplus-tree-database')

const client = new DatabaseClient({
  host: 'localhost',           // Server host
  port: 3306,                  // Server port
  timeout: 30000,              // Connection timeout
  reconnectDelay: 5000,        // Reconnection delay
  maxReconnectAttempts: 3,     // Max reconnection attempts
  requestTimeout: 10000,       // Request timeout
  heartbeatInterval: 30000     // Heartbeat interval
})

// Connect
await client.connect()

// Authenticate (if required)
await client.authenticate('username', 'password')

// Use database
const db = await client.useDatabase('database_name')

// Disconnect
await client.disconnect()
```

### RemoteDatabase

```javascript
// Get table
const table = db.table('table_name')

// Create table
await db.createTable('new_table', schema)

// List tables
const tables = await db.listTables()
```

### RemoteTable

```javascript
// Insert
await table.insert({ id: 1, name: 'John' })

// Find
const results = await table.find({ name: 'John' })
const all = await table.find()

// Update
await table.update({ id: 1 }, { name: 'Jane' })

// Delete
await table.delete({ id: 1 })

// Count
const count = await table.count({ active: true })

// Range query (B+ tree advantage)
const recent = await table.range('timestamp', startTime, endTime)
const userRange = await table.range('user_id', 100, 200)
```

## Authentication

### Server Setup

```javascript
const server = new DatabaseServer({
  requireAuth: true
})

// Add users
server.addUser('admin', 'admin_password')
server.addUser('user1', 'user_password')
server.addUser('readonly', 'readonly_password')

await server.start()
```

### Client Authentication

```javascript
const client = new DatabaseClient({ port: 3306 })
await client.connect()

// Authenticate
const session = await client.authenticate('admin', 'admin_password')
console.log('Session ID:', session.sessionId)

// Now can access databases
const db = await client.useDatabase('secure_db')
```

## Performance Optimization

### Server Configuration

```javascript
const server = new DatabaseServer({
  maxConnections: 200,         // Higher connection limit
  dbOptions: {
    cacheSize: 500,           // Larger cache
    pageSize: 8192           // Larger page size
  }
})
```

### Client Configuration

```javascript
const client = new DatabaseClient({
  requestTimeout: 30000,       // Longer timeout for large queries
  heartbeatInterval: 60000     // Less frequent heartbeats
})
```

### Batch Operations

```javascript
// Batch inserts for better performance
const promises = []
for (const record of largeDataset) {
  promises.push(table.insert(record))
  
  if (promises.length >= 100) {
    await Promise.all(promises)
    promises.length = 0
  }
}
await Promise.all(promises)
```

## Example Use Cases

### Multi-User Application

```javascript
// Server
const server = new DatabaseServer({
  requireAuth: true,
  maxConnections: 50
})
server.addUser('app_user', 'secure_password')
await server.start()

// Multiple clients
const clients = []
for (let i = 0; i < 10; i++) {
  const client = new DatabaseClient()
  await client.connect()
  await client.authenticate('app_user', 'secure_password')
  clients.push(client)
}

// Concurrent operations
const promises = clients.map(async (client) => {
  const db = await client.useDatabase('shared_db')
  const logs = db.table('activity_logs')
  return await logs.insert({
    timestamp: Date.now(),
    action: 'user_action',
    client_id: Math.random()
  })
})

await Promise.all(promises)
```

### Analytics Dashboard

```javascript
// Connect to analytics database
const client = new DatabaseClient()
await client.connect()
const db = await client.useDatabase('analytics')
const events = db.table('events')

// Real-time analytics queries
const last24Hours = Date.now() - 86400000
const recentEvents = await events.range('timestamp', last24Hours, Date.now())

const userActions = await events.count({ action: 'user_click' })
const conversions = await events.count({ action: 'purchase' })

console.log(`Events last 24h: ${recentEvents.length}`)
console.log(`Click rate: ${userActions}`)
console.log(`Conversions: ${conversions}`)
```

### Microservices Architecture

```javascript
// Service A - User Management
const userClient = new DatabaseClient({ port: 3306 })
await userClient.connect()
const userDB = await userClient.useDatabase('users')

// Service B - Analytics
const analyticsClient = new DatabaseClient({ port: 3306 })
await analyticsClient.connect()
const analyticsDB = await analyticsClient.useDatabase('analytics')

// Service C - Inventory
const inventoryClient = new DatabaseClient({ port: 3306 })
await inventoryClient.connect()
const inventoryDB = await inventoryClient.useDatabase('inventory')

// Each service can work with the same database server
// but different databases/tables
```

## Error Handling

### Connection Errors

```javascript
client.on('error', (err) => {
  console.error('Client error:', err)
})

client.on('disconnected', () => {
  console.log('Disconnected from server')
})

client.on('reconnectionFailed', () => {
  console.error('Failed to reconnect after max attempts')
})
```

### Request Errors

```javascript
try {
  await table.insert(invalidRecord)
} catch (error) {
  if (error.code === 1006) {
    console.error('Schema validation failed:', error.message)
  } else {
    console.error('Unexpected error:', error)
  }
}
```

## Security Considerations

1. **Authentication**: Always use authentication in production
2. **Network Security**: Use VPN or secure networks for database traffic
3. **Connection Limits**: Set appropriate `maxConnections` to prevent DoS
4. **Input Validation**: Validate all data before database operations
5. **Session Management**: Monitor and clean up inactive sessions

## Monitoring and Debugging

### Server Statistics

```javascript
const stats = server.getStats()
console.log({
  isRunning: stats.isRunning,
  connectedClients: stats.connectedClients,
  maxConnections: stats.maxConnections,
  databases: stats.databases,
  activeSessions: stats.activeSessions,
  uptime: stats.uptime
})
```

### Client Status

```javascript
const status = client.getStatus()
console.log({
  isConnected: status.isConnected,
  isAuthenticated: status.isAuthenticated,
  database: status.database,
  pendingRequests: status.pendingRequests,
  reconnectAttempts: status.reconnectAttempts
})
```

## Migration Guide

### From Local to Socket Database

```javascript
// Before (local)
const { Database } = require('bplus-tree-database')
const db = new Database('my_db')
await db.connect()
const table = await db.createTable('users', schema)

// After (socket)
const { DatabaseClient } = require('bplus-tree-database')
const client = new DatabaseClient()
await client.connect()
const db = await client.useDatabase('my_db')
await db.createTable('users', schema)
const table = db.table('users')
```

The API is nearly identical, making migration straightforward.

## Troubleshooting

### Common Issues

1. **Connection Refused**: Check if server is running and port is correct
2. **Authentication Failed**: Verify username/password and that auth is enabled
3. **Request Timeout**: Increase `requestTimeout` for large operations
4. **Max Connections**: Increase `maxConnections` or implement connection pooling

### Debug Logging

Enable debug logging by setting environment variable:

```bash
DEBUG=database:* node your-app.js
```

## Examples

See the `examples/` directory for complete working examples:

- `socket-basic.js` - Basic CRUD operations
- `socket-auth.js` - Authentication example
- `socket-performance.js` - Performance testing with large datasets