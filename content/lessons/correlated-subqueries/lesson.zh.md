## 为什么需要它 {#why}

前两篇的子查询大多只算一次：“全部商品的平均价”对每件商品都一样。可是很多问题的比较对象**随着行而变**：

- 哪些商品比**它自己所在分类**的平均价贵？
- 每位顾客**自己**最近一笔订单是什么时候？

书的平均价和电子产品的平均价不一样，每位顾客的最近订单也不一样。子查询需要知道“外面现在是哪一行”。

## 核心概念 {#core}

{{Term:correlated-subquery}}是引用了{{term:outer-query}}的列的子查询。上一篇的 `EXISTS` 已经是这样：子查询里的 `o.customer_id = c.id`，`c` 来自外层。

```sql run
SELECT p.name, p.category_id, p.price
FROM products AS p
WHERE p.price > (
  SELECT avg(p2.price)
  FROM products AS p2
  WHERE p2.category_id = p.category_id
)
ORDER BY p.category_id, p.price;
```

逻辑上可以这样理解：外层每处理一行商品 `p`，就把 `p.category_id` 代进子查询，算出这一类的平均价，再拿 `p.price` 去比。子查询对每一行**重新计算**，因为它依赖当前行。

两个别名 `p` 和 `p2` 是关键：它们是同一张表的两种角色，`p` 是正在判断的那件商品，`p2` 是用来求平均的同类商品。这和自连接的思路一样。

Gift Card 不在结果里：它的 `category_id` 是 NULL，`p2.category_id = NULL` 找不到任何行，平均价是 NULL，比较结果是 unknown。

## 语法 {#syntax}

关联子查询没有新的关键字。它和普通子查询的区别只有一处：子查询的 `WHERE` 里用到了外层的别名。最常见的形状是：

```syntax
SELECT select_list
FROM table_name AS outer_alias
WHERE expression comparison_operator (
    SELECT aggregate_function
    FROM table_name AS inner_alias
    WHERE inner_alias.column_name = outer_alias.column_name
)
```

| 部分 | 填什么 | 说明 |
|---|---|---|
| `outer_alias` | 外层表的别名，比如 `p` | 代表“正在判断的那一行” |
| `inner_alias` | 子查询里表的别名，比如 `p2` | 代表“拿来比较的那些行”；同一张表时必须和外层不同 |
| `aggregate_function` | `avg(p2.price)`、`max(o2.ordered_at)`、`count(*)` 等 | 保证子查询只返回一个值 |
| 关联条件 | `inner_alias.column_name = outer_alias.column_name` | 把外层当前行的值代进子查询 |

数据库按下面的规则找一个列名属于哪张表，这决定了写不写别名会有什么后果：

| 写法 | 指向 |
|---|---|
| `p2.category_id` | 别名 `p2` 那张表的列 |
| `p.category_id`（在子查询里） | 外层别名 `p` 那张表的列 |
| 只写 `category_id` | 由内往外找，先找子查询自己的 `FROM`；那里有这一列，就不会再去外层找 |

这一课的子查询，和上一篇的 `EXISTS`、上上篇的标量子查询，格式都一样；放在 `SELECT` 里、`WHERE` 里，规则也一样。

对照格式读核心概念里的查询：外层别名 `p`，内层别名 `p2`，`aggregate_function` 是 `avg(p2.price)`，关联条件是 `p2.category_id = p.category_id`。

## 示例 {#example}

问题：每位顾客最近一笔订单是哪一笔？

1. **先写“某一位顾客”的答案。** 顾客 1 最近的下单时间：`SELECT max(ordered_at) FROM orders WHERE customer_id = 1`。
2. **把固定的 1 换成外层的当前行。** 外层读 `orders AS o`，子查询读 `orders AS o2`，条件改成 `o2.customer_id = o.customer_id`。
3. **用它来筛选外层。** 只留下下单时间等于“这位顾客最近时间”的订单。

```sql run
SELECT o.customer_id, o.id, o.ordered_at
FROM orders AS o
WHERE o.ordered_at = (
  SELECT max(o2.ordered_at)
  FROM orders AS o2
  WHERE o2.customer_id = o.customer_id
)
ORDER BY o.customer_id;
```

10 行，每位下过单的顾客一行。这是一个经典问题，叫“每组取最大的那一行”：`GROUP BY` 只能给出最大的时间，给不出那一行的订单编号；关联子查询可以。

先写一个固定值的版本，确认它对，再换成关联，是写关联子查询最稳的办法。

## 变体 {#variants}

**放在 `SELECT` 里，每行算一个值。** 每位顾客最近的下单时间，没下过单的显示 NULL：

```sql run
SELECT c.name,
       (SELECT max(o.ordered_at) FROM orders AS o WHERE o.customer_id = c.id) AS last_order
FROM customers AS c
ORDER BY c.id;
```

**计数时，0 会自然出现。** 关联的 `count(*)` 对没有订单的顾客返回 0，不需要第 4 章的 `LEFT JOIN` 加 `count(o.id)`：

```sql run
SELECT c.name,
       (SELECT count(*) FROM orders AS o WHERE o.customer_id = c.id) AS orders
FROM customers AS c
ORDER BY c.id;
```

**和同类比较时，把参照值一起显示。** 每件商品和它所在分类的平均价：

```sql run
SELECT p.name, p.price,
       (SELECT round(avg(p2.price), 2) FROM products AS p2
        WHERE p2.category_id = p.category_id) AS category_avg
FROM products AS p
ORDER BY p.id;
```

## 深入 {#deeper}

**关联子查询能改写成连接。** “比所在分类平均价贵”也可以先用派生表算出每个分类的平均价，再连接比较。两种写法结果相同；关联子查询更贴近问题的说法，连接加派生表在分组很多时往往更容易被优化。PostgreSQL 的优化器会把一部分关联子查询自动改写成连接，所以“每行执行一次”是理解它的方式，不一定是真实的执行方式。

**`SELECT` 里的关联子查询也必须只返回一个值。** 下面的子查询对有多笔订单的顾客返回多行，报错：

```sql run error
SELECT c.name,
       (SELECT o.id FROM orders AS o WHERE o.customer_id = c.id) AS order_id
FROM customers AS c;
```

要么聚合成一个值（`max`、`count`），要么改用连接。

**`LATERAL`：能返回多行的关联子查询。** 普通的派生表看不到它左边的表；在前面加上 `LATERAL`，它就能引用左边的列，对左边的每一行各执行一次，返回多少行都行。每位顾客最近的 2 笔订单：

```sql run
SELECT c.name, r.id AS order_id, r.ordered_at
FROM customers AS c
CROSS JOIN LATERAL (
  SELECT o.id, o.ordered_at
  FROM orders AS o
  WHERE o.customer_id = c.id
  ORDER BY o.ordered_at DESC
  LIMIT 2
) AS r
ORDER BY c.id, r.ordered_at DESC;
```

子查询里的 `c.id` 来自左边的 `customers`。`LATERAL` 是标准 SQL，PostgreSQL 和 MySQL 8 支持，SQLite 不支持；SQL Server 里类似的写法叫 `CROSS APPLY`。用 `CROSS JOIN LATERAL` 时，没下过单的顾客会消失，要保留就写 `LEFT JOIN LATERAL (…) AS r ON true`。

## 常见错误 {#mistakes}

**1. 忘了关联，和全体比较。** 子查询里没有引用外层：`WHERE p.price > (SELECT avg(price) FROM products)`，比的就是全部商品的平均价，而不是同类的。

**2. 不加别名，条件悄悄变成“自己等于自己”。**

```sql run
SELECT p.name, p.price
FROM products AS p
WHERE p.price > (
  SELECT avg(price) FROM products WHERE category_id = category_id
);
```

只有 3 行，和全体平均的结果一样。子查询里的 `category_id` 两边都指向**子查询自己的** `products`，因为最近的表优先；`category_id = category_id` 对每一行都成立。给内外两个 `products` 各起别名，并在条件里写清楚 `p2.category_id = p.category_id`。

**3. `SELECT` 里的关联子查询返回了多行。** 见“深入”：报 `more than one row returned by a subquery`。

**4. 以为关联子查询的 `sum` 对“没有”返回 0。** `count(*)` 返回 0，`sum` 却返回 NULL。需要 0 就用 `COALESCE`，第 3 章讲过。

**5. 取每组最大的那一行时，忘了并列。** 如果一位顾客在同一时刻下了两笔订单，`ordered_at = max(...)` 会返回两行。这不是错，但要知道它会发生；需要严格一行时，用第 6 章的窗口函数。

## 小结 {#summary}

- 关联子查询引用了外层的列，逻辑上对外层的每一行重新计算一次。
- 用两个别名区分同一张表的两种角色，例如 `p` 和 `p2`。
- 适合“和同类比较”“每组取最大的那一行”“每行算一个汇总值”。
- 不加别名时，未限定的列指向最近的表，关联条件会悄悄变成恒真。
- 先用固定值写出一行的答案，再把固定值换成外层的列。
