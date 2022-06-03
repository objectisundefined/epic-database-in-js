const assert = require('assert')

// sizeof(int) = 4
// sizeof(int*) = 8
// sizeof(uint8_t) = 1
// sizeof(uint32_t) = 4

const ROW_SIZE =
  4 + /* id	integer */
  32 + /* username	varchar(32) */ /* \0 */
  255 /* email	varchar(255) */ /* \0 */

const PAGE_SIZE = 4096 /* 4kb */

// typedef enum { NODE_INTERNAL, NODE_LEAF } NodeType;
const NodeType = {
  ['NODE_INTERNAL']: 0,
  ['NODE_LEAF']: 1,
}

/*
 * Common Node Header Layout
 */
// const uint32_t NODE_TYPE_SIZE = sizeof(uint8_t);
// const uint32_t NODE_TYPE_OFFSET = 0;
// const uint32_t IS_ROOT_SIZE = sizeof(uint8_t);
// const uint32_t IS_ROOT_OFFSET = NODE_TYPE_SIZE;
// const uint32_t PARENT_POINTER_SIZE = sizeof(uint32_t);
// const uint32_t PARENT_POINTER_OFFSET = IS_ROOT_OFFSET + IS_ROOT_SIZE;
// const uint8_t COMMON_NODE_HEADER_SIZE = NODE_TYPE_SIZE + IS_ROOT_SIZE + PARENT_POINTER_SIZE;

const NODE_TYPE_SIZE = 1 /* sizeof(uint8_t) */;
const NODE_TYPE_OFFSET = 0;
const IS_ROOT_SIZE = 1 /* sizeof(uint8_t) */;
const IS_ROOT_OFFSET = NODE_TYPE_SIZE;
const PARENT_POINTER_SIZE = 4 /* sizeof(uint32_t) */;
const PARENT_POINTER_OFFSET = IS_ROOT_OFFSET + IS_ROOT_SIZE;
const COMMON_NODE_HEADER_SIZE = NODE_TYPE_SIZE + IS_ROOT_SIZE + PARENT_POINTER_SIZE;

/*
 * Leaf Node Header Layout
 */
// const uint32_t LEAF_NODE_NUM_CELLS_SIZE = sizeof(uint32_t);
// const uint32_t LEAF_NODE_NUM_CELLS_OFFSET = COMMON_NODE_HEADER_SIZE;
// const uint32_t LEAF_NODE_HEADER_SIZE = COMMON_NODE_HEADER_SIZE + LEAF_NODE_NUM_CELLS_SIZE;

const LEAF_NODE_NUM_CELLS_SIZE = 4 /* sizeof(uint32_t) */;
const LEAF_NODE_NUM_CELLS_OFFSET = COMMON_NODE_HEADER_SIZE;
const LEAF_NODE_HEADER_SIZE = COMMON_NODE_HEADER_SIZE + LEAF_NODE_NUM_CELLS_SIZE;

/*
 * Leaf Node Body Layout
 */
// const uint32_t LEAF_NODE_KEY_SIZE = sizeof(uint32_t);
// const uint32_t LEAF_NODE_KEY_OFFSET = 0;
// const uint32_t LEAF_NODE_VALUE_SIZE = ROW_SIZE;
// const uint32_t LEAF_NODE_VALUE_OFFSET = LEAF_NODE_KEY_OFFSET + LEAF_NODE_KEY_SIZE;
// const uint32_t LEAF_NODE_CELL_SIZE = LEAF_NODE_KEY_SIZE + LEAF_NODE_VALUE_SIZE;
// const uint32_t LEAF_NODE_SPACE_FOR_CELLS = PAGE_SIZE - LEAF_NODE_HEADER_SIZE;
// const uint32_t LEAF_NODE_MAX_CELLS = LEAF_NODE_SPACE_FOR_CELLS / LEAF_NODE_CELL_SIZE;

const LEAF_NODE_KEY_SIZE = 4 /* sizeof(uint32_t) */;
const LEAF_NODE_KEY_OFFSET = 0;
const LEAF_NODE_VALUE_SIZE = ROW_SIZE;
const LEAF_NODE_VALUE_OFFSET = LEAF_NODE_KEY_OFFSET + LEAF_NODE_KEY_SIZE;
const LEAF_NODE_CELL_SIZE = LEAF_NODE_KEY_SIZE + LEAF_NODE_VALUE_SIZE;
const LEAF_NODE_SPACE_FOR_CELLS = PAGE_SIZE - LEAF_NODE_HEADER_SIZE;
const LEAF_NODE_MAX_CELLS = Math.floor(LEAF_NODE_SPACE_FOR_CELLS / LEAF_NODE_CELL_SIZE);

// uint32_t* leaf_node_num_cells(void* node) {
//   return node + LEAF_NODE_NUM_CELLS_OFFSET;
// }

const leaf_node_num_cells = buffer => {
  assert(buffer.length === PAGE_SIZE, `buffer.length: ${buffer.length}`)

  const offset = LEAF_NODE_NUM_CELLS_OFFSET

  return {
    read: () => buffer.readUInt32LE(offset),
    write: (value) => buffer.writeInt32LE(value, offset),
  }
}

// void* leaf_node_cell(void* node, uint32_t cell_num) {
//   return node + LEAF_NODE_HEADER_SIZE + cell_num * LEAF_NODE_CELL_SIZE;
// }

const leaf_node_cell = (buffer, cell_num) => {
  assert(buffer.length === PAGE_SIZE, `buffer.length: ${buffer.length}`)

  const offset = LEAF_NODE_HEADER_SIZE + cell_num * LEAF_NODE_CELL_SIZE

  return {
    read: () => buffer.slice(offset, offset + LEAF_NODE_CELL_SIZE),
    write: (value) => {
      assert(value.length === LEAF_NODE_CELL_SIZE, `value.length: ${value.length}`)
      
      return buffer.set(value, offset)
    },
  }
}

// uint32_t* leaf_node_key(void* node, uint32_t cell_num) {
//   return leaf_node_cell(node, cell_num);
// }

const leaf_node_key = (buffer, cell_num) => {
  assert(buffer.length === PAGE_SIZE, `buffer.length: ${buffer.length}`)

  const offset = LEAF_NODE_HEADER_SIZE + cell_num * LEAF_NODE_CELL_SIZE

  return {
    read: () => buffer.readUInt32LE(offset),
    write: (value) => buffer.writeInt32LE(value, offset),
  }
}

// void* leaf_node_value(void* node, uint32_t cell_num) {
//   return leaf_node_cell(node, cell_num) + LEAF_NODE_KEY_SIZE;
// }

const leaf_node_value = (buffer, cell_num) => {
  assert(buffer.length === PAGE_SIZE, `buffer.length: ${buffer.length}`)

  const offset = LEAF_NODE_HEADER_SIZE + cell_num * LEAF_NODE_CELL_SIZE + LEAF_NODE_KEY_SIZE

  return {
    read: () => buffer.slice(offset, offset + LEAF_NODE_VALUE_SIZE),
    write: (value) => {
      assert(value.length === ROW_SIZE, `value.length: ${value.length}`)

      return buffer.set(value, offset)
    },
  }
}

// void print_constants() {
//   printf("ROW_SIZE: %d\n", ROW_SIZE);
//   printf("COMMON_NODE_HEADER_SIZE: %d\n", COMMON_NODE_HEADER_SIZE);
//   printf("LEAF_NODE_HEADER_SIZE: %d\n", LEAF_NODE_HEADER_SIZE);
//   printf("LEAF_NODE_CELL_SIZE: %d\n", LEAF_NODE_CELL_SIZE);
//   printf("LEAF_NODE_SPACE_FOR_CELLS: %d\n", LEAF_NODE_SPACE_FOR_CELLS);
//   printf("LEAF_NODE_MAX_CELLS: %d\n", LEAF_NODE_MAX_CELLS);
// }

const print_constants = () => {
  console.log("ROW_SIZE: %d", ROW_SIZE);
  console.log("COMMON_NODE_HEADER_SIZE: %d", COMMON_NODE_HEADER_SIZE);
  console.log("LEAF_NODE_HEADER_SIZE: %d", LEAF_NODE_HEADER_SIZE);
  console.log("LEAF_NODE_CELL_SIZE: %d", LEAF_NODE_CELL_SIZE);
  console.log("LEAF_NODE_SPACE_FOR_CELLS: %d", LEAF_NODE_SPACE_FOR_CELLS);
  console.log("LEAF_NODE_MAX_CELLS: %d", LEAF_NODE_MAX_CELLS);
}

// void print_leaf_node(void* node) {
//   uint32_t num_cells = *leaf_node_num_cells(node);
//   printf("leaf (size %d)\n", num_cells);
//   for (uint32_t i = 0; i < num_cells; i++) {
//     uint32_t key = *leaf_node_key(node, i);
//     printf("  - %d : %d\n", i, key);
//   }
// }

const print_leaf_node = (buffer) => {
  const num_cells = buffer.readUInt32LE(LEAF_NODE_NUM_CELLS_OFFSET);
  console.log("leaf (size %d)", num_cells);
  for (let i = 0; i < num_cells; i++) {
    const key = buffer.readUInt32LE(LEAF_NODE_HEADER_SIZE + i * LEAF_NODE_CELL_SIZE + LEAF_NODE_KEY_OFFSET);
    console.log("  - %d : %d", i, key);
  }
}

// void initialize_leaf_node(void* node) { *leaf_node_num_cells(node) = 0; }

const initialize_leaf_node = buffer => {
  leaf_node_num_cells(buffer).write(0)
}

module.exports = {
  ROW_SIZE,
  PAGE_SIZE,
  NodeType,
  LEAF_NODE_MAX_CELLS,
  leaf_node_num_cells,
  leaf_node_cell,
  leaf_node_key,
  leaf_node_value,
  print_constants,
  print_leaf_node,
  initialize_leaf_node,
}
