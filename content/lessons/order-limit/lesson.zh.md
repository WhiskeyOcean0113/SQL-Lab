## 为什么需要它 {#why}

第 0 章说过，表里的行没有固定顺序。可是很多问题本身就是关于顺序的：“最贵的商品是哪件？”“最近的 5 笔订单是哪些？”“顾客名单按国家排好”。

这些问题要用 `ORDER BY` 排序，再用 `LIMIT` 和 `OFFSET` 取出其中的一段。

## 核心概念 {#core}

`ORDER BY` 后面写排序依据，叫排序键：

```sql run
SELECT name, price
FROM products
ORDER BY price;
```

- 默认是{{term:ascending}}（`ASC`，从小到大）；加上 `DESC` 就是{{term:descending}}。
- 数字按大小，文字按字母顺序，日期按先后。
- 可以写多个排序键，用逗号分隔：先按第一个排，第一个相同时再按第二个排。

`LIMIT n` 只取前 n 行，`OFFSET m` 先跳过 m 行：

```sql run
SELECT name, price
FROM products
ORDER BY price DESC
LIMIT 3;
```

回想逻辑顺序：`ORDER BY` 在 `SELECT` 之后，`LIMIT` 和 `OFFSET` 在最后。所以 `LIMIT` 总是从排好序的结果里取，而 `ORDER BY` 可以使用 `SELECT` 里起的别名。

PostgreSQL 文档特别强调：使用 `LIMIT` 时一定要有能确定唯一顺序的 `ORDER BY`，否则得到的是“查询结果里不可预测的一部分”。

## 语法 {#syntax}

`ORDER BY`、`LIMIT`、`OFFSET` 都写在查询的最后，顺序固定：

```syntax
SELECT select_list
FROM table_name
[ WHERE condition ]
[ ORDER BY expression [ ASC | DESC ] [ NULLS { FIRST | LAST } ] [, …] ]
[ LIMIT { count | ALL } ]
[ OFFSET start ]
```

| 部分 | 填什么 | 能省略吗 |
|---|---|---|
| `expression` | 排序键：列名、`SELECT` 里的别名，或者计算式 | 写了 `ORDER BY` 就至少要有一个 |
| `ASC` / `DESC` | 这个排序键的方向 | 可以，默认 `ASC` |
| `NULLS FIRST` / `NULLS LAST` | 这个排序键里 NULL 排在哪头（见“深入”） | 可以，默认升序时 `NULLS LAST`、降序时 `NULLS FIRST` |
| `[, …]` | 更多排序键，前一个相同时才比较下一个 | 可以 |
| `count` | 最多返回几行；写 `ALL` 表示不限制 | 整个 `LIMIT` 可以不写 |
| `start` | 先跳过几行 | 整个 `OFFSET` 可以不写，默认 0 |

从格式里能看出两件常被忽略的事：

- **`ASC | DESC` 和 `NULLS …` 在 `[, …]` 的里面。** 也就是说，它们属于每一个排序键，而不是整个 `ORDER BY`。`ORDER BY country, name DESC` 里，`DESC` 只管 `name`。
- **`LIMIT` 和 `ORDER BY` 是两个独立的子句。** 格式允许只写 `LIMIT` 不写 `ORDER BY`，语法上没错，结果却不可预测（见“常见错误”第 1 条）。

对照格式读几条：

- `ORDER BY price DESC LIMIT 3`：一个排序键，方向 `DESC`，再取 3 行。
- `ORDER BY country, name`：两个排序键，都省略了方向，都是升序。
- `ORDER BY city NULLS FIRST`：一个排序键，省略了方向，指定了 NULL 的位置。

## 示例 {#example}

问题：把顾客名单按国家排列，同一个国家的顾客按名字排列。

1. **确定主要的排序键。** 国家，升序。
2. **确定国家相同时怎么排。** 名字，升序。
3. **按优先级从左到右写。** `ORDER BY country, name`。

```sql run
SELECT name, country
FROM customers
ORDER BY country, name;
```

China 的三位顾客 Chen Yu、Lin Wei、Zhang Min 按名字排在一起。每个排序键的方向是分开设置的：`ORDER BY country DESC, name` 是国家降序、名字仍然升序。

## 变体 {#variants}

**分页。** 每页显示 5 件商品，按名字排序，第 2 页就是跳过前 5 行、再取 5 行。这种做法叫{{term:pagination}}：

```sql run
SELECT name
FROM products
ORDER BY name
LIMIT 5 OFFSET 5;
```

第 n 页的 `OFFSET` 是 `(n − 1) × 每页行数`。

**按表达式或别名排序。** 排序键可以是计算出来的值：

```sql run
SELECT name, price * stock AS stock_value
FROM products
ORDER BY stock_value DESC
LIMIT 3;
```

**标准写法 `FETCH FIRST`，以及并列。** SQL 标准里，取前几行写作 `FETCH FIRST`，格式是：

```syntax
FETCH FIRST count ROWS { ONLY | WITH TIES }
```

`ONLY` 和 `LIMIT` 一样；`WITH TIES` 会把和最后一行并列的行也一起带上。按国家排序，取前 2 行：

```sql run
SELECT name, country
FROM customers
ORDER BY country
FETCH FIRST 2 ROWS WITH TIES;
```

结果是 3 行：第 2 行是 Canada 的顾客，另一位 Canada 顾客和它并列，也被带上了。换成 `LIMIT 2`，就只剩两行，留下哪位 Canada 顾客是随意的。`WITH TIES` 必须配合 `ORDER BY` 使用，否则无从判断谁和谁并列。

**最近的记录。** 时间也能排序，最新的排在最前用 `DESC`：

```sql run
SELECT id, ordered_at
FROM orders
ORDER BY ordered_at DESC
LIMIT 5;
```

## 深入 {#deeper}

**NULL 排在哪里。** PostgreSQL 把 NULL 当作比任何值都大：升序时排在最后，降序时排在最前。可以用 `NULLS FIRST` 或 `NULLS LAST` 改变：

```sql run
SELECT name, city
FROM customers
ORDER BY city NULLS FIRST;
```

不同数据库的默认规则正好相反：MySQL 和 SQLite 在升序时把 NULL 排在最前。需要确定的位置时，就把 `NULLS FIRST` 或 `NULLS LAST` 写明。

**并列。** 两行的排序键相同时，它们之间的先后是不确定的。按 `city` 排序时，两位 Osaka 的顾客谁先谁后，每次都可能不同。如果顺序对你很重要，就再加一个能区分它们的排序键，比如 `ORDER BY city, name`。用 `id` 作最后一个排序键，能保证顺序完全确定。

**并列和 `LIMIT`。** “价格最高的 3 件商品”在没有并列时没有歧义。但如果第 3 名和第 4 名价格相同，`LIMIT 3` 会随意留下其中一件。SQL 标准的写法 `FETCH FIRST 3 ROWS WITH TIES` 会把并列的都带上；`LIMIT` 本身是 PostgreSQL 和 MySQL 的写法，标准里对应的是 `FETCH FIRST 3 ROWS ONLY`。

**按列的位置排序。** PostgreSQL 允许用数字代表 `SELECT` 列表里的第几列：`ORDER BY 2, 1` 就是先按第二列、再按第一列排序。写起来短，但以后在 `SELECT` 里增删一列，数字指的就变成了另一列，查询照样运行，排序却悄悄错了。本课程不用这种写法。

**`LIMIT ALL`。** `LIMIT ALL` 和不写 `LIMIT` 完全一样。它的用处在程序拼接 SQL 时：“每页多少行”可以填一个具体数字，也可以填 `ALL` 表示不分页，而不必删掉整个子句。

**大的 `OFFSET` 很慢。** 被 `OFFSET` 跳过的行，数据库仍然要先算出来再丢掉。跳过几百万行时，翻页会越来越慢。真实系统里常用“记住上一页最后一行的值，下一页从它之后开始”的方式代替。

## 常见错误 {#mistakes}

**1. 只写 `LIMIT` 不写 `ORDER BY`。** `SELECT name FROM products LIMIT 3` 并不是“前三名”，而是数据库恰好先给出的三行。只要问题里有“最”“前”“最近”，就一定需要 `ORDER BY`。研究发现，漏掉排序相关的列是新手很难自己发现的错误之一。

**2. 排序键的优先级写反。** 想要“按国家排、国家内按名字排”，写成 `ORDER BY name, country` 就变成了主要按名字排：

```sql run
SELECT name, country
FROM customers
ORDER BY name, country;
```

左边的排序键优先。

**3. 以为 `DESC` 作用于所有排序键。** `ORDER BY country, name DESC` 只让 `name` 降序，`country` 仍是升序。每个排序键要分别写方向。

**4. 依赖 NULL 的默认位置。** 换了数据库，NULL 可能跑到另一头去。需要固定位置时写 `NULLS FIRST` / `NULLS LAST`。

**5. 分页时 `OFFSET` 算错。** 第 1 页是 `OFFSET 0`，不是 `OFFSET 1`；`OFFSET 1` 会跳过第一行。

**6. 子句写错了位置。** `ORDER BY` 必须写在 `LIMIT` 前面。写成 `... LIMIT 3 ORDER BY price` 会报 `syntax error at or near "ORDER"`。照着语法格式从上往下写，就不会出错。

## 小结 {#summary}

- `ORDER BY` 默认升序，`DESC` 降序；多个排序键按从左到右的优先级排列，每个键的方向单独设置。
- `LIMIT n` 取前 n 行，`OFFSET m` 跳过 m 行；它们在逻辑顺序的最后执行。
- 用了 `LIMIT` 就一定要有 `ORDER BY`，最好还要能区分并列。
- PostgreSQL 默认把 NULL 排在升序的最后；需要时写 `NULLS FIRST` / `NULLS LAST`。
