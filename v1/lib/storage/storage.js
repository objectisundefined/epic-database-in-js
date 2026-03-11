/**
 * Storage Layer Interface
 * 
 * Provides a unified storage interface for both B-tree and B+ tree implementations.
 * Handles file I/O, paging, and persistence operations.
 */

const assert = require('assert')
const fs = require('fs/promises')

const PageSize = 1024 * 4 /* 4kb */

/**
 * Database connection interface
 */
const connectDB = (path, options = {}) => {
  /** @type { fs.FileHandle } */
  let fd
  
  // Default to immediate sync for data safety, can be disabled for performance
  const immediateSync = options.immediateSync !== false

  return {
    open: async () => {
      if (await fs.access(path).then(() => true, () => false)) {
        console.log('file exists, r+')
        fd = await fs.open(path, 'r+')
      } else {
        console.log('file does not exist, w+')
        fd = await fs.open(path, 'w+')
      }
    },
    
    stat: async () => {
      return await fd.stat()
    },
    
    read: async (pn, buffer, size = buffer.length) => {
      size === buffer.length
        ? assert(buffer.length % PageSize === 0, `buffer length ${buffer.length}`)
        : assert(size > 0, `size ${size}`)

      const r = await fd.read(buffer, 0, size, pn * PageSize)
      assert(r.bytesRead === size, `read ${r.bytesRead} bytes`)
    },
    
    write: async (pn, buffer, size = buffer.length) => {
      size === buffer.length
        ? assert(buffer.length % PageSize === 0, `buffer length ${buffer.length}`)
        : assert(size > 0, `size ${size}`)

      const r = await fd.write(buffer, 0, size, pn * PageSize)
      assert(r.bytesWritten === size, `wrote ${r.bytesWritten} bytes`)
      
      if (immediateSync) {
        await fd.sync()
      }
    },
    
    close: async () => {
      await fd.sync()
      await fd.close()
    },
    
    flush: async () => {
      await fd.sync()
    },
  }
}

/**
 * Page management interface
 */
const createPager = async (db, options) => {
  const size = (await db.stat()).size / PageSize

  const pager = {
    no: size === 0 ? 1 : size,
    pages: [],
    rowSize: options.rowSize || options.schema?.getRowSize(),
    
    async page(pn) {
      if (this.pages[pn]) {
        return this.pages[pn]
      }
  
      const buf = Buffer.alloc(PageSize)
      await db.read(pn, buf)
  
      const val = options.deserialize 
        ? options.deserialize(buf, pn, this.rowSize)
        : this.deserialize(buf, pn)
  
      // Handle root page
      if (pn === 0) {
        return (this.pages[0] = await pager.page(val.parent))
      }
  
      return (this.pages[pn] = val)
    },
    
    async flush() {
      for (let i = 0; i < pager.pages.length; i++) {
        const p = pager.pages[i]
    
        if (p) {
          let s = p
    
          if (i === 0) {
            s = { ...p, parent: p.no } // save root page as page[0]'s parent
          }
    
          const serialized = options.serialize 
            ? options.serialize(s, Buffer.alloc(PageSize))
            : this.serialize(s, Buffer.alloc(PageSize))
            
          await db.write(i, serialized)
        }
      }
    },

    // Default serialization/deserialization (can be overridden)
    serialize: options.serialize,
    deserialize: options.deserialize
  }

  return pager
}

/**
 * Storage statistics and utilities
 */
class StorageStats {
  constructor(pager) {
    this.pager = pager
  }

  getPageCount() {
    return this.pager.no
  }

  getPageSize() {
    return PageSize
  }

  getTotalSize() {
    return this.getPageCount() * PageSize
  }

  getUtilization() {
    const usedPages = this.pager.pages.filter(p => p !== null).length
    return (usedPages / this.getPageCount()) * 100
  }

  getStats() {
    return {
      pageCount: this.getPageCount(),
      pageSize: this.getPageSize(),
      totalSize: this.getTotalSize(),
      utilization: this.getUtilization(),
      rowSize: this.pager.rowSize
    }
  }
}

module.exports = {
  connectDB,
  createPager,
  StorageStats,
  PageSize
}