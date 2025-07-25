const { Database, Schema, DataTypes } = require('../src/table')

async function demonstrateFlushingBehavior() {
  console.log('=== File Flushing Demo ===\n')
  
  // Test with immediate sync enabled (default - safer)
  console.log('1. Testing with immediate sync ENABLED (safer, prevents data loss):')
  const safeDb = await Database.connect('flush_demo_safe', './data', { 
    immediateSync: true 
  })
  
  // Create a table
  const userSchema = new Schema({
    id: DataTypes.INT32,
    name: DataTypes.VARCHAR(50),
    email: DataTypes.VARCHAR(100)
  })
  
  const safeTable = await safeDb.createTable('users', userSchema)
  
  console.log('   - Creating records with immediate flush...')
  const startTime = Date.now()
  
  for (let i = 1; i <= 10; i++) {
    await safeTable.create({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`
    })
    // Each write is immediately synced to disk
  }
  
  const safeTime = Date.now() - startTime
  console.log(`   - Inserted 10 records in ${safeTime}ms (with immediate sync)`)
  console.log('   - Data is immediately written to disk, preventing data loss on crashes\n')
  
  await safeDb.close()
  
  // Test with immediate sync disabled (faster but riskier)
  console.log('2. Testing with immediate sync DISABLED (faster but riskier):')
  const fastDb = await Database.connect('flush_demo_fast', './data', { 
    immediateSync: false 
  })
  
  const fastTable = await fastDb.createTable('users', userSchema)
  
  console.log('   - Creating records with delayed flush...')
  const startTime2 = Date.now()
  
  for (let i = 1; i <= 10; i++) {
    await fastTable.create({
      id: i,
      name: `User ${i}`,
      email: `user${i}@example.com`
    })
    // Writes are buffered, sync happens on close or explicit flush
  }
  
  const fastTime = Date.now() - startTime2
  console.log(`   - Inserted 10 records in ${fastTime}ms (without immediate sync)`)
  console.log('   - Data is buffered in memory, faster but risk of data loss on crashes')
  console.log('   - Manual flush or close() ensures data is written to disk\n')
  
  await fastDb.close()
  
  console.log('3. Performance comparison:')
  console.log(`   - With immediate sync: ${safeTime}ms`)
  console.log(`   - Without immediate sync: ${fastTime}ms`)
  console.log(`   - Performance difference: ${((safeTime - fastTime) / fastTime * 100).toFixed(1)}%`)
  
  console.log('\n=== Recommendations ===')
  console.log('• Use immediateSync: true (default) for critical data')
  console.log('• Use immediateSync: false for high-performance scenarios')
  console.log('• Always call close() or flush() before application exit')
  console.log('• Consider your trade-off between performance and data safety')
}

async function demonstrateManualFlushing() {
  console.log('\n=== Manual Flushing Demo ===')
  
  const db = await Database.connect('manual_flush_demo', './data', { 
    immediateSync: false 
  })
  
  const schema = new Schema({
    id: DataTypes.INT32,
    message: DataTypes.VARCHAR(100)
  })
  
  const table = await db.createTable('messages', schema)
  
  console.log('1. Adding records without immediate sync...')
  await table.create({ id: 1, message: 'This is buffered in memory' })
  await table.create({ id: 2, message: 'This is also buffered' })
  
  console.log('2. Manually flushing to ensure data safety...')
  // Force immediate write to disk
  await table.pager.flush()
  console.log('   - Data is now safely written to disk')
  
  console.log('3. Adding more records...')
  await table.create({ id: 3, message: 'Another buffered record' })
  
  console.log('4. Closing database (auto-flushes remaining data)...')
  await db.close()
  console.log('   - All data flushed on close')
}

async function runDemo() {
  try {
    await demonstrateFlushingBehavior()
    await demonstrateManualFlushing()
    
    console.log('\n✅ Flush demo completed successfully!')
    console.log('Check the ./data directory for the created database files.')
    
  } catch (error) {
    console.error('❌ Demo failed:', error.message)
    process.exit(1)
  }
}

// Run the demo
if (require.main === module) {
  runDemo()
}

module.exports = { demonstrateFlushingBehavior, demonstrateManualFlushing }