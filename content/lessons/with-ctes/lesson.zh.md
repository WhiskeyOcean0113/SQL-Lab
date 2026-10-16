## 为什么需要它 {#why}

市场部想知道：哪些顾客的消费总额高于“所有顾客消费总额的平均值”？

第 5 章的{{term:derived-table}}能做到，但每位顾客的消费总额这个中间结果要用两次：一次用来列出顾客，一次用来求平均值。用派生表，同一段二十行的子查询就得原样写两遍，括号一层套一层，读的人要从最里面往外看。

这一篇学一种更好读的写法：先给中间结果起个名字，再像用一张表那样用它。

## 核心概念 {#core}

### 先起名，再使用

`WITH` 子句在主查询之前定义一个或几个有名字的中间结果，每一个叫作一个{{term:cte}}，通常简称 CTE：

```sql run
WITH status_counts AS (
  SELECT status, count(*) AS n
  FROM orders
  GROUP BY status
)
SELECT status, n
FROM status_counts
WHERE n >= 4;
```

`status_counts` 是 CTE 的名字，括号里是它的查询。后面的主查询把 `status_counts` 当作一张表来用：从里面选列、加条件、连接，都和普通的表一样。

### 它只活在一条语句里

CTE 不是一张真正的表。它不写进数据库，也没有人能在别的语句里看到它。这条语句一结束，它就消失了。可以把它看作只属于这一条语句的{{term:derived-table}}，只是有了名字，并且挪到了最前面。

### 从上往下读

一个 `WITH` 里可以定义好几个 CTE，用逗号隔开。后面的 CTE 可以引用前面的，主查询可以引用所有的。于是一条复杂的查询变成了几个按顺序排好的步骤：

1. 第一步算出什么；
2. 第二步在第一步的基础上算出什么；
3. 主查询用这些结果回答问题。

和派生表相比，读的顺序就是执行思路的顺序，不用再从最里层的括号往外拆。

### 一个名字可以用好几次

同一个 CTE 在主查询里可以出现多次，这正是开头那个问题需要的：每位顾客的消费总额，既要逐行列出，又要拿来求平均值。

## 语法 {#syntax}

```syntax
WITH with_query [, …]
select_statement
```

其中每一个 `with_query` 的形状是：

```syntax
cte_name [ ( column_name [, …] ) ] AS ( select_statement )
```

| 部分 | 填什么 | 规则 |
|---|---|---|
| `cte_name` | 给中间结果起的名字 | 在这条语句里当作表名使用；和已有的表同名时，CTE 优先 |
| `column_name` | 给 CTE 的列重新起名 | 可以省略；省略时沿用括号里查询的列名 |
| `AS ( select_statement )` | 一条完整的查询 | 括号不能省；括号里不写分号 |
| `[, …]` | 更多的 `with_query` | 用逗号隔开，`WITH` 只在最前面写一次；后面的可以引用前面的 |
| 最后的 `select_statement` | 主查询 | 必须有；它和 `WITH` 一起才是一条完整的语句 |

整条语句只在主查询之后写一个分号。`WITH … )` 和主查询之间没有分号，因为它们是同一条语句的两个部分。

对照格式读几条：

- 核心概念里的查询：一个 `with_query`，名字 `status_counts`，没有列名列表；主查询 `SELECT status, n FROM status_counts WHERE n >= 4`。
- `WITH t(status, n) AS (SELECT status, count(*) FROM orders GROUP BY status)`：用列名列表给两列起名，括号里的查询就不必再写 `AS`。
- `WITH a AS (…), b AS (… FROM a …) SELECT … FROM b`：两个 `with_query`，`b` 引用了前面的 `a`。

## 示例 {#example}

问题：消费总额高于平均水平的顾客，显示名字和总额，从高到低。取消的订单不算。

1. **第一步，给每位顾客算一个总额。** 连接订单和明细，按顾客分组求和，这一步起名 `customer_totals`。
2. **主查询，把总额和顾客名字连起来。** `customer_totals` 只有 `customer_id`，名字要从 `customers` 里取。
3. **筛选：总额大于所有总额的平均值。** 平均值是对 `customer_totals` 再求一次 `avg`，写成标量子查询；它引用的是同一个 CTE，不用重写。
4. **排序。**

```sql run
WITH customer_totals AS (
  SELECT o.customer_id, sum(i.quantity * i.unit_price) AS total
  FROM orders AS o
  JOIN order_items AS i ON i.order_id = o.id
  WHERE o.status <> 'cancelled'
  GROUP BY o.customer_id
)
SELECT c.name, t.total
FROM customer_totals AS t
JOIN customers AS c ON c.id = t.customer_id
WHERE t.total > (SELECT avg(total) FROM customer_totals)
ORDER BY t.total DESC;
```

10 位顾客有有效订单，平均消费 268.80，高于平均的有 3 位。把同样的逻辑写成派生表，求和那段要写两遍，而且两份必须完全一致；以后改了其中一份、忘了另一份，结果就悄悄错了。

## 变体 {#variants}

**几步接力。** 第二个 CTE 建立在第一个之上。先算每笔订单的金额，再挑出 150 美元以上的大单，最后按顾客汇总：

```sql run
WITH order_totals AS (
  SELECT order_id, sum(quantity * unit_price) AS total
  FROM order_items
  GROUP BY order_id
),
big_orders AS (
  SELECT order_id, total
  FROM order_totals
  WHERE total >= 150
)
SELECT o.customer_id, count(*) AS big_orders, sum(b.total) AS spent
FROM big_orders AS b
JOIN orders AS o ON o.id = b.order_id
GROUP BY o.customer_id
ORDER BY spent DESC;
```

每一步都可以单独拿出来检查：把主查询换成 `SELECT * FROM order_totals`，就能看到第一步的结果。调试长查询时，这是 CTE 最实用的地方。

**用列名列表起名。** 名字后面的括号一次给所有列命名，括号里的查询就不用再写 `AS`：

```sql run
WITH status_counts (status, n) AS (
  SELECT status, count(*) FROM orders GROUP BY status
)
SELECT status, n FROM status_counts ORDER BY n DESC, status;
```

**和外连接一起用。** 先把每种商品卖出的件数汇总好，再用 `LEFT JOIN` 接回商品表，没卖出过的商品显示 0：

```sql run
WITH product_sales AS (
  SELECT product_id, sum(quantity) AS sold
  FROM order_items
  GROUP BY product_id
)
SELECT p.name, coalesce(s.sold, 0) AS sold
FROM products AS p
LEFT JOIN product_sales AS s ON s.product_id = p.id
ORDER BY sold DESC, p.name
LIMIT 5;
```

先汇总、再连接，第 4 章的{{term:fan-trap}}就不会出现：`product_sales` 每种商品只有一行，连接不会放大任何东西。

**找出最大值所在的行。** 用同一个 CTE 既算出每个国家的消费额，又找出最大值：

```sql run
WITH country_spend AS (
  SELECT c.country, sum(i.quantity * i.unit_price) AS spent
  FROM customers AS c
  JOIN orders AS o ON o.customer_id = c.id
  JOIN order_items AS i ON i.order_id = o.id
  WHERE o.status <> 'cancelled'
  GROUP BY c.country
)
SELECT country, spent
FROM country_spend
WHERE spent = (SELECT max(spent) FROM country_spend);
```

## 深入 {#deeper}

**CTE 和派生表，数据库怎么执行？** 从 PostgreSQL 12 开始，一个只被引用一次的 CTE 通常会被“展开”，像派生表一样和主查询一起优化，性能没有区别。被引用两次以上的 CTE 默认只计算一次，结果暂存起来给每一处使用。你可以用 `AS MATERIALIZED` 强制暂存，或用 `AS NOT MATERIALIZED` 强制展开，但很少需要。网上一些较老的文章说“CTE 是优化屏障，会变慢”，那是 PostgreSQL 12 之前的行为。

**CTE 的名字会盖过同名的表。** `WITH orders AS (SELECT 1 AS id) SELECT * FROM orders` 读到的是这个 CTE，不是真正的 `orders` 表。不会报错，所以起名时避开已有的表名。

**后面的才能引用前面的。** 普通的 CTE 只能引用写在它前面的 CTE。下面的 `a` 引用了写在后面的 `b`：

```sql run error
WITH a AS (SELECT * FROM b),
     b AS (SELECT 1 AS x)
SELECT * FROM a;
```

错误是 `relation "b" does not exist`，DETAIL 说明有一个叫 `b` 的 CTE，但从这里引用不到。把两个 CTE 换个顺序就好了。错误的 HINT 里提到的 `WITH RECURSIVE` 是下一篇的内容。

**修改数据的语句也可以带 `WITH`。** `WITH` 后面的主语句除了 `SELECT`，还可以是 `INSERT`、`UPDATE`、`DELETE`，第 7 章会用到。

**其他数据库。** `WITH` 是标准 SQL，MySQL 8.0、SQLite 3.8.3、SQL Server、Oracle 都支持。SQL Server 要求 `WITH` 之前的语句以分号结束，所以你会在那里看到 `;WITH` 这种写法。

## 常见错误 {#mistakes}

**1. 每个 CTE 前面都写 `WITH`。** `WITH` 只写一次，后面的 CTE 用逗号接上：

```sql run error
WITH a AS (SELECT 1 AS x),
WITH b AS (SELECT 2 AS y)
SELECT * FROM a, b;
```

`syntax error at or near "WITH"`。删掉第二个 `WITH`，保留逗号。反过来，漏掉逗号会报 `syntax error at or near "b"`。

**2. 在 CTE 后面加了分号。**

```sql run error
WITH a AS (SELECT 1 AS x);
SELECT * FROM a;
```

`syntax error at or near ";"`。分号结束了整条语句，而一条只有 `WITH`、没有主查询的语句是不完整的。分号只写在主查询的末尾。

**3. 在下一条语句里使用 CTE。** CTE 只在定义它的那一条语句里有效：

```sql run error
WITH t AS (SELECT 1 AS x)
SELECT * FROM t;
SELECT * FROM t;
```

第一条正常，第二条报 `relation "t" does not exist`。需要在多条语句里用同一个结果，就在每条语句里各写一次 `WITH`，或者建一个第 8 章的{{term:view}}。

**4. 只写了 `WITH`，忘了主查询。** 写完 CTE 就运行，会得到 `syntax error at end of input`。CTE 本身不返回任何东西，必须由主查询把它取出来。

**5. 以为 CTE 会自动去掉重复或排好顺序。** CTE 就是一条普通的查询，它的结果和直接运行那条查询完全一样。在 CTE 里写 `ORDER BY` 并不能保证主查询的顺序，最终的顺序只由主查询的 `ORDER BY` 决定。

## 小结 {#summary}

- `WITH name AS (query)` 给一个中间结果起名，主查询像使用表一样使用它。
- 多个 CTE 用逗号隔开，`WITH` 只写一次；后面的可以引用前面的，读起来从上到下。
- 同一个 CTE 可以在主查询里用多次，避免把同一段子查询写两遍。
- CTE 只在一条语句里有效，不会保存；`WITH` 和主查询之间没有分号。
- 在 PostgreSQL 12 及以后，CTE 和派生表的性能通常没有区别，选更好读的那一种。
