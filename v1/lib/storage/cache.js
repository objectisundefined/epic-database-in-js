/**
 * LRU Cache Implementation for Database Pages
 * 
 * Provides intelligent page caching with automatic eviction to reduce disk I/O
 * and improve query performance.
 */

class LRUCache {
  constructor(maxSize = 100) {
    this.maxSize = maxSize
    this.cache = new Map()
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    }
  }

  get(key) {
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      const value = this.cache.get(key)
      this.cache.delete(key)
      this.cache.set(key, value)
      this.stats.hits++
      return value
    }
    this.stats.misses++
    return null
  }

  set(key, value) {
    if (this.cache.has(key)) {
      // Update existing key
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxSize) {
      // Evict least recently used (first item)
      const firstKey = this.cache.keys().next().value
      this.cache.delete(firstKey)
      this.stats.evictions++
    }
    
    this.cache.set(key, value)
  }

  has(key) {
    return this.cache.has(key)
  }

  delete(key) {
    return this.cache.delete(key)
  }

  clear() {
    this.cache.clear()
    this.stats = { hits: 0, misses: 0, evictions: 0 }
  }

  size() {
    return this.cache.size
  }

  getStats() {
    const total = this.stats.hits + this.stats.misses
    return {
      ...this.stats,
      hitRate: total > 0 ? (this.stats.hits / total * 100).toFixed(2) + '%' : '0%',
      size: this.cache.size,
      maxSize: this.maxSize
    }
  }
}

/**
 * Buffer Pool for Reusing Page Buffers
 * Reduces garbage collection pressure by reusing allocated buffers
 */
class BufferPool {
  constructor(bufferSize, poolSize = 50) {
    this.bufferSize = bufferSize
    this.pool = []
    this.maxPoolSize = poolSize
    this.stats = {
      allocations: 0,
      reuses: 0
    }
    
    // Pre-allocate some buffers
    for (let i = 0; i < Math.min(10, poolSize); i++) {
      this.pool.push(Buffer.alloc(bufferSize))
    }
  }

  get() {
    if (this.pool.length > 0) {
      this.stats.reuses++
      const buffer = this.pool.pop()
      buffer.fill(0) // Clear the buffer
      return buffer
    }
    
    this.stats.allocations++
    return Buffer.alloc(this.bufferSize)
  }

  release(buffer) {
    if (this.pool.length < this.maxPoolSize) {
      this.pool.push(buffer)
    }
  }

  getStats() {
    const total = this.stats.allocations + this.stats.reuses
    return {
      ...this.stats,
      reuseRate: total > 0 ? (this.stats.reuses / total * 100).toFixed(2) + '%' : '0%',
      poolSize: this.pool.length,
      maxPoolSize: this.maxPoolSize
    }
  }
}

module.exports = {
  LRUCache,
  BufferPool
}