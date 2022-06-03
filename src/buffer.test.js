const buffer = Buffer.alloc(0)

// (method) Buffer.writeInt32LE(value: number, offset?: number): number
buffer.writeInt32LE(0, 0)

// (method) Buffer.readUInt32LE(offset?: number): number
buffer.readUInt32LE(0)

// slice(start?: number, end?: number): Buffer
buffer.slice(0, 4)

// (method) Uint8Array.set(array: ArrayLike<number>, offset?: number): void
buffer.set(Buffer.alloc(0), 0)

// write(string: string, encoding?: BufferEncoding): number;
// write(string: string, offset: number, encoding?: BufferEncoding): number;
// write(string: string, offset: number, length: number, encoding?: BufferEncoding): number;
buffer.write('', 0, 4, 'utf8')
