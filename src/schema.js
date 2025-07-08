const DataTypes = {
  INT32: { size: 4, serialize: (val, buf, offset) => buf.writeInt32LE(val, offset), deserialize: (buf, offset) => buf.readInt32LE(offset) },
  UINT32: { size: 4, serialize: (val, buf, offset) => buf.writeUInt32LE(val, offset), deserialize: (buf, offset) => buf.readUInt32LE(offset) },
  INT64: { size: 8, serialize: (val, buf, offset) => buf.writeBigInt64LE(BigInt(val), offset), deserialize: (buf, offset) => Number(buf.readBigInt64LE(offset)) },
  FLOAT: { size: 4, serialize: (val, buf, offset) => buf.writeFloatLE(val, offset), deserialize: (buf, offset) => buf.readFloatLE(offset) },
  DOUBLE: { size: 8, serialize: (val, buf, offset) => buf.writeDoubleLE(val, offset), deserialize: (buf, offset) => buf.readDoubleLE(offset) },
  BOOLEAN: { size: 1, serialize: (val, buf, offset) => buf.writeUInt8(val ? 1 : 0, offset), deserialize: (buf, offset) => buf.readUInt8(offset) === 1 },
  VARCHAR: (length) => ({
    size: length,
    serialize: (val, buf, offset) => {
      const str = String(val || '').slice(0, length - 1); // Reserve space for null terminator
      buf.write(str, offset, length - 1, 'utf8');
      buf.writeUInt8(0, offset + str.length); // Null terminator
    },
    deserialize: (buf, offset) => {
      const nullIndex = buf.indexOf(0, offset);
      const endIndex = nullIndex === -1 ? offset + length : nullIndex;
      return buf.subarray(offset, Math.min(endIndex, offset + length)).toString('utf8');
    }
  }),
  BINARY: (length) => ({
    size: length,
    serialize: (val, buf, offset) => {
      const data = Buffer.isBuffer(val) ? val : Buffer.from(val);
      buf.set(data.subarray(0, length), offset);
    },
    deserialize: (buf, offset) => buf.subarray(offset, offset + length)
  }),
  JSON: (maxLength) => ({
    size: maxLength,
    serialize: (val, buf, offset) => {
      const jsonStr = JSON.stringify(val || null);
      const truncated = jsonStr.slice(0, maxLength - 1);
      buf.write(truncated, offset, maxLength - 1, 'utf8');
      buf.writeUInt8(0, offset + truncated.length);
    },
    deserialize: (buf, offset) => {
      const nullIndex = buf.indexOf(0, offset);
      const endIndex = nullIndex === -1 ? offset + maxLength : nullIndex;
      const jsonStr = buf.subarray(offset, Math.min(endIndex, offset + maxLength)).toString('utf8');
      try {
        return JSON.parse(jsonStr);
      } catch {
        return null;
      }
    }
  })
};

class Schema {
  constructor(fields) {
    this.fields = [];
    this.fieldMap = new Map();
    this.totalSize = 0;
    
    for (const [name, type] of Object.entries(fields)) {
      const field = {
        name,
        type,
        offset: this.totalSize,
        size: type.size
      };
      
      this.fields.push(field);
      this.fieldMap.set(name, field);
      this.totalSize += type.size;
    }
  }

  getRowSize() {
    return this.totalSize;
  }

  serialize(obj) {
    const buffer = Buffer.alloc(this.totalSize);
    
    for (const field of this.fields) {
      const value = obj[field.name];
      field.type.serialize(value, buffer, field.offset);
    }
    
    return buffer;
  }

  deserialize(buffer) {
    const obj = {};
    
    for (const field of this.fields) {
      obj[field.name] = field.type.deserialize(buffer, field.offset);
    }
    
    return obj;
  }

  getField(name) {
    return this.fieldMap.get(name);
  }

  getFields() {
    return [...this.fields];
  }
}

// Pre-defined schemas for common use cases
const DefaultSchemas = {
  // Original schema for backward compatibility
  User: new Schema({
    id: DataTypes.UINT32,
    username: DataTypes.VARCHAR(32),
    email: DataTypes.VARCHAR(255)
  }),

  // Product catalog
  Product: new Schema({
    id: DataTypes.UINT32,
    name: DataTypes.VARCHAR(100),
    price: DataTypes.DOUBLE,
    category_id: DataTypes.UINT32,
    in_stock: DataTypes.BOOLEAN,
    description: DataTypes.VARCHAR(500)
  }),

  // Log entries
  LogEntry: new Schema({
    id: DataTypes.UINT32,
    timestamp: DataTypes.INT64,
    level: DataTypes.VARCHAR(10),
    message: DataTypes.VARCHAR(1000),
    metadata: DataTypes.JSON(500)
  }),

  // Simple key-value store
  KeyValue: new Schema({
    key: DataTypes.VARCHAR(100),
    value: DataTypes.JSON(1000)
  }),

  // Analytics events
  Event: new Schema({
    id: DataTypes.UINT32,
    user_id: DataTypes.UINT32,
    event_type: DataTypes.VARCHAR(50),
    timestamp: DataTypes.INT64,
    properties: DataTypes.JSON(2000)
  })
};

module.exports = {
  DataTypes,
  Schema,
  DefaultSchemas
};