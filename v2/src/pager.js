'use strict'

const fs = require('fs')
const { DatabaseError } = require('./errors')

const PAGE_SIZE = 4096

// ─── File-header layout (page 0) ─────────────────────────────────────────────
// Offset  Size  Field
// 0       4     magic  0x44424A53  ('DBJS')
// 4       1     version
// 5       2     pageSize (uint16LE)
// 7       1     flags
// 8       4     rootPageId (uint32LE)  – B+ tree root
// 12      4     pageCount (uint32LE)  – total pages allocated
// 16      4     nextAutoId (uint32LE) – auto-increment counter
// 20      4     recordSize (uint32LE) – bytes per row

const MAGIC = 0x44424a53
const VERSION = 1
const HEADER_MAGIC_OFFSET = 0
const HEADER_VERSION_OFFSET = 4
const HEADER_PAGE_SIZE_OFFSET = 5
const HEADER_FLAGS_OFFSET = 7
const HEADER_ROOT_OFFSET = 8
const HEADER_PAGE_COUNT_OFFSET = 12
const HEADER_NEXT_AUTO_ID_OFFSET = 16
const HEADER_RECORD_SIZE_OFFSET = 20

/**
 * Page manager – provides a simple read/write interface on top of a flat file,
 * treating the file as an array of fixed-size (PAGE_SIZE) pages.
 *
 * Features:
 *  - LRU page cache (configurable size)
 *  - Write-back dirty tracking
 *  - Atomic page allocation
 *  - File-header management (root page ID, auto-increment counter, …)
 */
class Pager {
  /**
   * @param {string} filePath
   * @param {object} [opts]
   * @param {number} [opts.pageSize=4096]
   * @param {number} [opts.cacheSize=256]   maximum pages to hold in memory
   */
  constructor (filePath, opts = {}) {
    this.filePath = filePath
    this.pageSize = opts.pageSize || PAGE_SIZE
    this.cacheCapacity = opts.cacheSize || 256

    this.fd = null
    this.pageCount = 0          // total pages in file (incl. header)
    this.rootPageId = 0
    this.nextAutoId = 1
    this.recordSize = 0

    // LRU cache – Map preserves insertion order, so we can evict the oldest.
    /** @type {Map<number, Buffer>} */
    this._cache = new Map()
    /** @type {Set<number>} */
    this._dirty = new Set()
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  /**
   * Open (or create) the backing file.
   * @param {number} [recordSize=0]  required when creating a new file
   */
  async open (recordSize = 0) {
    let isNew = false

    try {
      await fs.promises.access(this.filePath)
    } catch {
      isNew = true
    }

    this.fd = await fs.promises.open(this.filePath, isNew ? 'w+' : 'r+')

    if (isNew) {
      this.pageCount = 1            // reserve page 0 for the header
      this.rootPageId = 0           // will be set after the first page allocation
      this.nextAutoId = 1
      this.recordSize = recordSize
      await this._writeHeader()
    } else {
      await this._readHeader()
    }
  }

  async close () {
    await this.flush()
    if (this.fd) {
      await this.fd.close()
      this.fd = null
    }
  }

  // ── Page access ──────────────────────────────────────────────────────────────

  /** Read a page by ID, using the cache if available. */
  async getPage (pageId) {
    if (this._cache.has(pageId)) {
      // LRU: refresh position
      const buf = this._cache.get(pageId)
      this._cache.delete(pageId)
      this._cache.set(pageId, buf)
      return buf
    }

    const buf = Buffer.alloc(this.pageSize)

    if (pageId < this.pageCount) {
      const { bytesRead } = await this.fd.read(
        buf, 0, this.pageSize, pageId * this.pageSize
      )
      if (bytesRead < this.pageSize) buf.fill(0, bytesRead) // zero remainder
    }
    // pageId >= pageCount → new page, already zeroed

    this._cache.set(pageId, buf)
    this._evict()

    return buf
  }

  /** Mark a page as dirty (needs to be flushed). */
  markDirty (pageId) {
    this._dirty.add(pageId)
  }

  /** Allocate a new blank page and return its ID. */
  async allocatePage () {
    const id = this.pageCount++
    const buf = Buffer.alloc(this.pageSize)
    this._cache.set(id, buf)
    this._dirty.add(id)
    this._evict()
    return id
  }

  /** Flush all dirty pages (and the header) to disk. */
  async flush () {
    if (!this.fd) return

    for (const pageId of this._dirty) {
      const buf = this._cache.get(pageId)
      if (!buf) continue
      await this.fd.write(buf, 0, this.pageSize, pageId * this.pageSize)
    }

    this._dirty.clear()
    await this._writeHeader()
    await this.fd.sync()
  }

  // ── Header helpers ────────────────────────────────────────────────────────────

  async _readHeader () {
    const buf = Buffer.alloc(this.pageSize)
    await this.fd.read(buf, 0, this.pageSize, 0)

    const magic = buf.readUInt32LE(HEADER_MAGIC_OFFSET)
    if (magic !== MAGIC) {
      throw new DatabaseError('Invalid database file (bad magic)', 'CORRUPT_FILE')
    }

    this.rootPageId  = buf.readUInt32LE(HEADER_ROOT_OFFSET)
    this.pageCount   = buf.readUInt32LE(HEADER_PAGE_COUNT_OFFSET)
    this.nextAutoId  = buf.readUInt32LE(HEADER_NEXT_AUTO_ID_OFFSET)
    this.recordSize  = buf.readUInt32LE(HEADER_RECORD_SIZE_OFFSET)
  }

  async _writeHeader () {
    const buf = Buffer.alloc(this.pageSize)
    buf.writeUInt32LE(MAGIC,            HEADER_MAGIC_OFFSET)
    buf.writeUInt8(VERSION,             HEADER_VERSION_OFFSET)
    buf.writeUInt16LE(this.pageSize,    HEADER_PAGE_SIZE_OFFSET)
    buf.writeUInt8(0,                   HEADER_FLAGS_OFFSET)
    buf.writeUInt32LE(this.rootPageId,  HEADER_ROOT_OFFSET)
    buf.writeUInt32LE(this.pageCount,   HEADER_PAGE_COUNT_OFFSET)
    buf.writeUInt32LE(this.nextAutoId,  HEADER_NEXT_AUTO_ID_OFFSET)
    buf.writeUInt32LE(this.recordSize,  HEADER_RECORD_SIZE_OFFSET)
    await this.fd.write(buf, 0, this.pageSize, 0)
  }

  // ── LRU eviction ─────────────────────────────────────────────────────────────

  _evict () {
    while (this._cache.size > this.cacheCapacity) {
      // Map iterator returns entries in insertion order → first is oldest
      for (const [pageId] of this._cache) {
        if (!this._dirty.has(pageId)) {
          this._cache.delete(pageId)
          break
        }
      }
      // If ALL cached pages are dirty, stop — we can't evict any
      if (this._cache.size > this.cacheCapacity + this.cacheCapacity) break
    }
  }

  get stats () {
    return {
      filePath: this.filePath,
      pageSize: this.pageSize,
      pageCount: this.pageCount,
      rootPageId: this.rootPageId,
      cacheSize: this._cache.size,
      dirtyPages: this._dirty.size
    }
  }
}

module.exports = { Pager, PAGE_SIZE }
