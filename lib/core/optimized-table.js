/**
 * Optimized Table Implementation
 * 
 * Uses the optimized B+ tree and storage layer for superior performance.
 * Features include:
 * - Batch operations for better throughput
 * - Intelligent caching and buffer management
 * - Optimized serialization/deserialization
 * - Connection pooling for concurrent access
 */

const path = require('path')
const { OptimizedBPlusTree } = require('../index/optimized-bplus-tree')

class OptimizedTable {
  constructor(name, schema, dbDir = './data', options = {}) {
    this.name = name
    this.schema = schema
    this.dbDir = dbDir
    this.filename = path.join(dbDir, `${name}.db`)
    
    // Performance options
    this.options = {
      cacheSize: 200,
      bufferPoolSize: 100,
      batchSize: 100,
      ...options
    }
    
    this.tree = null
    this.isOpen = false
    this.stats = {
      operations: 0,
      batchOperations: 0,
      cacheHits: 0
    }
  }

  async open() {
    if (this.isOpen) return

    // Ensure directory exists
    const fs = require('fs/promises')
    await fs.mkdir(this.dbDir, { recursive: true })

    const rowSize = this.schema.getRowSize()
    const order = this.calculateOptimalOrder(rowSize)

    this.tree = new OptimizedBPlusTree(
      this.filename,
      rowSize,
      order,
      (record) => this.schema.serialize(record),
      (buffer) => this.schema.deserialize(buffer),
      this.options
    )

    await this.tree.open()
    this.isOpen = true

    console.log(`📋 Optimized table opened: ${this.name}`)
    console.log(`   Schema: ${this.schema.fields.map(f => f.name).join(', ')}`)
    console.log(`   Row Size: ${rowSize} bytes`)
    console.log(`   Optimal Order: ${order}`)
  }

  calculateOptimalOrder(rowSize) {
    // Calculate optimal order based on page size and row size
    // For B+ tree, we want to maximize page utilization while maintaining efficiency
    const pageSize = 4096
    const headerSize = 17 // leaf header size
    const keySize = 4
    const pointerSize = 4
    
    // For leaf nodes: header + (key + value) * order <= pageSize
    const leafOrder = Math.floor((pageSize - headerSize) / (keySize + rowSize))
    
    // For internal nodes: header + (key + pointer) * order <= pageSize
    const internalOrder = Math.floor((pageSize - 10) / (keySize + pointerSize))
    
    // Use the smaller of the two, with a reasonable minimum
    return Math.max(Math.min(leafOrder, internalOrder), 10)
  }

  async create(record) {
    if (!this.isOpen) throw new Error('Table not open')
    
    const id = record.id || this.generateId()
    const recordWithId = { ...record, id }
    
    await this.tree.insert(id, recordWithId)
    this.stats.operations++
    
    return recordWithId
  }

  async createBatch(records) {
    if (!this.isOpen) throw new Error('Table not open')
    
    const recordsWithIds = records.map(record => ({
      ...record,
      id: record.id || this.generateId()
    }))
    
    const batchData = recordsWithIds.map(record => ({
      key: record.id,
      value: record
    }))
    
    await this.tree.insertBatch(batchData)
    this.stats.batchOperations++
    this.stats.operations += records.length
    
    return recordsWithIds
  }

  async findById(id) {
    if (!this.isOpen) throw new Error('Table not open')
    
    try {
      const results = []
      for await (const { value } of this.tree.rangeQuery(id, id, 1)) {
        results.push(value)
      }
      this.stats.operations++
      return results[0] || null
    } catch (error) {
      return null
    }
  }

  async findByIds(ids) {
    if (!this.isOpen) throw new Error('Table not open')
    
    const results = []
    
    // Sort IDs for better performance
    const sortedIds = [...ids].sort((a, b) => a - b)
    
    for (const id of sortedIds) {
      const record = await this.findById(id)
      if (record) results.push(record)
    }
    
    return results
  }

  async findRange(startId, endId, limit = Infinity) {
    if (!this.isOpen) throw new Error('Table not open')
    
    const results = []
    for await (const { value } of this.tree.rangeQuery(startId, endId, limit)) {
      results.push(value)
    }
    
    this.stats.operations++
    return results
  }

  async findAll(limit = Infinity) {
    if (!this.isOpen) throw new Error('Table not open')
    
    const results = []
    for await (const { value } of this.tree.rangeQuery(0, Number.MAX_SAFE_INTEGER, limit)) {
      results.push(value)
    }
    
    this.stats.operations++
    return results
  }

  // Optimized range query with iterator for memory efficiency
  async *findRangeIterator(startId, endId, limit = Infinity) {
    if (!this.isOpen) throw new Error('Table not open')
    
    for await (const { value } of this.tree.rangeQuery(startId, endId, limit)) {
      yield value
    }
    this.stats.operations++
  }

  async update(id, updates) {
    if (!this.isOpen) throw new Error('Table not open')
    
    const existing = await this.findById(id)
    if (!existing) return null
    
    const updated = { ...existing, ...updates, id }
    await this.tree.insert(id, updated)
    this.stats.operations++
    
    return updated
  }

  async updateBatch(updates) {
    if (!this.isOpen) throw new Error('Table not open')
    
    const batchData = []
    
    for (const { id, ...updateData } of updates) {
      const existing = await this.findById(id)
      if (existing) {
        const updated = { ...existing, ...updateData, id }
        batchData.push({ key: id, value: updated })
      }
    }
    
    if (batchData.length > 0) {
      await this.tree.insertBatch(batchData)
      this.stats.batchOperations++
      this.stats.operations += batchData.length
    }
    
    return batchData.map(item => item.value)
  }

  async upsert(record) {
    if (!this.isOpen) throw new Error('Table not open')
    
    const id = record.id || this.generateId()
    const recordWithId = { ...record, id }
    
    await this.tree.insert(id, recordWithId)
    this.stats.operations++
    
    return recordWithId
  }

  async upsertBatch(records) {
    if (!this.isOpen) throw new Error('Table not open')
    
    const recordsWithIds = records.map(record => ({
      ...record,
      id: record.id || this.generateId()
    }))
    
    const batchData = recordsWithIds.map(record => ({
      key: record.id,
      value: record
    }))
    
    await this.tree.insertBatch(batchData)
    this.stats.batchOperations++
    this.stats.operations += records.length
    
    return recordsWithIds
  }

  async count() {
    if (!this.isOpen) throw new Error('Table not open')
    
    let count = 0
    for await (const _ of this.tree.rangeQuery(0, Number.MAX_SAFE_INTEGER)) {
      count++
    }
    
    return count
  }

  generateId() {
    return Date.now() + Math.floor(Math.random() * 1000)
  }

  async close() {
    if (!this.isOpen) return
    
    await this.tree.close()
    this.isOpen = false
    
    console.log(`📋 Optimized table closed: ${this.name}`)
  }

  getInfo() {
    return {
      name: this.name,
      schema: this.schema.getInfo(),
      filename: this.filename,
      isOpen: this.isOpen,
      options: this.options,
      stats: this.getStats()
    }
  }

  getStats() {
    const treeStats = this.tree ? this.tree.getStats() : {}
    
    return {
      ...this.stats,
      tree: treeStats,
      efficiency: {
        cacheHitRate: treeStats.storageStats?.cache?.hitRate || '0%',
        bufferReuseRate: treeStats.storageStats?.bufferPool?.reuseRate || '0%',
        batchOperationRatio: this.stats.batchOperations > 0 
          ? ((this.stats.batchOperations / this.stats.operations) * 100).toFixed(2) + '%'
          : '0%'
      }
    }
  }

  // Performance utilities
  async benchmark(operationType, iterations = 1000) {
    const results = {
      operation: operationType,
      iterations,
      startTime: performance.now(),
      endTime: 0,
      duration: 0,
      operationsPerSecond: 0
    }

    const testData = Array.from({ length: iterations }, (_, i) => ({
      id: i + 1,
      name: `Test${i + 1}`,
      value: Math.random() * 1000,
      data: `test-data-${i + 1}`
    }))

    switch (operationType) {
      case 'insert':
        for (const record of testData) {
          await this.create(record)
        }
        break
        
      case 'batchInsert':
        await this.createBatch(testData)
        break
        
      case 'read':
        // First insert test data
        await this.createBatch(testData)
        results.startTime = performance.now() // Reset timer for read operations
        
        for (let i = 1; i <= iterations; i++) {
          await this.findById(i)
        }
        break
        
      case 'rangeQuery':
        // First insert test data
        await this.createBatch(testData)
        results.startTime = performance.now() // Reset timer for range queries
        
        const rangeSize = Math.floor(iterations / 10)
        for (let i = 0; i < 10; i++) {
          const start = i * rangeSize + 1
          const end = start + rangeSize - 1
          await this.findRange(start, end)
        }
        break
    }

    results.endTime = performance.now()
    results.duration = results.endTime - results.startTime
    results.operationsPerSecond = (iterations / results.duration) * 1000

    return results
  }
}

module.exports = OptimizedTable