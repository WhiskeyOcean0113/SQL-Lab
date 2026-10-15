## 为什么需要它 {#why}

第 3 章留下过两个没解决的问题。

一是“哪些商品比平均价贵？”聚合函数不能写进 `WHERE`：

```sql run error
SELECT name, price
FROM products
WHERE price > avg(price);
```

二是“平均每笔订单多少钱？”这要先算出每笔订单的总额，再对这些总额求平均，也就是两层聚合，而聚合函数不能嵌套。

两个问题有同一个解法：**先用一条查询算出中间结果，再在另一条查询里使用它。**

## 核心概念 {#core}

{{Term:subquery}}是写在另一条查询里、用括号括起来的 `SELECT`。外面那条叫{{term:outer-query}}。

子查询返回什么形状，决定了它能放在哪里：

| 子查询返回 | 叫作 | 能放在哪里 |
|---|---|---|
| 一行一列，即一个值 | {{term:scalar-subquery}} | 任何能写一个值的地方：`WHERE`、`SELECT`、表达式里 |
| 多行多列，即一张表 | {{term:derived-table}} | `FROM` 里，像一张表一样使用 |
| 一列多行 | 一组值 | `IN`、`EXISTS` 等（下一篇） |

第一个问题用标量子查询：

```sql run
SELECT name, price
FROM products
WHERE price > (SELECT avg(price) FROM products)
ORDER BY price DESC;
```

数据库先执行括号里的查询，得到平均价 78.84，再把这个值放回 `WHERE`。外层查询看到的就是 `WHERE price > 78.84`。

## 示例 {#example}

问题：平均每笔订单的金额是多少？

1. **先回答“每笔订单多少钱”。** 这是一次普通的分组汇总：按 `order_id` 分组，对 `quantity * unit_price` 求和。每笔订单一行。
2. **把这个结果当成一张表。** 放进外层查询的 `FROM`，用括号括起来，并起一个别名 `t`。
3. **在这张表上再汇总一次。** 对 `t.total` 求平均。

```sql run
SELECT round(avg(t.total), 2) AS avg_order
FROM (
  SELECT order_id, sum(quantity * unit_price) AS total
  FROM order_items
  GROUP BY order_id
) AS t;
```

139.82。内层查询把 42 行明细变成 23 行订单总额，外层再把 23 行变成一个平均值。这就是“聚合不能嵌套”时的做法：每层聚合各占一层查询。

注意是 23 行而不是 24 行：订单 24 没有明细，`order_items` 里根本没有它。

## 变体 {#variants}

**标量子查询放在 `SELECT` 里。** 每件商品的库存占总库存的百分比：

```sql run
SELECT name, stock,
       round(100.0 * stock / (SELECT sum(stock) FROM products), 1) AS pct
FROM products
ORDER BY stock DESC
LIMIT 5;
```

每一行都用同一个总数 1534 去除。

**在派生表上筛选。** 派生表的列和普通表的列一样，可以在外层的 `WHERE` 里使用。下面的结果和 `HAVING count(*) >= 4` 一样，只是换了一种写法：

```sql run
SELECT t.status, t.orders
FROM (
  SELECT status, count(*) AS orders
  FROM orders
  GROUP BY status
) AS t
WHERE t.orders >= 4;
```

外层可以直接用别名 `orders`，因为它在内层已经是一个真正的列了。

**分别汇总，再连起来。** 上一篇的扇形陷阱：同时连接订单和被推荐的顾客，两边会相乘。正确做法是各自先汇总成一行一位顾客，再把两个派生表连起来：

```sql run
SELECT r.name, o.orders, f.referrals
FROM customers AS r
JOIN (
  SELECT customer_id, count(*) AS orders
  FROM orders
  GROUP BY customer_id
) AS o ON o.customer_id = r.id
JOIN (
  SELECT referred_by, count(*) AS referrals
  FROM customers
  WHERE referred_by IS NOT NULL
  GROUP BY referred_by
) AS f ON f.referred_by = r.id
ORDER BY r.id;
```

每个派生表在连接时每位顾客只有一行，不会再相乘。

## 深入 {#deeper}

**标量子查询必须只返回一行。** 返回多行时，数据库不知道用哪个值：

```sql run error
SELECT name
FROM products
WHERE price = (SELECT price FROM products WHERE category_id = 1);
```

Books 有 3 件商品，子查询返回 3 个价格。想和一组值比较，要用下一篇的 `IN`。

**返回零行时，值是 NULL。** 子查询一行都没找到，标量子查询的结果是 NULL，`price > NULL` 是 unknown，外层一行都不返回，也不会报错。

**不相关的子查询只算一次。** 本篇的子查询都不依赖外层的任何一行，所以数据库算一次，结果被每一行共用。下下篇的关联子查询则会引用外层的列。

**派生表的别名。** 标准 SQL 要求 `FROM` 里的子查询有别名，MySQL 和 PostgreSQL 15 及更早版本也要求；PostgreSQL 16 起可以省略。为了到处都能运行，也为了在外层引用它的列，始终写上别名。

**子查询和连接常常能互换。** 很多子查询也能写成连接，反之亦然。选读起来更像问题本身的那种写法。

## 常见错误 {#mistakes}

**1. 用 `=` 去比较可能返回多行的子查询。** 见“深入”：报 `more than one row returned by a subquery used as an expression`。确认子查询只会返回一行（比如它是聚合），否则改用 `IN`。

**2. 想在 `WHERE` 里直接用聚合。** `WHERE price > avg(price)` 会报错。把聚合放进子查询：`WHERE price > (SELECT avg(price) FROM products)`。

**3. 在外层引用子查询内部的表。** 派生表对外只暴露它 `SELECT` 出来的列。外层写 `order_items.quantity` 会报错，只能用 `t.total` 这样的列。

**4. 子查询意外地返回了零行。** 条件写错时，标量子查询返回 NULL，外层查询悄悄返回空结果。结果为空时，先单独运行子查询，看它返回了什么。

**5. 把子查询里的条件和外层的条件搞混。** “比 Electronics 平均价贵的商品”，`category_id = 2` 要写在子查询里，用来算 Electronics 的平均价；写在外层，筛的就是商品本身了。

## 小结 {#summary}

- 子查询是括号里的 `SELECT`，它的结果可以当作一个值或一张表使用。
- 标量子查询只返回一个值，可以放在任何能写值的地方；返回多行会报错，返回零行得到 NULL。
- 派生表写在 `FROM` 里，必须有别名；它让“先汇总，再汇总”成为可能。
- 分别汇总、再连接派生表，可以避开扇形陷阱。
- 不相关的子查询只计算一次。
