## 为什么需要它 {#why}

客服想看 Lin Wei 的完整时间线：每笔订单什么时候下单，什么时候发货，按时间排在一起。

“下单”和“发货”是同一张 `orders` 表里的两列，`ordered_at` 和 `shipped_at`。一行订单可能有两个事件，可结果需要**每个事件一行**。`WHERE` 只能挑行，连接只能把列并排拼起来，都做不到“把两份名单上下接在一起”。

## 核心概念 {#core}

{{Term:set-operation}}把两条查询的结果当作两个集合来合并：

| 写法 | 结果 |
|---|---|
| `A UNION B` | 在 A 或 B 中出现的行，即{{term:set-union}}，重复的只留一行 |
| `A UNION ALL B` | A 的所有行接上 B 的所有行，保留重复 |
| `A INTERSECT B` | 同时出现在 A 和 B 中的行，即{{term:set-intersection}} |
| `A EXCEPT B` | 在 A 中、但不在 B 中的行，即{{term:set-difference}} |

两边的查询要满足两条规则：

- **列数相同**，并且**按位置**一一对应：第一列对第一列，第二列对第二列，不看列名。
- 对应的列**类型兼容**。

结果的列名取自第一条查询，`ORDER BY` 写在最后，对整个结果排序。

## 示例 {#example}

问题：Lin Wei（顾客 1）每笔订单的下单和发货事件，按时间排列。

1. **写出第一份名单。** 下单事件：订单编号、事件名、时间。事件名是一个常量 `'ordered'`。
2. **写出第二份名单，列和第一份对齐。** 发货事件：同样三列，时间换成 `shipped_at`，只要已经发货的。
3. **决定要不要去重。** 两份名单的事件名不同，不可能有完全相同的行，用 `UNION ALL`，省掉去重的工作。
4. **最后整体排序。**

```sql run
SELECT id AS order_id, 'ordered' AS event, ordered_at AS at
FROM orders
WHERE customer_id = 1
UNION ALL
SELECT id, 'shipped', shipped_at
FROM orders
WHERE customer_id = 1 AND shipped_at IS NOT NULL
ORDER BY at;
```

7 个事件：4 次下单，3 次发货，订单 22 还没发货。第二条查询的列没有起别名，因为结果的列名只看第一条。

## 变体 {#variants}

**`UNION` 和 `UNION ALL`。** 1 月下过单或 6 月下过单的顾客：

```sql run
SELECT customer_id FROM orders WHERE ordered_at < '2024-02-01'
UNION
SELECT customer_id FROM orders WHERE ordered_at >= '2024-06-01'
ORDER BY customer_id;
```

7 位。换成 `UNION ALL` 会得到 10 行，因为顾客 1、2、3 两个月都下过单，各出现两次。

**`INTERSECT`：两边都有的。** 4 月之前下过单、6 月又下过单的顾客，也就是老顾客回来了：

```sql run
SELECT customer_id FROM orders WHERE ordered_at < '2024-04-01'
INTERSECT
SELECT customer_id FROM orders WHERE ordered_at >= '2024-06-01'
ORDER BY customer_id;
```

**`EXCEPT`：在左边、不在右边的。** 4 月之前下过单、6 月却没再来的顾客：

```sql run
SELECT customer_id FROM orders WHERE ordered_at < '2024-04-01'
EXCEPT
SELECT customer_id FROM orders WHERE ordered_at >= '2024-06-01'
ORDER BY customer_id;
```

`EXCEPT` 的方向很重要：`A EXCEPT B` 和 `B EXCEPT A` 是两个不同的问题。

**合并不同的表。** 只要列对得上，两边可以来自不同的表，用一个常量列标明来源：

```sql run
SELECT 'customer' AS kind, name FROM customers WHERE country = 'Canada'
UNION ALL
SELECT 'product', name FROM products WHERE category_id = 4
ORDER BY kind, name;
```

## 深入 {#deeper}

**集合运算把 NULL 当作相同的值。** 和 `DISTINCT`、`GROUP BY` 一样，两个 NULL 在这里算作相同。所以 `EXCEPT` 不会遇到上上篇 `NOT IN` 的陷阱：

```sql run
SELECT city FROM customers
EXCEPT
SELECT city FROM customers WHERE country = 'Japan';
```

7 行：Osaka 被去掉，NULL 留下了一行。`EXCEPT` 和 `UNION` 一样会去重；`INTERSECT ALL`、`EXCEPT ALL` 则保留重复的次数。

**`INTERSECT` 比 `UNION` 和 `EXCEPT` 结合得更紧。** 没有括号时，`A UNION B INTERSECT C` 的意思是 `A UNION (B INTERSECT C)`，就像乘法先于加法。混用时加上括号：

```sql run
SELECT customer_id FROM orders WHERE status = 'cancelled'
UNION
(SELECT customer_id FROM orders WHERE status = 'pending'
 INTERSECT
 SELECT customer_id FROM orders WHERE status = 'paid')
ORDER BY customer_id;
```

**`UNION` 要去重，代价更高。** 去重需要比较所有行。确定不会有重复，或者重复本身有意义时，用 `UNION ALL`。

**用 `UNION` 模拟 `FULL JOIN`。** 第 4 章提过，MySQL 没有 `FULL JOIN`，常见的替代写法是把 `LEFT JOIN` 和 `RIGHT JOIN` 的结果 `UNION` 起来。另外，MySQL 直到 8.0.31 才支持 `INTERSECT` 和 `EXCEPT`；Oracle 里 `EXCEPT` 叫 `MINUS`。

## 常见错误 {#mistakes}

**1. 两边的列数不同。**

```sql run error
SELECT id, name FROM customers WHERE country = 'Canada'
UNION
SELECT name FROM products WHERE category_id = 4;
```

`each UNION query must have the same number of columns`。两边选出同样多的列。

**2. 列的顺序没对齐。** 集合运算按位置配对，不看列名。下面这条把城市和国家混在了同一列，不会报错：

```sql run
SELECT city FROM customers
UNION
SELECT country FROM customers;
```

16 行城市和国家混在一起，列名还叫 `city`。写之前把两边的选择列表上下对齐，逐列核对。

**3. 类型不兼容。** `SELECT id FROM customers UNION SELECT name FROM categories` 会报 `UNION types integer and text cannot be matched`。

**4. 在中间写了 `ORDER BY`。** `ORDER BY` 只能写在整个集合运算的最后，对合并后的结果排序；写在第一条查询后面是语法错误。

**5. 该用 `UNION ALL` 时用了 `UNION`。** 合并两份销售记录再求和时，`UNION` 会把恰好相同的两行合并成一行，总数就少了。需要保留每一行时，用 `UNION ALL`。

## 小结 {#summary}

- `UNION` 合并并去重，`UNION ALL` 合并并保留重复，`INTERSECT` 取两边都有的，`EXCEPT` 取左边有、右边没有的。
- 两边的列数相同、类型兼容，按位置对应；列名取自第一条查询。
- `ORDER BY` 写在最后，对整个结果排序。
- 集合运算把 NULL 当作相同的值；`INTERSECT` 先于 `UNION` 和 `EXCEPT` 计算，混用时加括号。
- 不需要去重时用 `UNION ALL`，它更快，也不会误合并相同的行。
