/**
 * Basic Socket Database Example
 * 
 * Demonstrates basic usage of the socket-based database client/server.
 */

const { DatabaseServer, DatabaseClient, Schema, DataTypes } = require('../lib/index')

async function runExample() {
  console.log('🚀 Socket Database Example - Basic Operations')
  console.log('=' * 50)
  
  // 1. Start the database server
  console.log('\n📡 Starting database server...')
  const server = new DatabaseServer({
    port: 3307, // Use different port for example
    host: 'localhost',
    maxConnections: 10
  })
  
  await server.start()
  console.log('✅ Server started on port 3307')
  
  // 2. Create client and connect
  console.log('\n🔌 Connecting client...')
  const client = new DatabaseClient({
    port: 3307,
    host: 'localhost'
  })
  
  await client.connect()
  console.log('✅ Client connected')
  
  try {
    // 3. Connect to database
    console.log('\n📦 Connecting to database "example_db"...')
    const db = await client.useDatabase('example_db')
    console.log('✅ Connected to database')
    
    // 4. Create a table schema
    console.log('\n📋 Creating user table...')
    const userSchema = {
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(100),
      email: DataTypes.VARCHAR(150),
      age: DataTypes.UINT8,
      created_at: DataTypes.INT64
    }
    
    await db.createTable('users', userSchema)
    console.log('✅ Table created')
    
    // 5. Get table reference
    const usersTable = db.table('users')
    
    // 6. Insert some users
    console.log('\n➕ Inserting users...')
    const users = [
      { id: 1, name: 'Alice Smith', email: 'alice@example.com', age: 28, created_at: Date.now() },
      { id: 2, name: 'Bob Johnson', email: 'bob@example.com', age: 34, created_at: Date.now() },
      { id: 3, name: 'Charlie Brown', email: 'charlie@example.com', age: 22, created_at: Date.now() },
      { id: 4, name: 'Diana Prince', email: 'diana@example.com', age: 31, created_at: Date.now() },
      { id: 5, name: 'Eve Wilson', email: 'eve@example.com', age: 26, created_at: Date.now() }
    ]
    
    for (const user of users) {
      await usersTable.insert(user)
      console.log(`   ✓ Inserted user: ${user.name}`)
    }
    
    // 7. Query users
    console.log('\n🔍 Querying users...')
    
    // Find all users
    const allUsers = await usersTable.find()
    console.log(`   📊 Total users: ${allUsers.length}`)
    
    // Find specific user
    const alice = await usersTable.find({ name: 'Alice Smith' })
    console.log(`   👤 Found Alice: ${JSON.stringify(alice[0], null, 2)}`)
    
    // Count users
    const userCount = await usersTable.count()
    console.log(`   📈 User count: ${userCount}`)
    
    // 8. Range query (B+ tree advantage)
    console.log('\n📊 Range query (ages 25-30)...')
    const youngUsers = await usersTable.range('age', 25, 30)
    console.log(`   🎯 Users aged 25-30: ${youngUsers.length}`)
    youngUsers.forEach(user => {
      console.log(`      - ${user.name} (${user.age})`)
    })
    
    // 9. Update users
    console.log('\n✏️  Updating users...')
    await usersTable.update({ name: 'Bob Johnson' }, { age: 35 })
    console.log('   ✓ Updated Bob\'s age')
    
    // 10. Delete a user
    console.log('\n🗑️  Deleting user...')
    await usersTable.delete({ name: 'Eve Wilson' })
    console.log('   ✓ Deleted Eve Wilson')
    
    // 11. Final count
    const finalCount = await usersTable.count()
    console.log(`\n📊 Final user count: ${finalCount}`)
    
  } catch (error) {
    console.error('❌ Error:', error.message)
  }
  
  // 12. Clean up
  console.log('\n🧹 Cleaning up...')
  await client.disconnect()
  await server.stop()
  console.log('✅ Example completed successfully!')
}

// Run the example
if (require.main === module) {
  runExample().catch(console.error)
}

module.exports = { runExample }