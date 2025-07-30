/**
 * Optimized Storage Layer
 * 
 * Enhanced storage interface with:
 * - LRU page caching
 * - Buffer pooling for reduced GC pressure
 * - Batch I/O operations
 * - Configurable sync strategies
 */

const assert = require('assert')
const fs = require('fs/promises')
const { LRUCache, BufferPool } = require('./cache')

const PageSize = 1024 * 4 /* 4kb */

/**
 * Optimized database connection with caching and pooling
 */
const connectOptimizedDB = (path, options = {}) => {
  /** @type { fs.FileHandle } */
  let fd
  
  // Performance options
  const {
    immediateSync = false,        // Disabled by default for performance
    cacheSize = 100,             // Number of pages to cache
    bufferPoolSize = 50,         // Number of buffers to pool
    batchWrites = true,          // Enable batch writing
    syncInterval = 1000          // Sync every 1 second if not immediate
  } = options

  // Initialize caching and pooling
  const pageCache = new LRUCache(cacheSize)
  const bufferPool = new BufferPool(PageSize, bufferPoolSize)
  
  // Batch writing queue
  const writeQueue = []
  let syncTimer = null
  let isClosing = false

  const scheduledSync = () => {
    if (syncTimer) return
    
    syncTimer = setTimeout(async () => {
      if (!isClosing && fd) {
        try {
          await fd.sync()
        } catch (error) {
          console.warn('Scheduled sync failed:', error.message)
        }
      }
      syncTimer = null
    }, syncInterval)
  }

  const connection = {
    open: async () => {
      if (await fs.access(path).then(() => true, () => false)) {
        console.log('📁 Opening existing database file')
        fd = await fs.open(path, 'r+')
      } else {
        console.log('📝 Creating new database file')
        fd = await fs.open(path, 'w+')
      }
    },
    
    stat: async () => {
      return await fd.stat()
    },
    
    read: async (pn, buffer, size = buffer.length) => {
      // Check cache first
      const cacheKey = `${pn}-${size}`
      const cached = pageCache.get(cacheKey)
      
      if (cached) {
        cached.copy(buffer, 0, 0, size)
        return
      }

      // Read from disk
      size === buffer.length
        ? assert(buffer.length % PageSize === 0, `buffer length ${buffer.length}`)
        : assert(size > 0, `size ${size}`)

      // Check if file is large enough
      const stats = await fd.stat()
      const requiredSize = (pn + 1) * PageSize
      
      if (stats.size < requiredSize) {
        // File is too small, fill buffer with zeros
        buffer.fill(0)
        return
      }

      const r = await fd.read(buffer, 0, size, pn * PageSize)
      assert(r.bytesRead === size, `read ${r.bytesRead} bytes`)
      
      // Cache the read page
      const cacheBuffer = bufferPool.get()
      buffer.copy(cacheBuffer, 0, 0, size)
      pageCache.set(cacheKey, cacheBuffer)
    },
    
    write: async (pn, buffer, size = buffer.length) => {
      size === buffer.length
        ? assert(buffer.length % PageSize === 0, `buffer length ${buffer.length}`)
        : assert(size > 0, `size ${size}`)

      const r = await fd.write(buffer, 0, size, pn * PageSize)
      assert(r.bytesWritten === size, `wrote ${r.bytesWritten} bytes`)
      
      // Invalidate cache for this page
      const cacheKey = `${pn}-${size}`
      if (pageCache.has(cacheKey)) {
        const oldBuffer = pageCache.get(cacheKey)
        bufferPool.release(oldBuffer)
        pageCache.delete(cacheKey)
      }
      
      if (immediateSync) {
        await fd.sync()
      } else if (!batchWrites) {
        scheduledSync()
      }
    },
    
    writeBatch: async (operations) => {
      if (!batchWrites || operations.length === 0) {
        // Fall back to individual writes
        for (const { pn, buffer, size } of operations) {
          await connection.write(pn, buffer, size)
        }
        return
      }

      // Execute batch writes
      const writePromises = operations.map(async ({ pn, buffer, size }) => {
        const r = await fd.write(buffer, 0, size || buffer.length, pn * PageSize)
        assert(r.bytesWritten === (size || buffer.length), `wrote ${r.bytesWritten} bytes`)
        
        // Invalidate cache
        const cacheKey = `${pn}-${size || buffer.length}`
        if (pageCache.has(cacheKey)) {
          const oldBuffer = pageCache.get(cacheKey)
          bufferPool.release(oldBuffer)
          pageCache.delete(cacheKey)
        }
      })

      await Promise.all(writePromises)
      
      if (immediateSync) {
        await fd.sync()
      } else {
        scheduledSync()
      }
    },
    
    close: async () => {
      isClosing = true
      
      if (syncTimer) {
        clearTimeout(syncTimer)
        syncTimer = null
      }
      
      await fd.sync()
      await fd.close()
      
      // Clean up caches
      pageCache.clear()
    },
    
    flush: async () => {
      await fd.sync()
    },

    getStats: () => ({
      cache: pageCache.getStats(),
      bufferPool: bufferPool.getStats(),
      options: {
        immediateSync,
        cacheSize,
        bufferPoolSize,
        batchWrites,
        syncInterval
      }
    }),

    // Get buffer from pool
    getBuffer: () => bufferPool.get(),
    
    // Release buffer back to pool
    releaseBuffer: (buffer) => bufferPool.release(buffer)
  }

  return connection
}

/**
 * Optimized pager with enhanced caching
 */
const createOptimizedPager = async (db, options) => {
  const size = (await db.stat()).size / PageSize

  const pager = {
    no: size === 0 ? 1 : size,
    pages: [],
    rowSize: options.rowSize || options.schema?.getRowSize(),
    
    async page(pn) {
      if (this.pages[pn]) {
        return this.pages[pn]
      }

      // Handle empty database (no pages yet)
      if (pn >= this.no) {
        return null
      }
  
      const buf = db.getBuffer ? db.getBuffer() : Buffer.alloc(PageSize)
      
      try {
        await db.read(pn, buf)
      } catch (error) {
        // Page doesn't exist yet
        if (db.releaseBuffer) {
          db.releaseBuffer(buf)
        }
        return null
      }
  
      const val = options.deserialize 
        ? options.deserialize(buf, pn, this.rowSize)
        : this.deserialize(buf, pn)
  
      // Release buffer back to pool if available
      if (db.releaseBuffer) {
        db.releaseBuffer(buf)
      }

      // Handle root page
      if (pn === 0) {
        return (this.pages[0] = await pager.page(val.parent))
      }
  
      return (this.pages[pn] = val)
    },
    
    async flushBatch() {
      const operations = []
      
      for (let i = 0; i < pager.pages.length; i++) {
        const p = pager.pages[i]
    
        if (p) {
          let s = p
    
          if (i === 0) {
            s = { ...p, parent: p.no } // save root page as page[0]'s parent
          }
    
          const buffer = db.getBuffer ? db.getBuffer() : Buffer.alloc(PageSize)
          const serialized = options.serialize 
            ? options.serialize(s, buffer)
            : this.serialize(s, buffer)
            
          operations.push({ pn: i, buffer: serialized })
        }
      }

      if (db.writeBatch) {
        await db.writeBatch(operations)
      } else {
        // Fall back to individual writes
        for (const { pn, buffer } of operations) {
          await db.write(pn, buffer)
        }
      }

      // Release buffers back to pool
      if (db.releaseBuffer) {
        for (const { buffer } of operations) {
          db.releaseBuffer(buffer)
        }
      }
    },

    async flush() {
      await this.flushBatch()
    },

    // Default serialization/deserialization (can be overridden)
    serialize: options.serialize,
    deserialize: options.deserialize
  }

  return pager
}

module.exports = {
  connectOptimizedDB,
  createOptimizedPager,
  PageSize
}