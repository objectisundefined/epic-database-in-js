#!/usr/bin/env node

/**
 * Optimized Database Performance Demonstration
 * 
 * This demo showcases the performance improvements achieved through:
 * - LRU page caching
 * - Buffer pooling
 * - Batch operations
 * - Optimized B+ tree algorithms
 * - Compression support
 */

const { Schema, DataTypes } = require('../lib/schema/index')
const OptimizedTable = require('../lib/core/optimized-table')

console.log('╔══════════════════════════════════════════════════════════════════╗')
console.log('║              Optimized B+ Tree Database Demonstration           ║')
console.log('║                                                                  ║')
console.log('║  This demo showcases the enhanced performance optimizations     ║')
console.log('║  including caching, buffer pooling, and batch operations       ║')
console.log('╚══════════════════════════════════════════════════════════════════╝')

async function optimizedDemo() {
  try {
    // Setup schema
    const userSchema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(50),
      email: DataTypes.VARCHAR(100),
      age: DataTypes.UINT8,
      score: DataTypes.FLOAT,
      created_at: DataTypes.INT64,
      data: DataTypes.VARCHAR(200)  // Extra data for better compression demonstration
    })

    console.log('\n📦 Setting up Optimized Database...')
    console.log(`   Schema Row Size: ${userSchema.getRowSize()} bytes`)

    // Create optimized table with performance options
    const table = new OptimizedTable('users_optimized', userSchema, './data', {
      cacheSize: 200,           // 200 pages in cache
      bufferPoolSize: 100,      // 100 buffers in pool
      batchWrites: true,        // Enable batch writes
      immediateSync: false      // Disable immediate sync for performance
    })

    await table.open()

    console.log('✅ Optimized table created successfully')
    console.log(`   Calculated Optimal Order: ${table.calculateOptimalOrder(userSchema.getRowSize())}`)

    // Demonstrate batch insert performance
    console.log('\n🔄 Demonstrating Batch Insert Performance...')
    const batchSize = 2000
    const testData = Array.from({ length: batchSize }, (_, i) => ({
      id: i + 1,
      name: `OptimizedUser${String(i + 1).padStart(5, '0')}`,
      email: `optimized.user${i + 1}@example.com`,
      age: 18 + (i % 50),
      score: Math.random() * 1000,
      created_at: Date.now() - (Math.random() * 365 * 24 * 60 * 60 * 1000),
      data: `This is sample data for user ${i + 1} with some repetitive content to demonstrate compression benefits. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`
    }))

    const batchStartTime = performance.now()
    await table.createBatch(testData)
    const batchEndTime = performance.now()
    const batchDuration = batchEndTime - batchStartTime

    console.log(`✅ Batch inserted ${batchSize} records in ${batchDuration.toFixed(2)}ms`)
    console.log(`   Rate: ${(batchSize / batchDuration * 1000).toFixed(2)} records/second`)
    console.log(`   Average: ${(batchDuration / batchSize).toFixed(3)}ms per record`)

    // Demonstrate optimized point queries
    console.log('\n🔍 Testing Optimized Point Query Performance...')
    const pointQueryCount = 100
    const randomIds = Array.from({ length: pointQueryCount }, () => 
      Math.floor(Math.random() * batchSize) + 1
    )

    const pointStartTime = performance.now()
    const foundRecords = []
    for (const id of randomIds) {
      const record = await table.findById(id)
      if (record) foundRecords.push(record)
    }
    const pointEndTime = performance.now()
    const pointDuration = pointEndTime - pointStartTime

    console.log(`✅ Found ${foundRecords.length}/${pointQueryCount} records in ${pointDuration.toFixed(2)}ms`)
    console.log(`   Rate: ${(pointQueryCount / pointDuration * 1000).toFixed(2)} queries/second`)
    console.log(`   Average: ${(pointDuration / pointQueryCount).toFixed(3)}ms per query`)

    // Demonstrate optimized range queries
    console.log('\n📊 Testing Optimized Range Query Performance...')
    const rangeTests = [
      { start: 1, end: 100, label: 'Small Range (100 records)' },
      { start: 500, end: 1000, label: 'Medium Range (500 records)' },
      { start: 1, end: 1000, label: 'Large Range (1000 records)' }
    ]

    for (const test of rangeTests) {
      const rangeStartTime = performance.now()
      const rangeResults = await table.findRange(test.start, test.end)
      const rangeEndTime = performance.now()
      const rangeDuration = rangeEndTime - rangeStartTime

      console.log(`   🔸 ${test.label}:`)
      console.log(`     ✅ Found ${rangeResults.length} records in ${rangeDuration.toFixed(2)}ms`)
      console.log(`     📈 Rate: ${(rangeResults.length / rangeDuration * 1000).toFixed(2)} records/second`)
    }

    // Demonstrate memory-efficient iterator
    console.log('\n⚡ Testing Memory-Efficient Range Iterator...')
    const iteratorStartTime = performance.now()
    let iteratorCount = 0
    
    for await (const record of table.findRangeIterator(1, 500)) {
      iteratorCount++
      // Process record without storing in memory
    }
    
    const iteratorEndTime = performance.now()
    const iteratorDuration = iteratorEndTime - iteratorStartTime

    console.log(`✅ Processed ${iteratorCount} records with iterator in ${iteratorDuration.toFixed(2)}ms`)
    console.log(`   📈 Rate: ${(iteratorCount / iteratorDuration * 1000).toFixed(2)} records/second`)
    console.log(`   💾 Memory efficient - records not stored in arrays`)

    // Demonstrate batch update performance
    console.log('\n✏️  Testing Batch Update Performance...')
    const updateData = Array.from({ length: 100 }, (_, i) => ({
      id: i + 1,
      score: Math.random() * 1000,
      age: 25 + (i % 40)
    }))

    const updateStartTime = performance.now()
    const updatedRecords = await table.updateBatch(updateData)
    const updateEndTime = performance.now()
    const updateDuration = updateEndTime - updateStartTime

    console.log(`✅ Batch updated ${updatedRecords.length} records in ${updateDuration.toFixed(2)}ms`)
    console.log(`   Rate: ${(updatedRecords.length / updateDuration * 1000).toFixed(2)} updates/second`)

    // Show performance statistics
    console.log('\n📈 Performance Statistics:')
    const stats = table.getStats()
    
    console.log('┌─────────────────────────┬─────────────────────────────────────────┐')
    console.log('│ Metric                  │ Value                                   │')
    console.log('├─────────────────────────┼─────────────────────────────────────────┤')
    console.log(`│ Total Operations        │ ${stats.operations.toString().padStart(39)} │`)
    console.log(`│ Batch Operations        │ ${stats.batchOperations.toString().padStart(39)} │`)
    console.log(`│ Cache Hit Rate          │ ${stats.efficiency.cacheHitRate.padStart(39)} │`)
    console.log(`│ Buffer Reuse Rate       │ ${stats.efficiency.bufferReuseRate.padStart(39)} │`)
    console.log(`│ Batch Operation Ratio   │ ${stats.efficiency.batchOperationRatio.padStart(39)} │`)
    
    if (stats.tree && stats.tree.storageStats) {
      const storageStats = stats.tree.storageStats
      console.log(`│ Pages in Cache          │ ${storageStats.cache.size.toString().padStart(39)} │`)
      console.log(`│ Buffers in Pool         │ ${storageStats.bufferPool.poolSize.toString().padStart(39)} │`)
    }
    
    console.log('└─────────────────────────┴─────────────────────────────────────────┘')

    // Demonstrate built-in benchmarking
    console.log('\n🏁 Running Built-in Performance Benchmarks...')
    
    // Clean table for fresh benchmark
    await table.close()
    
    // Create new table for benchmarks
    const benchTable = new OptimizedTable('benchmark_test', userSchema, './data', {
      cacheSize: 150,
      immediateSync: false
    })
    await benchTable.open()

    const benchmarkResults = {}
    const benchmarkOperations = ['insert', 'batchInsert', 'read', 'rangeQuery']
    
    for (const operation of benchmarkOperations) {
      console.log(`   Running ${operation} benchmark...`)
      const result = await benchTable.benchmark(operation, 1000)
      benchmarkResults[operation] = result
      
      console.log(`   ✅ ${operation}: ${result.operationsPerSecond.toFixed(2)} ops/sec`)
    }

    console.log('\n🎯 Benchmark Summary:')
    console.log('┌──────────────┬─────────────────┬──────────────────┬─────────────────┐')
    console.log('│ Operation    │ Total Time (ms) │ Operations/sec   │ Avg Time (ms)   │')
    console.log('├──────────────┼─────────────────┼──────────────────┼─────────────────┤')
    
    for (const [operation, result] of Object.entries(benchmarkResults)) {
      const op = operation.padEnd(12)
      const duration = result.duration.toFixed(2).padStart(15)
      const opsPerSec = result.operationsPerSecond.toFixed(2).padStart(16)
      const avgTime = (result.duration / result.iterations).toFixed(3).padStart(15)
      
      console.log(`│ ${op} │ ${duration} │ ${opsPerSec} │ ${avgTime} │`)
    }
    console.log('└──────────────┴─────────────────┴──────────────────┴─────────────────┘')

    await benchTable.close()

    console.log('\n🌟 Key Optimization Features Demonstrated:')
    console.log('   ✅ LRU Page Caching - Reduces disk I/O significantly')
    console.log('   ✅ Buffer Pool - Reduces garbage collection pressure')
    console.log('   ✅ Batch Operations - Dramatically improves throughput')
    console.log('   ✅ Pre-calculated Offsets - Faster serialization/deserialization')
    console.log('   ✅ Optimized Tree Traversal - Better search performance')
    console.log('   ✅ Memory-Efficient Iterators - Process large datasets without memory bloat')
    console.log('   ✅ Performance Monitoring - Built-in statistics and benchmarking')
    console.log('   ✅ Async I/O Optimization - Non-blocking operations with scheduled syncing')

    console.log('\n✅ Optimized database demonstration completed successfully!')

    console.log('\n💡 Next Steps:')
    console.log('   • Run the full benchmark suite: npm run benchmark:compare')
    console.log('   • Try with larger datasets to see scaling benefits')
    console.log('   • Experiment with different cache sizes and options')
    console.log('   • Enable compression for storage-intensive workloads')

  } catch (error) {
    console.error('❌ Demo failed:', error)
    throw error
  }
}

// Export for use in other modules
module.exports = { optimizedDemo }

// Run demo if called directly
if (require.main === module) {
  optimizedDemo().catch(console.error)
}