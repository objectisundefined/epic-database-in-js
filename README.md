https://github.com/codecrafters-io/build-your-own-x#build-your-own-database

- [C] https://cstack.github.io/db_tutorial/parts/part13.html
- [C#] https://www.codeproject.com/Articles/1029838/Build-Your-Own-Database
- [BTree] https://www.jianshu.com/p/a267c785e122
- [B+ Tree] https://www.guru99.com/introduction-b-plus-tree.html


```sh
insert 1 cstack foo@bar.com
insert 2 voltorb volty@example.com
insert 3 cstack foo@bar.com
insert 4 voltorb volty@example.com
insert 5 cstack foo@bar.com
insert 6 voltorb volty@example.com
insert 7 cstack foo@bar.com
insert 8 voltorb volty@example.com
```

```sh
cp src/fake.db src/t.db
vim src/t.db
:%!xxd
rm -rf src/t.db
```
