/**
 * Pager Module
 * 
 * Handles page management and caching for the database storage layer.
 */

const { PageSize } = require('./storage')

class Pager {
  constructor(db, options = {}) {
    this.db = db
    this.no = 1
    this.pages = []
    this.rowSize = options.rowSize || options.schema?.getRowSize()
    this.serialize = options.serialize
    this.deserialize = options.deserialize
    this.cacheSize = options.cacheSize || 100 // LRU cache size
    this.accessOrder = [] // For LRU cache
  }

  async initialize() {
    const size = (await this.db.stat()).size / PageSize
    this.no = size === 0 ? 1 : size
  }

  async page(pn) {
    // Check cache first
    if (this.pages[pn]) {
      this._updateAccessOrder(pn)
      return this.pages[pn]
    }

    // Load from disk
    const buf = Buffer.alloc(PageSize)
    await this.db.read(pn, buf)

    const val = this.deserialize 
      ? this.deserialize(buf, pn, this.rowSize)
      : this._defaultDeserialize(buf, pn)

    // Handle root page
    if (pn === 0) {
      return (this.pages[0] = await this.page(val.parent))
    }

    // Cache the page
    this._cachePage(pn, val)
    return val
  }

  async flush() {
    for (let i = 0; i < this.pages.length; i++) {
      const p = this.pages[i]

      if (p) {
        let s = p

        if (i === 0) {
          s = { ...p, parent: p.no } // save root page as page[0]'s parent
        }

        const serialized = this.serialize 
          ? this.serialize(s, Buffer.alloc(PageSize))
          : this._defaultSerialize(s, Buffer.alloc(PageSize))
          
        await this.db.write(i, serialized)
      }
    }
  }

  _cachePage(pn, page) {
    // Implement LRU cache
    if (this.pages.length >= this.cacheSize) {
      const evictPageNum = this.accessOrder.shift()
      delete this.pages[evictPageNum]
    }

    this.pages[pn] = page
    this._updateAccessOrder(pn)
  }

  _updateAccessOrder(pn) {
    // Remove from current position
    const index = this.accessOrder.indexOf(pn)
    if (index > -1) {
      this.accessOrder.splice(index, 1)
    }
    
    // Add to end (most recently used)
    this.accessOrder.push(pn)
  }

  _defaultSerialize(node, buffer) {
    // Basic serialization - should be overridden
    const json = JSON.stringify(node)
    buffer.write(json, 0, 'utf8')
    return buffer
  }

  _defaultDeserialize(buffer, pn) {
    // Basic deserialization - should be overridden
    const json = buffer.toString('utf8', 0, buffer.indexOf('\0'))
    return JSON.parse(json)
  }

  getStats() {
    return {
      totalPages: this.no,
      cachedPages: Object.keys(this.pages).length,
      cacheSize: this.cacheSize,
      cacheUtilization: (Object.keys(this.pages).length / this.cacheSize) * 100,
      rowSize: this.rowSize
    }
  }

  clearCache() {
    this.pages = []
    this.accessOrder = []
  }
}

module.exports = Pager