const { Database, Table, DataTypes, Schema, DefaultSchemas } = require('../src/table')

// Example demonstrating table CRUD operations
async function demonstrateTableCRUD() {
  console.log('=== Table CRUD Operations Demo ===\n')

  // Create a database
  const db = await Database.connect('example_db')

  try {
    // Create tables with different schemas
    console.log('1. Creating tables...')
    
    // Users table
    const userSchema = new Schema({
      id: DataTypes.UINT32,
      username: DataTypes.VARCHAR(50),
      email: DataTypes.VARCHAR(100),
      age: DataTypes.UINT32,
      is_active: DataTypes.BOOLEAN,
      created_at: DataTypes.INT64
    })
    
    const usersTable = await db.createTable('users', userSchema)
    console.log('✓ Created users table')

    // Products table  
    const productSchema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(100),
      price: DataTypes.DOUBLE,
      category: DataTypes.VARCHAR(50),
      in_stock: DataTypes.BOOLEAN,
      metadata: DataTypes.JSON(200)
    })
    
    const productsTable = await db.createTable('products', productSchema)
    console.log('✓ Created products table')

    // Orders table
    const orderSchema = new Schema({
      id: DataTypes.UINT32,
      user_id: DataTypes.UINT32,
      product_id: DataTypes.UINT32,
      quantity: DataTypes.UINT32,
      total_price: DataTypes.DOUBLE,
      order_date: DataTypes.INT64,
      status: DataTypes.VARCHAR(20)
    })
    
    const ordersTable = await db.createTable('orders', orderSchema)
    console.log('✓ Created orders table\n')

    // 2. INSERT operations
    console.log('2. Inserting data...')
    
    // Insert users
    const users = [
      { id: 1, username: 'alice', email: 'alice@example.com', age: 25, is_active: true, created_at: Date.now() },
      { id: 2, username: 'bob', email: 'bob@example.com', age: 30, is_active: true, created_at: Date.now() },
      { id: 3, username: 'charlie', email: 'charlie@example.com', age: 28, is_active: false, created_at: Date.now() }
    ]
    
    for (const user of users) {
      await usersTable.create(user)
      console.log(`✓ Created user: ${user.username}`)
    }

    // Insert products
    const products = [
      { id: 101, name: 'Laptop', price: 999.99, category: 'Electronics', in_stock: true, metadata: { brand: 'TechCorp', warranty: '2 years' } },
      { id: 102, name: 'Coffee Mug', price: 12.99, category: 'Kitchen', in_stock: true, metadata: { material: 'ceramic', color: 'blue' } },
      { id: 103, name: 'Book', price: 24.99, category: 'Books', in_stock: false, metadata: { author: 'John Doe', pages: 350 } }
    ]
    
    for (const product of products) {
      await productsTable.create(product)
      console.log(`✓ Created product: ${product.name}`)
    }

    // Insert orders
    const orders = [
      { id: 1001, user_id: 1, product_id: 101, quantity: 1, total_price: 999.99, order_date: Date.now(), status: 'shipped' },
      { id: 1002, user_id: 2, product_id: 102, quantity: 2, total_price: 25.98, order_date: Date.now(), status: 'pending' },
      { id: 1003, user_id: 1, product_id: 103, quantity: 1, total_price: 24.99, order_date: Date.now(), status: 'cancelled' }
    ]
    
    for (const order of orders) {
      await ordersTable.create(order)
      console.log(`✓ Created order: ${order.id}`)
    }

    console.log('')

    // 3. READ operations
    console.log('3. Reading data...')
    
    // Read all users
    const allUsers = await usersTable.read()
    console.log(`✓ Found ${allUsers.length} users:`)
    allUsers.forEach(user => console.log(`  - ${user.data.username} (${user.data.email})`))

    // Read specific user
    const user1 = await usersTable.read({ key: 1 })
    console.log(`✓ User with ID 1: ${user1[0]?.data.username}`)

    // Read with conditions
    const activeUsers = await usersTable.read({ where: { is_active: true } })
    console.log(`✓ Found ${activeUsers.length} active users`)

    // Read products with limit
    const limitedProducts = await productsTable.read({ limit: 2 })
    console.log(`✓ First 2 products:`)
    limitedProducts.forEach(product => console.log(`  - ${product.data.name}: $${product.data.price}`))

    console.log('')

    // 4. UPDATE operations
    console.log('4. Updating data...')
    
    // Update user
    await usersTable.update(2, { age: 31, email: 'bob.updated@example.com' })
    console.log('✓ Updated user 2')

    // Update product
    await productsTable.update(102, { price: 15.99, in_stock: false })
    console.log('✓ Updated product 102')

    // Update order status
    await ordersTable.update(1002, { status: 'shipped' })
    console.log('✓ Updated order 1002')

    console.log('')

    // 5. Verify updates
    console.log('5. Verifying updates...')
    
    const updatedUser = await usersTable.read({ key: 2 })
    console.log(`✓ User 2 age is now: ${updatedUser[0].data.age}`)

    const updatedProduct = await productsTable.read({ key: 102 })
    console.log(`✓ Product 102 price is now: $${updatedProduct[0].data.price}`)

    console.log('')

    // 6. DELETE operations
    console.log('6. Deleting data...')
    
    // Delete a user
    await usersTable.delete(3)
    console.log('✓ Deleted user 3')

    // Delete a product
    await productsTable.delete(103)
    console.log('✓ Deleted product 103')

    // Verify deletions
    const remainingUsers = await usersTable.read()
    console.log(`✓ Remaining users: ${remainingUsers.length}`)

    const remainingProducts = await productsTable.read()
    console.log(`✓ Remaining products: ${remainingProducts.length}`)

    console.log('')

    // 7. Table information
    console.log('7. Table information...')
    
    console.log('Users table info:', usersTable.getInfo())
    console.log('Products table info:', productsTable.getInfo())
    console.log('Database info:', db.getInfo())

    console.log('')

    // 8. Show table structures
    console.log('8. Table structures...')
    await usersTable.showStructure()
    await productsTable.showStructure()
    await ordersTable.showStructure()

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    // Clean up
    await db.close()
    console.log('\n✓ Database closed')
  }
}

// Example using predefined schemas
async function demonstratePredefinedSchemas() {
  console.log('\n=== Predefined Schemas Demo ===\n')

  const db = await Database.connect('predefined_db')

  try {
    // Create tables using predefined schemas
    const usersTable = await db.createTable('users', DefaultSchemas.User)
    const productsTable = await db.createTable('products', DefaultSchemas.Product)
    const eventsTable = await db.createTable('events', DefaultSchemas.Event)

    console.log('✓ Created tables with predefined schemas')

    // Insert sample data
    await usersTable.create({ id: 1, username: 'john_doe', email: 'john@example.com' })
    await productsTable.create({ 
      id: 1, 
      name: 'Sample Product', 
      price: 49.99, 
      category_id: 1, 
      in_stock: true, 
      description: 'A sample product' 
    })
    await eventsTable.create({
      id: 1,
      user_id: 1,
      event_type: 'page_view',
      timestamp: Date.now(),
      properties: { page: '/home', duration: 5000 }
    })

    console.log('✓ Inserted sample data')

    // Show counts
    console.log(`Users: ${await usersTable.count()}`)
    console.log(`Products: ${await productsTable.count()}`)
    console.log(`Events: ${await eventsTable.count()}`)

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await db.close()
  }
}

// Performance test
async function performanceTest() {
  console.log('\n=== Performance Test ===\n')

  const db = await Database.connect('perf_test_db')

  try {
    const schema = new Schema({
      id: DataTypes.UINT32,
      name: DataTypes.VARCHAR(50),
      value: DataTypes.DOUBLE,
      timestamp: DataTypes.INT64
    })

    const table = await db.createTable('perf_test', schema)
    
    const startTime = Date.now()
    const recordCount = 1000

    // Insert many records
    console.log(`Inserting ${recordCount} records...`)
    for (let i = 1; i <= recordCount; i++) {
      await table.create({
        id: i,
        name: `Record ${i}`,
        value: Math.random() * 100,
        timestamp: Date.now()
      })
      
      if (i % 100 === 0) {
        console.log(`  Inserted ${i} records...`)
      }
    }

    const insertTime = Date.now() - startTime
    console.log(`✓ Inserted ${recordCount} records in ${insertTime}ms`)
    console.log(`  Average: ${(insertTime / recordCount).toFixed(2)}ms per insert`)

    // Read performance
    const readStart = Date.now()
    const allRecords = await table.read({ limit: recordCount })
    const readTime = Date.now() - readStart
    
    console.log(`✓ Read ${allRecords.length} records in ${readTime}ms`)
    console.log(`  Average: ${(readTime / allRecords.length).toFixed(2)}ms per read`)

    // Update performance
    const updateStart = Date.now()
    for (let i = 1; i <= 100; i++) {
      await table.update(i, { value: Math.random() * 200 })
    }
    const updateTime = Date.now() - updateStart
    
    console.log(`✓ Updated 100 records in ${updateTime}ms`)
    console.log(`  Average: ${updateTime / 100}ms per update`)

  } catch (error) {
    console.error('Error:', error.message)
  } finally {
    await db.close()
  }
}

// Run all examples
async function runAllExamples() {
  await demonstrateTableCRUD()
  await demonstratePredefinedSchemas()
  await performanceTest()
}

// Export for use in other modules
module.exports = {
  demonstrateTableCRUD,
  demonstratePredefinedSchemas,
  performanceTest,
  runAllExamples
}

// Run if this file is executed directly
if (require.main === module) {
  runAllExamples().catch(console.error)
}