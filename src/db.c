#include<stdint.h>
#include "stdio.h"

int main(int argc, char const *argv[])
{
  /* code */

  printf("sizeof(int) = %zu\n", sizeof(int)); // 4
  printf("sizeof(int*) = %zu\n", sizeof(int*)); // 8
  printf("sizeof(uint8_t) = %zu\n", sizeof(uint8_t)); // 1
  printf("sizeof(uint32_t) = %zu\n", sizeof(uint32_t)); // 4

  return 0;
}
