## 为什么需要它 {#why}

“每位顾客一共花了多少钱？”答案分散在三张表里：名字在 `customers`，订单属于谁在 `orders`，每行买了什么、多少钱在 `order_items`。

第 3 章的聚合只能汇总一张表，本章的连接能把三张表拼起来。这一篇把两者合在一起：**先连接，再分组汇总**。连接很容易改变行数，所以这里的陷阱也最多。

## 核心概念 {#core}

放回{{term:logical-order}}里看，连接发生在最前面，聚合在后面：

`FROM` + `JOIN` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY`

所以数据库先把几张表拼成一张宽表，`WHERE` 筛掉不要的行，然后才分组。**你汇总的是连接之后的行**，而不是原来某一张表的行。

```sql run
SELECT c.name, sum(i.quantity * i.unit_price) AS spent
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
JOIN order_items AS i ON i.order_id = o.id
WHERE o.status <> 'cancelled'
GROUP BY c.id, c.name
ORDER BY spent DESC;
```

连接之后，每一行是“一位顾客的一笔订单里的一行明细”；按顾客分组，把每组明细的金额加起来。

为什么按 `c.id, c.name` 分组，而不是只按 `c.name`？名字可能重名，主键不会。第 3 章讲过，按主键分组后 PostgreSQL 允许直接选同一张表的其他列；这里把 `c.name` 也写进 `GROUP BY`，在任何数据库里都能运行。

## 语法 {#syntax}

这一课没有新的关键字。把第 3 章和本章的格式拼在一起，就是一条完整的汇总查询的骨架：

```syntax
SELECT select_list
FROM from_item [ [ AS ] alias ]
    [ join_type ] JOIN from_item [ [ AS ] alias ] ON condition
    [ … ]
[ WHERE condition ]
[ GROUP BY grouping_element [, …] ]
[ HAVING condition ]
[ ORDER BY expression [, …] ]
```

`join_type` 是 `INNER`、`LEFT`、`RIGHT` 或 `FULL`，不写就是 `INNER`。各部分的规则都和前面一样，难点在于选对 `select_list` 里的聚合。连接之后，每一行代表什么，决定了该怎么数：

| 想数的是 | 写法 | 原因 |
|---|---|---|
| 连接之后的行 | `count(*)` | 外连接里没配上的行也算一行 |
| 右表真正配上的行 | `count(右表主键)`，如 `count(o.id)` | 没配上时主键是 NULL，不会被数 |
| 被连接放大的“一”那边 | `count(DISTINCT 主键)`，如 `count(DISTINCT o.id)` | 同一笔订单出现多次，只算一次 |
| 明细金额之和 | `sum(i.quantity * i.unit_price)` | 每行明细只出现一次时才准确 |

对照骨架读核心概念里的查询：

- `FROM customers AS c JOIN orders AS o … JOIN order_items AS i …`：三个 `from_item`，两次内连接。
- `WHERE o.status <> 'cancelled'`：连接之后、分组之前筛掉取消的订单。
- `GROUP BY c.id, c.name`：按主键分组，名字一起写进来以便显示。
- `sum(i.quantity * i.unit_price)`：每一行是一条明细，求和不会重复计算。

## 示例 {#example}

问题：每位顾客下过几笔订单？没下过单的顾客也要列出，显示 0。

1. **要保留所有顾客。** 用上一篇的 `LEFT JOIN orders`。
2. **按顾客分组。** `GROUP BY c.id, c.name`。
3. **选对计数方式。** 没下过单的顾客在连接后仍有**一行**，只是订单一侧全是 NULL。`count(*)` 会把这一行数成 1；`count(o.id)` 跳过 NULL，数出 0。

```sql run
SELECT c.name, count(o.id) AS orders, count(*) AS rows_in_group
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
GROUP BY c.id, c.name
ORDER BY c.id;
```

看最后两行：Lucas Silva 和 Mei Tanaka 的 `orders` 是 0，`rows_in_group` 却是 1。外连接配合计数时，要数右表里一个不会为 NULL 的列，通常是它的主键。

## 变体 {#variants}

**每笔订单的总金额，包括没有明细的订单。** 订单 24 还没有任何明细。`LEFT JOIN` 保留它，`COALESCE` 把空的和换成 0：

```sql run
SELECT o.id, COALESCE(sum(i.quantity * i.unit_price), 0) AS total
FROM orders AS o
LEFT JOIN order_items AS i ON i.order_id = o.id
WHERE o.status = 'pending'
GROUP BY o.id
ORDER BY o.id;
```

**按分类统计销售额。** 明细连到商品，商品再连到分类。Gift Card 没有分类，用 `LEFT JOIN categories` 保留它的销售额，它会成为分类为 NULL 的一组：

```sql run
SELECT cat.name AS category, sum(i.quantity * i.unit_price) AS revenue
FROM order_items AS i
JOIN products AS p ON p.id = i.product_id
LEFT JOIN categories AS cat ON cat.id = p.category_id
GROUP BY cat.id, cat.name
ORDER BY revenue DESC;
```

**每个月的订单数，包括没有订单的月份。** 用上一课的日历做左表，订单做右表，连接条件是“下单时间落在这个月里”：

```sql run
SELECT m.month::date AS month, count(o.id) AS orders
FROM generate_series(TIMESTAMP '2024-01-01', TIMESTAMP '2024-08-01', INTERVAL '1 month') AS m(month)
LEFT JOIN orders AS o
  ON o.ordered_at >= m.month AND o.ordered_at < m.month + INTERVAL '1 month'
GROUP BY m.month
ORDER BY m.month;
```

7 月和 8 月显示 0。只对 `orders` 做 `GROUP BY date_trunc('month', ordered_at)`，这两个月根本不会出现。连接条件不一定是“等于”，任何条件都可以，这里是一个范围。

**按国家同时数订单和金额。** 金额要加每一行明细，订单数却不能数明细行，要用 `count(DISTINCT o.id)`：

```sql run
SELECT c.country, count(DISTINCT o.id) AS orders,
       sum(i.quantity * i.unit_price) AS revenue
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
JOIN order_items AS i ON i.order_id = o.id
GROUP BY c.country
ORDER BY revenue DESC;
```

## 深入 {#deeper}

**连接会放大“一”那一边。** 一笔订单有好几行明细，连上 `order_items` 之后，这笔订单就重复出现了好几次。这时再数订单，数到的其实是明细：

```sql run
SELECT c.name, count(*) AS line_rows, count(DISTINCT o.id) AS orders
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
JOIN order_items AS i ON i.order_id = o.id
GROUP BY c.id, c.name
ORDER BY c.id;
```

Lin Wei 有 4 笔订单、10 行明细，`count(*)` 是 10。注意 Kenji Sato 的订单数是 2 而不是 3：订单 24 没有明细，被内连接丢掉了。

**两条独立的一对多会互相相乘。** 同时把推荐人连上自己的订单和自己推荐的顾客：

```sql run
SELECT r.name, count(*) AS rows_in_group,
       count(DISTINCT o.id) AS orders, count(DISTINCT c.id) AS referrals
FROM customers AS r
JOIN orders AS o ON o.customer_id = r.id
JOIN customers AS c ON c.referred_by = r.id
GROUP BY r.id, r.name
ORDER BY r.id;
```

Lin Wei 的 4 笔订单和推荐的 2 位顾客互不相关，连接却把它们两两配对，得到 4 × 2 = 8 行。这在数据建模里叫{{term:fan-trap}}。`count(DISTINCT …)` 能救计数，但救不了 `sum`：如果对每笔订单只存一次的值求和，比如运费，Lin Wei 的每笔订单都会被加两次。可靠的办法是分别汇总每一条一对多，再把汇总结果连起来，这要用到第 5 章的子查询。

**外连接加条件，仍然是“写在 ON 里”。** 想数每位顾客已送达的订单、并保留 0 的顾客，条件要写进 `ON`；写在 `WHERE` 里，没有已送达订单的顾客会整行消失，上一篇讲过原因。

## 常见错误 {#mistakes}

**1. 外连接后用 `count(*)`。** 没下过单的顾客显示 1 而不是 0。数右表的主键：`count(o.id)`。

**2. 连接放大了行，还按原来的意思去数。** 连上明细之后，`count(*)` 数的是明细行。想数订单，用 `count(DISTINCT o.id)`；想要准确的 `sum`，确认被加的那一列没有被重复。

**3. 用 `WHERE` 筛右表，丢掉了 0 的行。**

```sql run
SELECT c.name, count(o.id) AS delivered
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
WHERE o.status = 'delivered'
GROUP BY c.id, c.name;
```

10 行，Lucas Silva 和 Mei Tanaka 不见了。把 `o.status = 'delivered'` 移进 `ON`，就是 12 行。

**4. 只按名字分组。** 两位同名的顾客会被合并成一组，数字悄悄加在一起。按主键分组，再把要显示的列一起写进 `GROUP BY`。

**5. 内连接悄悄丢掉了“没有”的行。** 通过明细去数订单时，没有明细的订单 24 不见了；通过订单去数顾客时，没下过单的顾客不见了。问题里有“每一位”“包括没有的”时，用 `LEFT JOIN`。

## 小结 {#summary}

- 连接先于分组：汇总的是连接之后的行。
- 按要汇报的那个东西的主键分组，例如 `GROUP BY c.id, c.name`。
- 外连接配合计数时数右表的主键，`count(o.id)` 才会显示 0；对右表的条件写在 `ON` 里。
- 连接会放大“一”那一边的行；数订单要用 `count(DISTINCT o.id)`。
- 两条独立的一对多同时连接会相乘，形成扇形陷阱，要分别汇总。
