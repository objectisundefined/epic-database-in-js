# File Flushing and Data Safety

This database implements comprehensive file flushing mechanisms to prevent data loss in case of application crashes, power failures, or unexpected shutdowns.

## Features

### 1. Immediate Sync Mode (Default)
- **Enabled by default** for maximum data safety
- Every write operation immediately syncs to disk using `fsync()`
- Metadata files are written using atomic file operations with immediate sync
- Prevents data loss but has performance overhead

### 2. Delayed Sync Mode
- Optional mode for high-performance scenarios
- Writes are buffered in memory and synced on close or manual flush
- Significant performance improvement but risk of data loss on crashes
- Recommended only when performance is critical and data loss is acceptable

### 3. Manual Flushing
- Explicit control over when data is written to disk
- Call `table.pager.flush()` to force immediate write
- Useful for batch operations with periodic safety checkpoints

## Usage Examples

### Safe Mode (Default)
```javascript
const { Database } = require('./src/table')

// Immediate sync enabled by default
const db = await Database.connect('mydb', './data')
// or explicitly:
const db = await Database.connect('mydb', './data', { immediateSync: true })

const table = await db.getTable('users')
await table.create({ id: 1, name: 'John' }) // Immediately synced to disk
```

### Performance Mode
```javascript
const { Database } = require('./src/table')

// Disable immediate sync for better performance
const db = await Database.connect('mydb', './data', { immediateSync: false })

const table = await db.getTable('users')
await table.create({ id: 1, name: 'John' }) // Buffered in memory

// Manual flush when needed
await table.pager.flush() // Force write to disk

// Or ensure flush on close
await db.close() // Auto-flushes all data
```

### Batch Operations with Manual Checkpoints
```javascript
const db = await Database.connect('mydb', './data', { immediateSync: false })
const table = await db.getTable('logs')

// Batch insert with periodic flushes
for (let i = 0; i < 10000; i++) {
  await table.create({ id: i, message: `Log entry ${i}` })
  
  // Checkpoint every 1000 records
  if (i % 1000 === 0) {
    await table.pager.flush()
    console.log(`Checkpoint: ${i} records safely written`)
  }
}

await db.close() // Final flush
```

## Implementation Details

### Database Level
- `Database.connect(name, dbDir, { immediateSync: true/false })`
- Option is propagated to all tables created in the database
- Metadata files use atomic write operations with immediate sync

### Table Level
- `new Table(name, schema, dbDir, { immediateSync: true/false })`
- Individual tables can have different sync behaviors
- CRUD operations call `pager.flush()` after modifications

### Low-Level Operations
- `connectDB(path, { immediateSync: true/false })` controls file handle behavior
- `fd.sync()` is called after every write when immediate sync is enabled
- Pager's `flush()` method writes all dirty pages and syncs

## Performance Considerations

### Benchmark Results
Based on testing with 10 record insertions:
- **With immediate sync**: ~60ms (safer)
- **Without immediate sync**: ~3ms (faster)
- **Performance difference**: ~20x faster without immediate sync

### Recommendations

#### Use Immediate Sync (Default) When:
- Data integrity is critical
- Application handles financial, medical, or legal data
- Crash recovery is essential
- Performance is not the primary concern

#### Use Delayed Sync When:
- Maximum performance is required
- Data loss is acceptable (e.g., temporary cache, logs)
- Implementing custom checkpointing logic
- Batch processing large datasets

#### Best Practices:
1. **Always call `close()`** before application exit
2. **Use manual checkpoints** for long-running batch operations
3. **Monitor disk I/O** when using immediate sync in high-throughput scenarios
4. **Test crash scenarios** to verify data recovery expectations
5. **Consider hybrid approaches** - delayed sync for bulk operations, immediate sync for critical updates

## Error Handling

The flushing system handles various error conditions:

```javascript
try {
  await table.create({ id: 1, name: 'John' })
} catch (error) {
  if (error.code === 'ENOSPC') {
    console.error('Disk full - data may not be safely written')
  } else if (error.code === 'EIO') {
    console.error('I/O error - check disk health')
  }
  throw error
}
```

## File System Compatibility

- **Linux/Unix**: Uses `fsync()` system call for reliable syncing
- **Windows**: Uses `FlushFileBuffers()` equivalent
- **macOS**: Uses `fsync()` with additional `F_FULLFSYNC` for better reliability
- **Network filesystems**: Sync behavior depends on mount options

## Migration Guide

If upgrading from a version without configurable sync behavior:

```javascript
// Old code (always safe, potentially slow)
const db = await Database.connect('mydb', './data')

// New code - explicit control
const db = await Database.connect('mydb', './data', { 
  immediateSync: true  // Same behavior as before
})

// Or optimize for performance if acceptable
const db = await Database.connect('mydb', './data', { 
  immediateSync: false  // Faster but requires careful handling
})
```

The default behavior remains the same (immediate sync enabled) to ensure backward compatibility and data safety.