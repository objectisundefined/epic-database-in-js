/**
 * Data Compression Module
 * 
 * Provides optional compression for database pages to reduce storage footprint
 * and improve I/O efficiency for larger datasets.
 */

const zlib = require('zlib')
const { promisify } = require('util')

const gzip = promisify(zlib.gzip)
const gunzip = promisify(zlib.gunzip)
const deflate = promisify(zlib.deflate)
const inflate = promisify(zlib.inflate)

// Compression algorithms
const CompressionType = {
  NONE: 0,
  GZIP: 1,
  DEFLATE: 2,
  LZ4: 3  // Future implementation
}

/**
 * Compression utility class
 */
class Compressor {
  constructor(type = CompressionType.GZIP, options = {}) {
    this.type = type
    this.options = {
      level: 6,  // Compression level (1-9, 6 is default)
      chunkSize: 1024,
      ...options
    }
    this.stats = {
      compressions: 0,
      decompressions: 0,
      originalBytes: 0,
      compressedBytes: 0,
      compressionTime: 0,
      decompressionTime: 0
    }
  }

  async compress(buffer) {
    if (this.type === CompressionType.NONE) {
      return buffer
    }

    const startTime = performance.now()
    let compressed

    try {
      switch (this.type) {
        case CompressionType.GZIP:
          compressed = await gzip(buffer, { level: this.options.level })
          break
        case CompressionType.DEFLATE:
          compressed = await deflate(buffer, { level: this.options.level })
          break
        default:
          throw new Error(`Unsupported compression type: ${this.type}`)
      }

      const endTime = performance.now()
      
      // Update statistics
      this.stats.compressions++
      this.stats.originalBytes += buffer.length
      this.stats.compressedBytes += compressed.length
      this.stats.compressionTime += endTime - startTime

      // Only use compression if it provides meaningful savings
      const compressionRatio = compressed.length / buffer.length
      if (compressionRatio > 0.9) {
        // Compression didn't help much, return original
        return buffer
      }

      // Prepend compression type and original size for decompression
      const result = Buffer.alloc(compressed.length + 5)
      result.writeUInt8(this.type, 0)
      result.writeUInt32LE(buffer.length, 1)
      compressed.copy(result, 5)

      return result
    } catch (error) {
      console.warn('Compression failed, using uncompressed data:', error.message)
      return buffer
    }
  }

  async decompress(buffer) {
    if (buffer.length < 5) {
      // Too small to be compressed
      return buffer
    }

    const compressionType = buffer.readUInt8(0)
    if (compressionType === CompressionType.NONE) {
      return buffer
    }

    const startTime = performance.now()
    const originalSize = buffer.readUInt32LE(1)
    const compressedData = buffer.subarray(5)

    try {
      let decompressed

      switch (compressionType) {
        case CompressionType.GZIP:
          decompressed = await gunzip(compressedData)
          break
        case CompressionType.DEFLATE:
          decompressed = await inflate(compressedData)
          break
        default:
          // Unknown compression type, assume uncompressed
          return buffer
      }

      const endTime = performance.now()
      
      // Update statistics
      this.stats.decompressions++
      this.stats.decompressionTime += endTime - startTime

      // Verify decompressed size
      if (decompressed.length !== originalSize) {
        console.warn('Decompression size mismatch, using original buffer')
        return buffer
      }

      return decompressed
    } catch (error) {
      console.warn('Decompression failed, using original buffer:', error.message)
      return buffer
    }
  }

  getCompressionRatio() {
    if (this.stats.originalBytes === 0) return 1
    return this.stats.compressedBytes / this.stats.originalBytes
  }

  getStats() {
    const totalTime = this.stats.compressionTime + this.stats.decompressionTime
    return {
      ...this.stats,
      compressionRatio: this.getCompressionRatio(),
      avgCompressionTime: this.stats.compressions > 0 
        ? this.stats.compressionTime / this.stats.compressions 
        : 0,
      avgDecompressionTime: this.stats.decompressions > 0 
        ? this.stats.decompressionTime / this.stats.decompressions 
        : 0,
      totalTime,
      spaceSaved: this.stats.originalBytes - this.stats.compressedBytes,
      spaceSavedPercent: this.stats.originalBytes > 0 
        ? ((this.stats.originalBytes - this.stats.compressedBytes) / this.stats.originalBytes * 100).toFixed(2) + '%'
        : '0%'
    }
  }

  reset() {
    this.stats = {
      compressions: 0,
      decompressions: 0,
      originalBytes: 0,
      compressedBytes: 0,
      compressionTime: 0,
      decompressionTime: 0
    }
  }
}

/**
 * Adaptive compression that chooses the best algorithm based on data characteristics
 */
class AdaptiveCompressor {
  constructor(options = {}) {
    this.options = options
    this.compressors = {
      [CompressionType.GZIP]: new Compressor(CompressionType.GZIP, options),
      [CompressionType.DEFLATE]: new Compressor(CompressionType.DEFLATE, options)
    }
    this.stats = {
      algorithmUsage: {},
      adaptiveDecisions: 0
    }
  }

  async compress(buffer) {
    // For small buffers, compression overhead might not be worth it
    if (buffer.length < 128) {
      return buffer
    }

    // Analyze buffer characteristics to choose best compression
    const entropy = this.calculateEntropy(buffer)
    let chosenType

    if (entropy > 7.5) {
      // High entropy data (random-like), compression won't help much
      chosenType = CompressionType.NONE
    } else if (entropy < 4.0) {
      // Low entropy data, GZIP works well
      chosenType = CompressionType.GZIP
    } else {
      // Medium entropy, DEFLATE might be faster
      chosenType = CompressionType.DEFLATE
    }

    this.stats.adaptiveDecisions++
    this.stats.algorithmUsage[chosenType] = (this.stats.algorithmUsage[chosenType] || 0) + 1

    if (chosenType === CompressionType.NONE) {
      return buffer
    }

    return await this.compressors[chosenType].compress(buffer)
  }

  async decompress(buffer) {
    if (buffer.length < 5) {
      return buffer
    }

    const compressionType = buffer.readUInt8(0)
    if (compressionType === CompressionType.NONE || !this.compressors[compressionType]) {
      return buffer
    }

    return await this.compressors[compressionType].decompress(buffer)
  }

  calculateEntropy(buffer) {
    const frequencies = new Array(256).fill(0)
    
    // Count byte frequencies
    for (let i = 0; i < buffer.length; i++) {
      frequencies[buffer[i]]++
    }

    // Calculate Shannon entropy
    let entropy = 0
    for (let i = 0; i < 256; i++) {
      if (frequencies[i] > 0) {
        const probability = frequencies[i] / buffer.length
        entropy -= probability * Math.log2(probability)
      }
    }

    return entropy
  }

  getStats() {
    const combinedStats = {
      adaptive: this.stats,
      algorithms: {}
    }

    for (const [type, compressor] of Object.entries(this.compressors)) {
      combinedStats.algorithms[type] = compressor.getStats()
    }

    return combinedStats
  }
}

module.exports = {
  Compressor,
  AdaptiveCompressor,
  CompressionType
}