https://github.com/codecrafters-io/build-your-own-x#build-your-own-database

- [C] https://cstack.github.io/db_tutorial/parts/part13.html
- [C#] https://www.codeproject.com/Articles/1029838/Build-Your-Own-Database
- [BTree] https://www.jianshu.com/p/a267c785e122
- [B+ Tree] https://www.guru99.com/introduction-b-plus-tree.html
- https://zhuanlan.zhihu.com/p/149287061

```
Node #7 : 7,7 - 0
Node #13: 3,7 - 1
Leaf #6 : 1=1 2=2 3=3 -- 2
Leaf #3 : 4=4 5=5 6=6 7=7 -- 2
Leaf #9 : 8=8 9=9 10=10 11=11 -- 2
Node #8 : 14 - 1
Leaf #12: 12=12 13=13 14=14 -- 2
Leaf #5 : 15=15 16=16 17=17 -- 2
Node #2 : 20,23,26 - 1
Leaf #11: 18=18 19=19 20=20 -- 2
Leaf #4 : 21=21 22=22 23=23 -- 2
Leaf #10: 24=24 25=25 26=26 -- 2
Leaf #1 : 27=27 28=28 29=29 30=30 -- 2
```

```sh
cp test.db t.db
vim t.db
:%!xxd
rm -rf t.db
```
