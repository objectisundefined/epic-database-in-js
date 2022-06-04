{
  const buffer = Buffer.alloc(4)

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
}

{
  const buf = Buffer.alloc(10)

  buf.set([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 0)

  Buffer.from([10, 11, 12, 13, 14, 15]).copy(buf.slice(0, 6))

  console.log(buf)
}
