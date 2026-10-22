## 为什么需要它 {#why}

最便宜的商品是哪件？

## 核心概念 {#core}

`ORDER BY` 决定结果的顺序。MySQL 也这样写。

```check
query: |
  SELECT name FROM items ORDER BY price;
question: 这条查询返回几行？排序会不会改变行数？先想一想排序和筛选的区别，再想一想这张表里一共有几件商品，最后再回答。
choices: ['1', '5']
answer: 1
explain: 五行。排序只改变行的先后顺序，不会增加，也不会减少任何一行；要减少行数，需要用条件筛选或者限制行数的写法，这是两件完全不同的事情。
verify: { rows: 5 }
```

## 示例 {#example}

```steps
- sql: |
    SELECT name, category FROM items;
  say: 先看原来的顺序。
- sql: |
    SELECT name, category FROM items ORDER BY category NULLS FIRST;
  say: 空值排在最前面。
```

## 深入 {#deeper}

排序默认是升序。降序要在列的后面写上关键字。空值在升序里默认排在最后，在降序里默认排在最前。想改变空值的位置，可以单独写出来。下一篇会讲怎样只取前几行。

## 常见错误 {#mistakes}

**1. 忘了写 `BY`。** 会报语法错误。

**2. 以为不写 `ORDER BY` 也有固定顺序。** 没有。

**3. 把 `ORDER BY` 写在 `WHERE` 前面。** 顺序反了。

## 小结 {#summary}

- `ORDER BY` 决定顺序。
