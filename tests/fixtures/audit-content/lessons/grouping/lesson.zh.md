## 为什么需要它 {#why}

第 0 章筛出了便宜的商品。可是“每个分类各有几件商品”这样的问题，要先把{{term:row}}分成组。

## 核心概念 {#core}

`GROUP BY` 把某一列（或某个{{term:expression}}）取值相同的行放进同一组，每组只输出一行。{{term:aggregate-function}} `count(*)` 在每组里分别计数。分组之后，`SELECT` 里只能放分组用的列和聚合结果：每组只剩一行，而其他列在组里可能有好几个不同的值，数据库无法替你挑出其中一个。

```sql run
SELECT price > 50 AS pricey, count(*) AS n FROM items GROUP BY price > 50;
```

```check
query: |
  SELECT price > 50 AS pricey, count(*) AS n FROM items GROUP BY price > 50;
question: 这条查询返回几行？
choices: ['1', '2', '5']
answer: 1
explain: 价格只分成高于 50 和不高于 50 两种，所以是两组。
verify: { rows: 2 }
```

## 示例 {#example}

```steps
- sql: |
    SELECT name, price > 50 AS pricey FROM items;
  say: 先看每一行属于哪一组。
  group: pricey
- sql: |
    SELECT price > 50 AS pricey, count(*) AS n FROM items GROUP BY price > 50;
  say: 分组之后，每组只剩一行。
```

```check
query: |
  SELECT category FROM items GROUP BY category;
question: 这条查询返回几行？
choices: ['2', '3', '5']
answer: 1
explain: 两个分类，加上空值自成的一组，一共三组。
verify: { rows: 3 }
```

## 深入 {#deeper}

所有空值会被分进同一组。MySQL 也是这样。

## 常见错误 {#mistakes}

**1. 在 `SELECT` 里放了没有分组的列。** 数据库会报错。

**2. 以为空值会被丢掉。** 它们自成一组。

## 小结 {#summary}

- `GROUP BY` 让每组输出一行。
- 空值自成一组。

## 参考 {#reference}

SQLite 也把空值放进同一组。
