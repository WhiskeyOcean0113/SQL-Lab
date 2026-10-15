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

**`LATERAL`。** PostgreSQL 和标准 SQL 还允许 `FROM` 里的子查询引用它左边的表，写作 `JOIN LATERAL (…)` 或 `CROSS JOIN LATERAL (…)`。它像一个能返回多行多列的关联子查询，比如“每位顾客最近的 3 笔订单”。现在只需要知道有这种写法。

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
