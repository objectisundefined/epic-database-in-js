const assert = require('assert')

// sizeof(int) = 4
// sizeof(int*) = 8
// sizeof(uint8_t) = 1
// sizeof(uint32_t) = 4

const ROW_SIZE =
  4 + /* id	integer */
  32 + /* username	varchar(32) */ /* \0 */
  255 /* email	varchar(255) */ /* \0 */

const PAGE_SIZE = 1024 /* 4kb */

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
// const uint32_t LEAF_NODE_NEXT_LEAF_SIZE = sizeof(uint32_t);
// const uint32_t LEAF_NODE_NEXT_LEAF_OFFSET = LEAF_NODE_NUM_CELLS_OFFSET + LEAF_NODE_NUM_CELLS_SIZE;
// const uint32_t LEAF_NODE_HEADER_SIZE = COMMON_NODE_HEADER_SIZE + LEAF_NODE_NUM_CELLS_SIZE + LEAF_NODE_NEXT_LEAF_SIZE;

const LEAF_NODE_NUM_CELLS_SIZE = 4 /* sizeof(uint32_t) */
const LEAF_NODE_NUM_CELLS_OFFSET = COMMON_NODE_HEADER_SIZE
const LEAF_NODE_NEXT_LEAF_SIZE = 4 /* sizeof(uint32_t) */
const LEAF_NODE_NEXT_LEAF_OFFSET = LEAF_NODE_NUM_CELLS_OFFSET + LEAF_NODE_NUM_CELLS_SIZE
const LEAF_NODE_HEADER_SIZE = COMMON_NODE_HEADER_SIZE + LEAF_NODE_NUM_CELLS_SIZE + LEAF_NODE_NEXT_LEAF_SIZE

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
    write: (value) => buffer.writeUInt32LE(value, offset),
  }
}

// uint32_t* leaf_node_next_leaf(void* node) {
//   return node + LEAF_NODE_NEXT_LEAF_OFFSET;
// }

const leaf_node_next_leaf = buffer => {
  assert(buffer.length === PAGE_SIZE, `buffer.length: ${buffer.length}`)

  const offset = LEAF_NODE_NEXT_LEAF_OFFSET

  return {
    read: () => buffer.readUInt32LE(offset),
    write: (value) => buffer.writeUInt32LE(value, offset),
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
    write: (value) => buffer.writeUInt32LE(value, offset),
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
  console.log('ROW_SIZE: %d', ROW_SIZE)
  console.log('COMMON_NODE_HEADER_SIZE: %d', COMMON_NODE_HEADER_SIZE)
  console.log('LEAF_NODE_HEADER_SIZE: %d', LEAF_NODE_HEADER_SIZE)
  console.log('LEAF_NODE_CELL_SIZE: %d', LEAF_NODE_CELL_SIZE)
  console.log('LEAF_NODE_SPACE_FOR_CELLS: %d', LEAF_NODE_SPACE_FOR_CELLS)
  console.log('LEAF_NODE_MAX_CELLS: %d', LEAF_NODE_MAX_CELLS)
  console.log('INTERNAL_NODE_HEADER_SIZE: %d', INTERNAL_NODE_HEADER_SIZE)
  console.log('INTERNAL_NODE_CELL_SIZE: %d', INTERNAL_NODE_CELL_SIZE)
  console.log('INTERNAL_NODE_CHILD_SIZE: %d', INTERNAL_NODE_CHILD_SIZE)
  console.log('INTERNAL_NODE_NUM_KEYS_SIZE: %d', INTERNAL_NODE_NUM_KEYS_SIZE)
  console.log('INTERNAL_NODE_RIGHT_CHILD_SIZE: %d', INTERNAL_NODE_RIGHT_CHILD_SIZE)
  console.log('LEAF_NODE_RIGHT_SPLIT_COUNT %d', LEAF_NODE_RIGHT_SPLIT_COUNT)
  console.log('LEAF_NODE_LEFT_SPLIT_COUNT %d', LEAF_NODE_LEFT_SPLIT_COUNT)
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

// void indent(uint32_t level) {
//   for (uint32_t i = 0; i < level; i++) {
//     printf("  ");
//   }
// }

const indent = (level) => {
  return ' '.repeat(level * 2)
}

// void print_tree(Pager* pager, uint32_t page_num, uint32_t indentation_level) {
//   void* node = get_page(pager, page_num);
//   uint32_t num_keys, child;

//   switch (get_node_type(node)) {
//     case (NODE_LEAF):
//       num_keys = *leaf_node_num_cells(node);
//       indent(indentation_level);
//       printf("- leaf (size %d)\n", num_keys);
//       for (uint32_t i = 0; i < num_keys; i++) {
//         indent(indentation_level + 1);
//         printf("- %d\n", *leaf_node_key(node, i));
//       }
//       break;
//     case (NODE_INTERNAL):
//       num_keys = *internal_node_num_keys(node);
//       indent(indentation_level);
//       printf("- internal (size %d)\n", num_keys);
//       for (uint32_t i = 0; i < num_keys; i++) {
//         child = *internal_node_child(node, i);
//         print_tree(pager, child, indentation_level + 1);

//         indent(indentation_level + 1);
//         printf("- key %d\n", *internal_node_key(node, i));
//       }
//       child = *internal_node_right_child(node);
//       print_tree(pager, child, indentation_level + 1);
//       break;
//   }
// }

let pi = 0

const print_tree = async (pager, page_num, indentation_level) => {
  pi++

  if (pi > 100) {
    throw Error('unexpected')
  }

  const node = await pager.page(page_num)
  const type = node_type(node).read()

  if (type === NodeType.NODE_LEAF) {
    const num_keys = leaf_node_num_cells(node).read()

    console.log(`${indent(indentation_level)}- leaf (size %d)`, num_keys)

    for (let i = 0; i < num_keys; i++) {
      console.log(`${indent(indentation_level + 1)}- %d`, leaf_node_key(node, i).read())
    }
  } else {
    const num_keys = internal_node_num_keys(node).read()

    console.log(`${indent(indentation_level)}- internal (size %d)`, num_keys)

    for (let i = 0; i < num_keys; i++) {
      const child = internal_node_child(node, i).read()
      await print_tree(pager, child, indentation_level + 1)

      console.log(`${indent(indentation_level + 1)}- key %d`, internal_node_key(node, i).read())
    }

    const right_child = internal_node_right_child(node).read()
    await print_tree(pager, right_child, indentation_level + 1)
  }
}

// void initialize_leaf_node(void* node) {
//   set_node_type(node, NODE_LEAF);
//   set_node_root(node, false);
//   *leaf_node_num_cells(node) = 0;
//   *leaf_node_next_leaf(node) = 0;
// }

const initialize_leaf_node = (buffer, root) => {
  node_type(buffer).write(NodeType.NODE_LEAF)
  node_root(buffer).write(root ? 1 : 0)
  leaf_node_num_cells(buffer).write(0)
  leaf_node_next_leaf(buffer).write(0) // 0 represents no sibling
}

// void leaf_node_insert(Cursor* cursor, uint32_t key, Row* value) {
//   void* node = get_page(cursor->table->pager, cursor->page_num);

//   uint32_t num_cells = *leaf_node_num_cells(node);
//   if (num_cells >= LEAF_NODE_MAX_CELLS) {
//     // Node full
//     printf("Need to implement splitting a leaf node.\n");
//     exit(EXIT_FAILURE);
//   }

//   if (cursor->cell_num < num_cells) {
//     // Make room for new cell
//     for (uint32_t i = num_cells; i > cursor->cell_num; i--) {
//       memcpy(leaf_node_cell(node, i), leaf_node_cell(node, i - 1),
//              LEAF_NODE_CELL_SIZE);
//     }
//   }

//   *(leaf_node_num_cells(node)) += 1;
//   *(leaf_node_key(node, cursor->cell_num)) = key;
//   serialize_row(value, leaf_node_value(node, cursor->cell_num));
// }

const leaf_node_insert = async (buffer, cell_num, key, value, table) => {
  const num_cells = leaf_node_num_cells(buffer).read();

  if (num_cells >= LEAF_NODE_MAX_CELLS) {
    // Node full
    await leaf_node_split_and_insert(buffer, cell_num, key, value, table)

    return
  }

  if (cell_num < num_cells) {
    // Make room for new cell
    for (let i = num_cells; i > cell_num; i--) {
      leaf_node_cell(buffer, i).read().set(leaf_node_cell(buffer, i - 1).read())
    }
  }

  leaf_node_num_cells(buffer).write(num_cells + 1)
  leaf_node_key(buffer, cell_num).write(key)
  leaf_node_value(buffer, cell_num).write(value)
}

// Cursor* leaf_node_find(Table* table, uint32_t page_num, uint32_t key) {
//   void* node = get_page(table->pager, page_num);
//   uint32_t num_cells = *leaf_node_num_cells(node);

//   Cursor* cursor = malloc(sizeof(Cursor));
//   cursor->table = table;
//   cursor->page_num = page_num;

//   // Binary search
//   uint32_t min_index = 0;
//   uint32_t one_past_max_index = num_cells;
//   while (one_past_max_index != min_index) {
//     uint32_t index = (min_index + one_past_max_index) / 2;
//     uint32_t key_at_index = *leaf_node_key(node, index);
//     if (key == key_at_index) {
//       cursor->cell_num = index;
//       return cursor;
//     }
//     if (key < key_at_index) {
//       one_past_max_index = index;
//     } else {
//       min_index = index + 1;
//     }
//   }

//   cursor->cell_num = min_index;
//   return cursor;
// }

const leaf_node_find = (buffer, pn, key) => {
  const num_cells = leaf_node_num_cells(buffer).read()

  let i = 0
  let j = num_cells - 1

  // binary search to find the pos whose key is greater than or equal to the key
  while (i <= j) {
    const m = Math.floor((i + j) / 2)
    const k = leaf_node_key(buffer, m).read()

    if (key === k) {
      i = m
      break
    } else if (key < k) {
      j = m - 1
    } else {
      i = m + 1
    }
  }

  return { pn, cell: i }
}

// NodeType get_node_type(void* node) {
//   uint8_t value = *((uint8_t*)(node + NODE_TYPE_OFFSET));
//   return (NodeType)value;
// }

// void set_node_type(void* node, NodeType type) {
//   uint8_t value = type;
//   *((uint8_t*)(node + NODE_TYPE_OFFSET)) = value;
// }

const node_type = buffer => {
  const offset = NODE_TYPE_OFFSET

  return {
    read: () => buffer.readUInt8(offset),
    write: (value) => buffer.writeUint8(value, offset),
  }
}

// const uint32_t LEAF_NODE_RIGHT_SPLIT_COUNT = (LEAF_NODE_MAX_CELLS + 1) / 2;
// const uint32_t LEAF_NODE_LEFT_SPLIT_COUNT =
//     (LEAF_NODE_MAX_CELLS + 1) - LEAF_NODE_RIGHT_SPLIT_COUNT;

const LEAF_NODE_RIGHT_SPLIT_COUNT = Math.floor((LEAF_NODE_MAX_CELLS + 1) / 2)
const LEAF_NODE_LEFT_SPLIT_COUNT = (LEAF_NODE_MAX_CELLS + 1) - LEAF_NODE_RIGHT_SPLIT_COUNT

// void leaf_node_split_and_insert(Cursor* cursor, uint32_t key, Row* value) {
//   /*
//   Create a new node and move half the cells over.
//   Insert the new value in one of the two nodes.
//   Update parent or create a new parent.
//   */

//   void* old_node = get_page(cursor->table->pager, cursor->page_num);
//   uint32_t new_page_num = get_unused_page_num(cursor->table->pager);
//   void* new_node = get_page(cursor->table->pager, new_page_num);
//   initialize_leaf_node(new_node);
//   leaf_node_next_leaf(new_node) = *leaf_node_next_leaf(old_node);
//   leaf_node_next_leaf(old_node) = new_page_num;

//   /*
//   All existing keys plus new key should be divided
//   evenly between old (left) and new (right) nodes.
//   Starting from the right, move each key to correct position.
//   */
//   for (int32_t i = LEAF_NODE_MAX_CELLS; i >= 0; i--) {
//     void* destination_node;
//     if (i >= LEAF_NODE_LEFT_SPLIT_COUNT) {
//       destination_node = new_node;
//     } else {
//       destination_node = old_node;
//     }
//     uint32_t index_within_node = i % LEAF_NODE_LEFT_SPLIT_COUNT;
//     void* destination = leaf_node_cell(destination_node, index_within_node);

//     if (i == cursor->cell_num) {
//       serialize_row(value, destination);
//     } else if (i > cursor->cell_num) {
//       memcpy(destination, leaf_node_cell(old_node, i - 1), LEAF_NODE_CELL_SIZE);
//     } else {
//       memcpy(destination, leaf_node_cell(old_node, i), LEAF_NODE_CELL_SIZE);
//     }
//   }

//   /* Update cell count on both leaf nodes */
//   *(leaf_node_num_cells(old_node)) = LEAF_NODE_LEFT_SPLIT_COUNT;
//   *(leaf_node_num_cells(new_node)) = LEAF_NODE_RIGHT_SPLIT_COUNT;

//   if (is_node_root(old_node)) {
//     return create_new_root(cursor->table, new_page_num);
//   } else {
//     printf("Need to implement updating parent after split\n");
//     exit(EXIT_FAILURE);
//   }
// }

const leaf_node_split_and_insert = async (buffer, cell_num, key, value, table) => {
  const old_node = buffer
  const new_page_num = get_unused_page_num(table.pager)
  const new_node = await table.pager.page(new_page_num)
  initialize_leaf_node(new_node)
  leaf_node_next_leaf(new_node).write(leaf_node_next_leaf(old_node).read())
  leaf_node_next_leaf(old_node).write(new_page_num)

  // All existing keys plus new key should be divided
  // evenly between old (left) and new (right) nodes.
  // Starting from the right, move each key to correct position.
  for (let i = LEAF_NODE_MAX_CELLS; i >= 0; i--) {
    const destination_node = i >= LEAF_NODE_LEFT_SPLIT_COUNT ? new_node : old_node
    const index_within_node = i % LEAF_NODE_LEFT_SPLIT_COUNT
    const destination = leaf_node_cell(destination_node, index_within_node).read()

    if (i == cell_num) {
      // copy key and value
      leaf_node_key(destination_node, index_within_node).write(key)
      leaf_node_value(destination_node, index_within_node).write(value)
    } else if (i > cell_num) {
      leaf_node_cell(old_node, i - 1).read().copy(destination)
    } else {
      leaf_node_cell(old_node, i).read().copy(destination)
    }
  }

  // Update cell count on both leaf nodes
  leaf_node_num_cells(old_node).write(LEAF_NODE_LEFT_SPLIT_COUNT)
  leaf_node_num_cells(new_node).write(LEAF_NODE_RIGHT_SPLIT_COUNT)

  if (node_root(old_node).read()) {
    await create_new_root(table, new_page_num)

    return
  }

  throw Error('Need to implement updating parent after split')
}

/*
Until we start recycling free pages, new pages will always
go onto the end of the database file
*/
// uint32_t get_unused_page_num(Pager* pager) { return pager->num_pages; }

const get_unused_page_num = pager => {
  return pager.num_pages
}

// void create_new_root(Table* table, uint32_t right_child_page_num) {
//   /*
//   Handle splitting the root.
//   Old root copied to new page, becomes left child.
//   Address of right child passed in.
//   Re-initialize root page to contain the new root node.
//   New root node points to two children.
//   */

//   void* root = get_page(table->pager, table->root_page_num);
//   void* right_child = get_page(table->pager, right_child_page_num);
//   uint32_t left_child_page_num = get_unused_page_num(table->pager);
//   void* left_child = get_page(table->pager, left_child_page_num);
//   /* Left child has data copied from old root */
//   memcpy(left_child, root, PAGE_SIZE);
//   set_node_root(left_child, false);
//   /* Root node is a new internal node with one key and two children */
//   initialize_internal_node(root);
//   set_node_root(root, true);
//   *internal_node_num_keys(root) = 1;
//   *internal_node_child(root, 0) = left_child_page_num;
//   uint32_t left_child_max_key = get_node_max_key(left_child);
//   *internal_node_key(root, 0) = left_child_max_key;
//   *internal_node_right_child(root) = right_child_page_num;
// }

const create_new_root = async (table, right_child_page_num) => {
  const root = await table.pager.page(table.root_page_num)
  const left_child_page_num = get_unused_page_num(table.pager)
  // /* const right_child = */ await table.pager.page(right_child_page_num);
  const left_child = await table.pager.page(left_child_page_num)
  // Left child has data copied from old root
  root.copy(left_child)
  node_root(left_child).write(0)

  // Root node is a new internal node with one key and two children
  initialize_internal_node(root)
  node_root(root).write(1)
  internal_node_num_keys(root).write(1)
  internal_node_child(root, 0).write(left_child_page_num)
  const left_child_max_key = get_node_max_key(left_child)
  internal_node_key(root, 0).write(left_child_max_key)
  internal_node_right_child(root).write(right_child_page_num)
}

// void initialize_internal_node(void* node) {
//   set_node_type(node, NODE_INTERNAL);
//   set_node_root(node, false);
//   *internal_node_num_keys(node) = 0;
// }

const initialize_internal_node = (buffer) => {
  node_type(buffer).write(NodeType.NODE_INTERNAL)
  node_root(buffer).write(0)
  internal_node_num_keys(buffer).write(0)
}

/*
+ * Internal Node Header Layout
+ */
// const uint32_t INTERNAL_NODE_NUM_KEYS_SIZE = sizeof(uint32_t);
// const uint32_t INTERNAL_NODE_NUM_KEYS_OFFSET = COMMON_NODE_HEADER_SIZE;
// const uint32_t INTERNAL_NODE_RIGHT_CHILD_SIZE = sizeof(uint32_t);
// const uint32_t INTERNAL_NODE_RIGHT_CHILD_OFFSET = INTERNAL_NODE_NUM_KEYS_OFFSET + INTERNAL_NODE_NUM_KEYS_SIZE;
// const uint32_t INTERNAL_NODE_HEADER_SIZE = COMMON_NODE_HEADER_SIZE + INTERNAL_NODE_NUM_KEYS_SIZE + INTERNAL_NODE_RIGHT_CHILD_SIZE;

const INTERNAL_NODE_NUM_KEYS_SIZE = 4
const INTERNAL_NODE_NUM_KEYS_OFFSET = COMMON_NODE_HEADER_SIZE
const INTERNAL_NODE_RIGHT_CHILD_SIZE = 4
const INTERNAL_NODE_RIGHT_CHILD_OFFSET = INTERNAL_NODE_NUM_KEYS_OFFSET + INTERNAL_NODE_NUM_KEYS_SIZE
const INTERNAL_NODE_HEADER_SIZE = COMMON_NODE_HEADER_SIZE + INTERNAL_NODE_NUM_KEYS_SIZE + INTERNAL_NODE_RIGHT_CHILD_SIZE

/*
 * Internal Node Body Layout
 */
// const uint32_t INTERNAL_NODE_KEY_SIZE = sizeof(uint32_t);
// const uint32_t INTERNAL_NODE_CHILD_SIZE = sizeof(uint32_t);
// const uint32_t INTERNAL_NODE_CELL_SIZE = INTERNAL_NODE_CHILD_SIZE + INTERNAL_NODE_KEY_SIZE;

const INTERNAL_NODE_KEY_SIZE = 4;
const INTERNAL_NODE_CHILD_SIZE = 4;
const INTERNAL_NODE_CELL_SIZE = INTERNAL_NODE_CHILD_SIZE + INTERNAL_NODE_KEY_SIZE;

// uint32_t* internal_node_num_keys(void* node) {
//   return node + INTERNAL_NODE_NUM_KEYS_OFFSET;
// }

const internal_node_num_keys = (buffer) => {
  assert(buffer.length === PAGE_SIZE, `buffer.length: ${buffer.length}`)

  const offset = INTERNAL_NODE_NUM_KEYS_OFFSET
  
  return {
    read: () => buffer.readUInt32LE(offset),
    write: (value) => buffer.writeUInt32LE(value, offset),
  }
}

// uint32_t* internal_node_right_child(void* node) {
//   return node + INTERNAL_NODE_RIGHT_CHILD_OFFSET;
// }

const internal_node_right_child = (buffer) => {
  assert(buffer.length === PAGE_SIZE, `buffer.length: ${buffer.length}`)

  const offset = INTERNAL_NODE_RIGHT_CHILD_OFFSET

  return {
    read: () => buffer.readUInt32LE(offset),
    write: (value) => buffer.writeUInt32LE(value, offset),
  }
}

// uint32_t* internal_node_cell(void* node, uint32_t cell_num) {
//   return node + INTERNAL_NODE_HEADER_SIZE + cell_num * INTERNAL_NODE_CELL_SIZE;
// }

const internal_node_cell = (buffer, cell_num) => {
  assert(buffer.length === PAGE_SIZE, `buffer.length: ${buffer.length}`)

  const offset = INTERNAL_NODE_HEADER_SIZE + cell_num * INTERNAL_NODE_CELL_SIZE

  return {
    read: () => buffer.readUInt32LE(offset),
    write: (value) => buffer.writeUInt32LE(value, offset),
  }
}

// uint32_t* internal_node_child(void* node, uint32_t child_num) {
//   uint32_t num_keys = *internal_node_num_keys(node);
//   if (child_num > num_keys) {
//     printf("Tried to access child_num %d > num_keys %d\n", child_num, num_keys);
//     exit(EXIT_FAILURE);
//   } else if (child_num == num_keys) {
//     return internal_node_right_child(node);
//   } else {
//     return internal_node_cell(node, child_num);
//   }
// }

const internal_node_child = (buffer, child_num) => {
  const num_keys = internal_node_num_keys(buffer).read()

  assert(child_num <= num_keys, `child_num: ${child_num} > num_keys: ${num_keys}`)

  if (child_num == num_keys) {
    return internal_node_right_child(buffer)
  }

  return internal_node_cell(buffer, child_num)
}

// uint32_t* internal_node_key(void* node, uint32_t key_num) {
//   return internal_node_cell(node, key_num) + INTERNAL_NODE_CHILD_SIZE;
// }

const internal_node_key = (buffer, key_num) => {
  assert(buffer.length === PAGE_SIZE, `buffer.length: ${buffer.length}`)

  const offset = INTERNAL_NODE_HEADER_SIZE + key_num * INTERNAL_NODE_CELL_SIZE + INTERNAL_NODE_CHILD_SIZE

  return {
    read: () => buffer.readUInt32LE(offset),
    write: (value) => buffer.writeUInt32LE(value, offset),
  }
}

// uint32_t get_node_max_key(void* node) {
//   switch (get_node_type(node)) {
//     case NODE_INTERNAL:
//       return *internal_node_key(node, *internal_node_num_keys(node) - 1);
//     case NODE_LEAF:
//       return *leaf_node_key(node, *leaf_node_num_cells(node) - 1);
//   }
// }

const get_node_max_key = (buffer) => {
  const type = node_type(buffer).read()

  switch (type) {
    case NodeType.NODE_INTERNAL:
      return internal_node_key(buffer, internal_node_num_keys(buffer).read() - 1).read()
    case NodeType.NODE_LEAF:
      return leaf_node_key(buffer, leaf_node_num_cells(buffer).read() - 1).read()
  }
}

// bool is_node_root(void* node) {
//   uint8_t value = *((uint8_t*)(node + IS_ROOT_OFFSET));
//   return (bool)value;
// }

// void set_node_root(void* node, bool is_root) {
//   uint8_t value = is_root;
//   *((uint8_t*)(node + IS_ROOT_OFFSET)) = value;
// }

const node_root = (buffer) => {
  assert(buffer.length === PAGE_SIZE, `buffer.length: ${buffer.length}`)

  const offset = IS_ROOT_OFFSET

  return {
    read: () => buffer.readUInt8(offset),
    write: (value) => buffer.writeUInt8(value, offset),
  }
}

// Cursor* internal_node_find(Table* table, uint32_t page_num, uint32_t key) {
//   void* node = get_page(table->pager, page_num);
//   uint32_t num_keys = *internal_node_num_keys(node);

//   /* Binary search to find index of child to search */
//   uint32_t min_index = 0;
//   uint32_t max_index = num_keys; /* there is one more child than key */

//   while (min_index != max_index) {
//     uint32_t index = (min_index + max_index) / 2;
//     uint32_t key_to_right = *internal_node_key(node, index);
//     if (key_to_right >= key) {
//       max_index = index;
//     } else {
//       min_index = index + 1;
//     }
//   }

//   uint32_t child_num = *internal_node_child(node, min_index);
//   void* child = get_page(table->pager, child_num);
//   switch (get_node_type(child)) {
//     case NODE_LEAF:
//       return leaf_node_find(table, child_num, key);
//     case NODE_INTERNAL:
//       return internal_node_find(table, child_num, key);
//   }
// }

const internal_node_find = async (buffer, key, pager) => {
  const num_keys = internal_node_num_keys(buffer).read()

  let i = 0
  let j = num_keys - 1

  while (i <= j) {
    const m = Math.floor((i + j) / 2)
    const k = internal_node_key(buffer, m).read()

    if (key === k) {
      i = m
      break
    } else if (key < k) {
      j = m - 1
    } else {
      i = m + 1
    }
  }

  const child_num = internal_node_child(buffer, i).read()
  const node = await pager.page(child_num)

  switch (node_type(node).read()) {
    case NodeType.NODE_LEAF:
      return leaf_node_find(node, child_num, key)
    case NodeType.NODE_INTERNAL:
      return internal_node_find(node, key, pager)
  }
}

module.exports = {
  ROW_SIZE,
  PAGE_SIZE,
  NodeType,
  LEAF_NODE_MAX_CELLS,
  leaf_node_num_cells,
  leaf_node_next_leaf,
  leaf_node_cell,
  leaf_node_key,
  leaf_node_value,
  print_constants,
  print_tree,
  initialize_leaf_node,
  leaf_node_insert,
  leaf_node_find,
  node_type,
  internal_node_find,
}
