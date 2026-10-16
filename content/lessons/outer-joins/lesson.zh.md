## 为什么需要它 {#why}

“列出每一位顾客，以及每位顾客下过的订单。”上一篇的内连接做不到：Lucas Silva 和 Mei Tanaka 从没下过单，在 `orders` 里找不到配对，内连接就把这两位丢掉了。

```sql run
SELECT c.name, o.id AS order_id
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
ORDER BY c.id, o.id;
```

24 行，12 位顾客只出现了 10 位。可“谁还没下过单”往往正是你最想知道的。

## 核心概念 {#core}

{{Term:outer-join}}在内连接的基础上，**把某一边找不到配对的行也保留下来**，另一边的列用 NULL 填上。保留哪一边，由关键字决定：

| 写法 | 保留哪些找不到配对的行 |
|---|---|
| `LEFT JOIN` | 左边（写在 `JOIN` 前面）那张表的 |
| `RIGHT JOIN` | 右边（写在 `JOIN` 后面）那张表的 |
| `FULL JOIN` | 两边的 |

三种分别叫{{term:left-join}}、{{term:right-join}}和{{term:full-join}}。`LEFT JOIN` 和 `LEFT OUTER JOIN` 完全相同，`OUTER` 可以省略。被保留的那张表叫{{term:preserved-table}}。

```sql run
SELECT c.name, o.id AS order_id, o.status
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
ORDER BY c.id, o.id;
```

26 行：24 行配对，加上 Lucas Silva 和 Mei Tanaka 各一行，这两行的 `order_id` 和 `status` 是 NULL。

可以这样理解：先做内连接，再把左表里一次都没配上的行补回来。所以左连接的行数**至少**等于左表的行数。

## 语法 {#syntax}

外连接和内连接的格式只差连接类型这几个词：

```syntax
FROM table_name [ [ AS ] alias ]
    { LEFT | RIGHT | FULL } [ OUTER ] JOIN table_name [ [ AS ] alias ] ON condition
    [ … ]
```

最后一行的 `[ … ]` 表示可以继续接更多的连接，内连接、外连接都可以。

| 部分 | 意思 | 能省略吗 |
|---|---|---|
| `LEFT` / `RIGHT` / `FULL` | 保留哪一边找不到配对的行 | 不能，三选一；不写就是内连接 |
| `OUTER` | 只是说明“这是外连接” | 可以，写不写意思都一样 |
| `ON condition` | 怎样算配上；可以是几个条件用 `AND` 组合 | 不能 |

把这一章学过的连接类型放在一起：

| 写法 | 保留什么 |
|---|---|
| `JOIN`、`INNER JOIN` | 只有配上的行 |
| `LEFT [ OUTER ] JOIN` | 配上的行 + 左表没配上的行 |
| `RIGHT [ OUTER ] JOIN` | 配上的行 + 右表没配上的行 |
| `FULL [ OUTER ] JOIN` | 配上的行 + 两边没配上的行 |

对照格式读几条：

- `LEFT JOIN orders AS o ON o.customer_id = c.id`：选了 `LEFT`，省略了 `OUTER`。
- `LEFT JOIN orders AS o ON o.customer_id = c.id AND o.status = 'pending'`：`condition` 是两个条件的 `AND`，两者都属于“怎样算配上”（见“深入”）。
- `FULL JOIN categories AS c ON c.id = p.category_id`：选了 `FULL`。

## 示例 {#example}

问题：哪些顾客从没下过订单？

1. **哪张表要完整保留？** 要找的是顾客，所以 `customers` 在左边，`LEFT JOIN orders`。
2. **没配上的行长什么样？** `orders` 的所有列都是 NULL。
3. **用这一点来筛选。** 只留下 `orders` 一侧为 NULL 的行。检查哪一列？选一列在真实配对里**不可能**为 NULL 的，主键 `o.id` 最稳妥。

```sql run
SELECT c.id, c.name
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
WHERE o.id IS NULL;
```

Lucas Silva 和 Mei Tanaka。这种“左连接 + 右侧为 NULL”的写法叫{{term:anti-join}}，用来找“在 A 里、却不在 B 里”的行。

## 变体 {#variants}

**从没卖出过的商品。** 同样的思路，换两张表：

```sql run
SELECT p.name
FROM products AS p
LEFT JOIN order_items AS i ON i.product_id = p.id
WHERE i.product_id IS NULL;
```

Folding Chair。

**保留没有分类的商品。** 上一篇的内连接丢掉了 Gift Card，左连接把它找回来：

```sql run
SELECT p.name, c.name AS category
FROM products AS p
LEFT JOIN categories AS c ON c.id = p.category_id
ORDER BY p.id;
```

**连续的左连接，一路保留。** 每位顾客、每笔订单、每条明细，没下过单的顾客和没有明细的订单都不丢：

```sql run
SELECT c.name, o.id AS order_id, i.product_id
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
LEFT JOIN order_items AS i ON i.order_id = o.id
ORDER BY c.id, o.id, i.product_id;
```

45 行：42 条明细，加上没有明细的订单 24，再加上两位没下过单的顾客。把第二个 `LEFT JOIN` 换成 `JOIN`，就只剩 42 行（见“深入”）。

**把 NULL 显示成文字。** 用第 2 章的 `COALESCE`，让没配上的行更好读：

```sql run
SELECT c.name, COALESCE(o.status, 'no orders') AS status
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
ORDER BY c.id;
```

**`RIGHT JOIN` 只是把左右换过来。** 下面这条和上面那条结果相同：

```sql run
SELECT p.name, c.name AS category
FROM categories AS c
RIGHT JOIN products AS p ON p.category_id = c.id
ORDER BY p.id;
```

实践中几乎总是写 `LEFT JOIN`，把要完整保留的表写在最前面，读起来更顺。

**`FULL JOIN` 两边都保留。** 它会同时保留没有分类的商品和没有商品的分类：

```sql run
SELECT p.name, c.name AS category
FROM products AS p
FULL JOIN categories AS c ON c.id = p.category_id;
```

结果和左连接一样是 16 行，因为 shop 的每个分类都至少有一件商品，右边没有落单的行。`FULL JOIN` 适合对比两份名单，看哪些只在一边出现。

## 深入 {#deeper}

**`ON` 和 `WHERE` 在外连接里效果不同。** 对内连接，条件放哪里都一样；对外连接，差别很大。

`ON` 里的条件决定**怎样算配上**。下面的查询要的是“每位顾客，以及每位顾客待处理的订单”：

```sql run
SELECT c.name, o.id AS order_id
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id AND o.status = 'pending'
ORDER BY c.id;
```

12 位顾客都在，没有待处理订单的显示 NULL。

`WHERE` 里的条件则在连接**之后**筛选整张结果表：

```sql run
SELECT c.name, o.id AS order_id
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
WHERE o.status = 'pending'
ORDER BY c.id;
```

只剩 4 行。没配上的顾客 `o.status` 是 NULL，`NULL = 'pending'` 是 unknown，被 `WHERE` 去掉了。左连接保留下来的行又被丢掉，结果和内连接一模一样。规则：**对右表的条件，想保留左表全部行，就写进 `ON`。**

**后面的内连接会抵消前面的外连接。** `customers LEFT JOIN orders` 之后再 `JOIN order_items`，没下过单的顾客 `o.id` 是 NULL，配不上任何明细，又被丢掉了；没有明细的订单 24 也一样。想一路保留，后面的连接也要用 `LEFT JOIN`。

**其他数据库。** MySQL 不支持 `FULL JOIN`，要用 `LEFT JOIN` 和 `RIGHT JOIN` 的结果合并（第 5 章的 `UNION`）。SQLite 直到 2022 年的 3.39 版才支持 `RIGHT JOIN` 和 `FULL JOIN`。`LEFT JOIN` 则到处都能用。

## 常见错误 {#mistakes}

**1. 用 `WHERE` 筛右表，悄悄变回了内连接。** 见“深入”：`LEFT JOIN … WHERE o.status = 'pending'` 等于内连接。这是外连接最常见的错误之一，而且很难自己发现：查询能运行，结果看起来也合理。

**2. 反连接检查了一个本来就可能为 NULL 的列。** 想找没下过单的顾客，却检查了 `shipped_at`：

```sql run
SELECT c.name, o.id AS order_id
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
WHERE o.shipped_at IS NULL;
```

12 行。还没发货的订单 `shipped_at` 本来就是 NULL，于是它们也混了进来。反连接要检查连接列或主键，它们只在“没配上”时才是 NULL。

**3. 左右写反了。** `orders LEFT JOIN customers` 保留的是所有订单，而每笔订单都有顾客，所以结果和内连接一样，没下过单的顾客仍然不在。先想清楚要完整保留哪张表，再把它写在 `LEFT JOIN` 的左边。

**4. 后面接了内连接。** 见“深入”：一个 `LEFT JOIN` 后面跟着普通的 `JOIN`，前面保留下来的行可能又被丢掉。

**5. 外连接漏写 `ON`。** `FROM customers AS c LEFT JOIN orders AS o` 后面什么都不写，会报 `syntax error at end of input`。按格式，外连接的 `ON condition` 不能省略。

**6. 用 `= NULL` 找没配上的行。** `WHERE o.id = NULL` 永远不成立，一行都不会返回。判断 NULL 要用 `IS NULL`。

## 小结 {#summary}

- `LEFT JOIN` 保留左表所有行，找不到配对时，右表的列为 NULL；`RIGHT JOIN` 反过来，`FULL JOIN` 两边都保留。
- 左连接的行数至少等于左表的行数。
- 反连接：`LEFT JOIN … WHERE 右表主键 IS NULL`，找出“在 A 不在 B”的行。
- 对右表的条件写在 `ON` 里才能保留左表全部行；写在 `WHERE` 里就等于内连接。
- 外连接后面再接内连接，可能把保留下来的行又丢掉。
