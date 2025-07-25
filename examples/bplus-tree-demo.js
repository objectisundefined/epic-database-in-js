const { Database, DataTypes, Schema } = require('../src/table-bplus')

async function bPlusTreeDemo() {
  console.log('╔══════════════════════════════════════════════════════════════════╗')
  console.log('║                    B+ Tree Database Demonstration                ║')
  console.log('║                                                                  ║')
  console.log('║  This demo showcases the enhanced performance of B+ Tree         ║')
  console.log('║  indexing, especially for range queries and sequential access    ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝')
  console.log()

  try {
    // Connect to database
    console.log('📦 Setting up B+ Tree database...')
    const db = await Database.connect('bplus_demo', './data')
    
    // Create schema for user data
    const userSchema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(50),
      email: DataTypes.VARCHAR(100),
      age: DataTypes.UINT32,
      created_at: DataTypes.INT64,
      score: DataTypes.DOUBLE
    })

    console.log('✅ Database connected successfully')
    console.log(`   Index Type: B+ Tree`)
    console.log(`   Schema Row Size: ${userSchema.getRowSize()} bytes`)
    
    // Create table
    const usersTable = await db.createTable('users', userSchema)
    console.log('✅ Users table created with B+ Tree indexing')
    
    const tableInfo = usersTable.getInfo()
    console.log(`   Max Leaf Size: ${tableInfo.maxLeafSize} records per leaf`)
    console.log(`   Max Internal Size: ${tableInfo.maxInternalSize} keys per internal node`)
    console.log()

    // Demonstrate insertions
    console.log('🔄 Inserting sample data...')
    const users = []
    const insertStartTime = performance.now()
    
    for (let i = 1; i <= 100; i++) {
      const user = {
        id: i,
        name: `User${i.toString().padStart(3, '0')}`,
        email: `user${i}@example.com`,
        age: 18 + (i % 50), // Ages from 18 to 67
        created_at: Date.now() + i * 1000,
        score: Math.round((Math.random() * 100) * 100) / 100 // Random score 0-100
      }
      
      await usersTable.create(user)
      users.push(user)
      
      if (i % 20 === 0) {
        console.log(`   Progress: ${i}/100 users inserted`)
      }
    }
    
    const insertEndTime = performance.now()
    console.log(`✅ Inserted 100 users in ${(insertEndTime - insertStartTime).toFixed(2)}ms`)
    console.log(`   Average: ${((insertEndTime - insertStartTime) / 100).toFixed(2)}ms per insert`)
    console.log()

    // Show tree structure
    console.log('🌳 B+ Tree Structure:')
    await usersTable.showStructure()
    console.log()

    // Demonstrate point queries
    console.log('🔍 Point Query Performance (B+ Tree strength):')
    const pointQueryStart = performance.now()
    
    const user50 = await usersTable.read({ key: 50 })
    const user25 = await usersTable.read({ key: 25 })
    const user75 = await usersTable.read({ key: 75 })
    
    const pointQueryEnd = performance.now()
    console.log(`✅ Found 3 specific users in ${(pointQueryEnd - pointQueryStart).toFixed(2)}ms`)
    console.log(`   User 50: ${user50[0].name} (${user50[0].email})`)
    console.log()

    // Demonstrate range queries - B+ Tree's major strength
    console.log('📊 Range Query Performance (B+ Tree advantage):')
    
    // Range 1: Small range
    console.log('   🔸 Range Query 1: Users with IDs 10-20')
    const range1Start = performance.now()
    const range1Results = await usersTable.read({
      where: { gte: 10, lte: 20 }
    })
    const range1End = performance.now()
    console.log(`     ✅ Found ${range1Results.length} users in ${(range1End - range1Start).toFixed(2)}ms`)
    console.log(`     📋 Users: ${range1Results.map(u => u.name).join(', ')}`)
    
    // Range 2: Medium range
    console.log('   🔸 Range Query 2: Users with IDs 30-60')
    const range2Start = performance.now()
    const range2Results = await usersTable.read({
      where: { gte: 30, lte: 60 }
    })
    const range2End = performance.now()
    console.log(`     ✅ Found ${range2Results.length} users in ${(range2End - range2Start).toFixed(2)}ms`)
    console.log(`     📊 B+ Tree traversed linked leaves efficiently`)
    
    // Range 3: Large range with limit
    console.log('   🔸 Range Query 3: Users with IDs 1-100 (limit 10)')
    const range3Start = performance.now()
    const range3Results = await usersTable.read({
      where: { gte: 1, lte: 100 },
      limit: 10
    })
    const range3End = performance.now()
    console.log(`     ✅ Found ${range3Results.length} users in ${(range3End - range3Start).toFixed(2)}ms`)
    console.log(`     📋 First 10: ${range3Results.map(u => u.name).join(', ')}`)
    console.log()

    // Demonstrate sequential access - B+ Tree excels here
    console.log('⚡ Sequential Access Performance:')
    const seqStart = performance.now()
    const allUsers = await usersTable.read()
    const seqEnd = performance.now()
    console.log(`✅ Retrieved all ${allUsers.length} users sequentially in ${(seqEnd - seqStart).toFixed(2)}ms`)
    console.log(`   🎯 B+ Tree linked leaves enable efficient full table scans`)
    console.log(`   📈 Average: ${((seqEnd - seqStart) / allUsers.length).toFixed(3)}ms per record`)
    console.log()

    // Demonstrate updates
    console.log('✏️  Update Performance:')
    const updateStart = performance.now()
    
    await usersTable.update(25, { 
      name: 'UpdatedUser025',
      score: 95.5 
    })
    await usersTable.update(50, { 
      age: 30,
      score: 87.3 
    })
    await usersTable.update(75, { 
      email: 'premium75@example.com',
      score: 99.9 
    })
    
    const updateEnd = performance.now()
    console.log(`✅ Updated 3 users in ${(updateEnd - updateStart).toFixed(2)}ms`)
    console.log(`   🔄 B+ Tree maintains sorted order after updates`)
    console.log()

    // Demonstrate complex range queries with conditions
    console.log('🎯 Advanced Range Queries:')
    
    // Young users in a range
    console.log('   🔸 Complex Query: Users 40-80 with age < 30')
    const complexStart = performance.now()
    const complexResults = await usersTable.read({
      where: { gte: 40, lte: 80 },
      // Note: Additional filtering would be done in post-processing
    })
    const youngUsers = complexResults.filter(u => u.age < 30)
    const complexEnd = performance.now()
    console.log(`     ✅ Found ${youngUsers.length} young users in range in ${(complexEnd - complexStart).toFixed(2)}ms`)
    
    console.log()

    // Performance comparison benchmark
    console.log('🏁 Performance Benchmark Summary:')
    console.log('┌─────────────────────┬──────────────┬─────────────────────┐')
    console.log('│ Operation           │ Time (ms)    │ Records/ms          │')
    console.log('├─────────────────────┼──────────────┼─────────────────────┤')
    console.log(`│ 100 Inserts         │ ${(insertEndTime - insertStartTime).toFixed(2).padStart(12)} │ ${(100 / (insertEndTime - insertStartTime)).toFixed(2).padStart(19)} │`)
    console.log(`│ Point Queries (3)    │ ${(pointQueryEnd - pointQueryStart).toFixed(2).padStart(12)} │ ${(3 / (pointQueryEnd - pointQueryStart)).toFixed(2).padStart(19)} │`)
    console.log(`│ Range Query (11)     │ ${(range1End - range1Start).toFixed(2).padStart(12)} │ ${(11 / (range1End - range1Start)).toFixed(2).padStart(19)} │`)
    console.log(`│ Range Query (31)     │ ${(range2End - range2Start).toFixed(2).padStart(12)} │ ${(31 / (range2End - range2Start)).toFixed(2).padStart(19)} │`)
    console.log(`│ Sequential (100)     │ ${(seqEnd - seqStart).toFixed(2).padStart(12)} │ ${(100 / (seqEnd - seqStart)).toFixed(2).padStart(19)} │`)
    console.log(`│ Updates (3)          │ ${(updateEnd - updateStart).toFixed(2).padStart(12)} │ ${(3 / (updateEnd - updateStart)).toFixed(2).padStart(19)} │`)
    console.log('└─────────────────────┴──────────────┴─────────────────────┘')
    console.log()

    // B+ Tree advantages summary
    console.log('🌟 B+ Tree Key Advantages Demonstrated:')
    console.log('   ✅ Efficient range queries through linked leaf traversal')
    console.log('   ✅ Superior sequential access performance')
    console.log('   ✅ Better cache locality with internal nodes containing only keys')
    console.log('   ✅ Consistent performance for both point and range queries')
    console.log('   ✅ Optimal for analytical workloads requiring range scans')
    console.log('   ✅ Bidirectional leaf traversal capability')
    console.log()

    // Demonstrate delete operations
    console.log('🗑️  Delete Performance:')
    const deleteStart = performance.now()
    
    await usersTable.delete(10)
    await usersTable.delete(30)
    await usersTable.delete(90)
    
    const deleteEnd = performance.now()
    console.log(`✅ Deleted 3 users in ${(deleteEnd - deleteStart).toFixed(2)}ms`)
    
    const finalCount = await usersTable.count()
    console.log(`📊 Final record count: ${finalCount} users`)
    console.log()

    // Cleanup
    await db.close()
    console.log('✅ Database connection closed')
    console.log()
    console.log('🎉 B+ Tree demonstration completed successfully!')
    console.log()
    console.log('💡 Next Steps:')
    console.log('   • Try the interactive REPL: node src/bplus-repl.js')
    console.log('   • Compare with B-tree: node src/table-repl.js')
    console.log('   • Run large-scale benchmarks with more data')
    console.log('   • Explore complex query patterns')

  } catch (error) {
    console.error('❌ Demo failed:', error.message)
    console.error(error.stack)
  }
}

// Range query comparison function
async function compareRangeQueryPerformance() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗')
  console.log('║                Range Query Performance Analysis                  ║')
  console.log('╚══════════════════════════════════════════════════════════════════╝')
  
  const db = await Database.connect('range_test', './data')
  const schema = new Schema({
    id: DataTypes.UINT32,
    value: DataTypes.VARCHAR(50)
  })
  
  const table = await db.createTable('range_test', schema)
  
  // Insert 1000 records
  console.log('📊 Inserting 1000 records for range query testing...')
  for (let i = 1; i <= 1000; i++) {
    await table.create({
      id: i,
      value: `Value_${i.toString().padStart(4, '0')}`
    })
    
    if (i % 100 === 0) {
      console.log(`   Progress: ${i}/1000`)
    }
  }
  
  // Test various range sizes
  const rangeSizes = [10, 50, 100, 250, 500]
  
  console.log('\n🔍 Range Query Performance Results:')
  console.log('┌─────────────┬──────────────┬─────────────────┐')
  console.log('│ Range Size  │ Time (ms)    │ Records/ms      │')
  console.log('├─────────────┼──────────────┼─────────────────┤')
  
  for (const rangeSize of rangeSizes) {
    const start = Math.floor(Math.random() * (1000 - rangeSize))
    const end = start + rangeSize
    
    const startTime = performance.now()
    const results = await table.read({
      where: { gte: start, lte: end }
    })
    const endTime = performance.now()
    
    const timeTaken = endTime - startTime
    const recordsPerMs = results.length / timeTaken
    
    console.log(`│ ${rangeSize.toString().padStart(11)} │ ${timeTaken.toFixed(2).padStart(12)} │ ${recordsPerMs.toFixed(2).padStart(15)} │`)
  }
  
  console.log('└─────────────┴──────────────┴─────────────────┘')
  console.log('\n💡 B+ Tree range queries scale efficiently with range size!')
  
  await db.close()
}

// Run the demo
if (require.main === module) {
  bPlusTreeDemo()
    .then(() => compareRangeQueryPerformance())
    .catch(console.error)
}

module.exports = { bPlusTreeDemo, compareRangeQueryPerformance }