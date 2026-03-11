/**
 * Socket Database Authentication Example
 * 
 * Demonstrates authentication and secure connections with the socket database.
 */

const { DatabaseServer, DatabaseClient, Schema, DataTypes } = require('../lib/index')

async function runAuthExample() {
  console.log('🔐 Socket Database Example - Authentication')
  console.log('=' * 50)
  
  // 1. Start server with authentication enabled
  console.log('\n📡 Starting secure database server...')
  const server = new DatabaseServer({
    port: 3308, // Different port for auth example
    host: 'localhost',
    requireAuth: true,
    maxConnections: 5
  })
  
  // Add some users
  server.addUser('admin', 'secure_password_123')
  server.addUser('user1', 'user_password_456')
  server.addUser('readonly', 'readonly_pass_789')
  
  await server.start()
  console.log('✅ Secure server started on port 3308')
  console.log('   👥 Users: admin, user1, readonly')
  
  // 2. Test authentication failure
  console.log('\n❌ Testing authentication failure...')
  const badClient = new DatabaseClient({
    port: 3308,
    host: 'localhost'
  })
  
  try {
    await badClient.connect()
    
    // Try to use database without authentication
    await badClient.useDatabase('test_db')
    console.log('❌ This should not happen - unauthenticated access allowed!')
  } catch (error) {
    console.log(`   ✅ Correctly rejected: ${error.message}`)
  }
  
  // 3. Test successful authentication
  console.log('\n✅ Testing successful authentication...')
  const client = new DatabaseClient({
    port: 3308,
    host: 'localhost'
  })
  
  await client.connect()
  console.log('   🔌 Connected to server')
  
  // Authenticate as admin
  await client.authenticate('admin', 'secure_password_123')
  console.log('   🔐 Authenticated as admin')
  
  try {
    // 4. Use database after authentication
    console.log('\n📦 Creating secure database...')
    const db = await client.useDatabase('secure_db')
    
    // Create a secure table for sensitive data
    const sensitiveSchema = {
      id: DataTypes.UINT32,
      username: DataTypes.VARCHAR(50),
      email: DataTypes.VARCHAR(100),
      access_level: DataTypes.VARCHAR(20),
      last_login: DataTypes.INT64,
      created_at: DataTypes.INT64
    }
    
    await db.createTable('user_accounts', sensitiveSchema)
    console.log('✅ Created secure user_accounts table')
    
    // 5. Insert sensitive data
    console.log('\n🔒 Storing sensitive user data...')
    const accounts = db.table('user_accounts')
    
    const userData = [
      { 
        id: 1, 
        username: 'admin_user', 
        email: 'admin@company.com', 
        access_level: 'administrator',
        last_login: Date.now() - 3600000, // 1 hour ago
        created_at: Date.now() - 86400000 // 1 day ago
      },
      { 
        id: 2, 
        username: 'manager_1', 
        email: 'manager@company.com', 
        access_level: 'manager',
        last_login: Date.now() - 1800000, // 30 minutes ago
        created_at: Date.now() - 172800000 // 2 days ago
      },
      { 
        id: 3, 
        username: 'employee_1', 
        email: 'employee@company.com', 
        access_level: 'employee',
        last_login: Date.now() - 7200000, // 2 hours ago
        created_at: Date.now() - 259200000 // 3 days ago
      }
    ]
    
    for (const account of userData) {
      await accounts.insert(account)
      console.log(`   ✓ Added account: ${account.username} (${account.access_level})`)
    }
    
    // 6. Query secure data
    console.log('\n🔍 Querying secure data...')
    
    // Find admin accounts
    const admins = await accounts.find({ access_level: 'administrator' })
    console.log(`   👑 Admin accounts: ${admins.length}`)
    
    // Find recent logins (last 2 hours)
    const recentLoginTime = Date.now() - 7200000
    const recentLogins = await accounts.range('last_login', recentLoginTime, Date.now())
    console.log(`   ⏱️  Recent logins: ${recentLogins.length}`)
    
    // Count accounts by access level
    const managerCount = await accounts.count({ access_level: 'manager' })
    const employeeCount = await accounts.count({ access_level: 'employee' })
    console.log(`   📊 Managers: ${managerCount}, Employees: ${employeeCount}`)
    
    // 7. Demonstrate session tracking
    console.log('\n📈 Server statistics:')
    const stats = server.getStats()
    console.log(`   🔗 Active connections: ${stats.connectedClients}`)
    console.log(`   🔑 Active sessions: ${stats.activeSessions}`)
    console.log(`   💾 Databases: ${stats.databases.join(', ')}`)
    
  } catch (error) {
    console.error('❌ Error during secure operations:', error.message)
  }
  
  // 8. Test second client with different user
  console.log('\n👤 Testing second user connection...')
  const client2 = new DatabaseClient({
    port: 3308,
    host: 'localhost'
  })
  
  try {
    await client2.connect()
    await client2.authenticate('user1', 'user_password_456')
    console.log('   ✅ Second user authenticated successfully')
    
    // Try to access the same database
    const db2 = await client2.useDatabase('secure_db')
    const tables = await db2.listTables()
    console.log(`   📋 Can see tables: ${tables.join(', ')}`)
    
  } catch (error) {
    console.error('   ❌ Second user error:', error.message)
  }
  
  // 9. Clean up
  console.log('\n🧹 Cleaning up...')
  await client.disconnect()
  await client2.disconnect()
  await badClient.disconnect()
  await server.stop()
  console.log('✅ Secure example completed successfully!')
}

// Run the example
if (require.main === module) {
  runAuthExample().catch(console.error)
}

module.exports = { runAuthExample }