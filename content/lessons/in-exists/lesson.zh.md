## 为什么需要它 {#why}

“哪些顾客有已送达的订单？”用第 4 章的连接来写：

```sql run
SELECT c.name
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE o.status = 'delivered'
ORDER BY c.id;
```

11 行，Lin Wei 出现了两次，因为 Lin Wei 有两笔已送达的订单。可问题问的是“哪些顾客”，每位顾客应该只出现一次。你想要的不是“配对”，而是一个判断：**这位顾客在不在那份名单里？**

## 核心概念 {#core}

`IN` 接一个返回一列的子查询，判断左边的值是否出现在这一列里：

```sql run
SELECT name
FROM customers
WHERE id IN (SELECT customer_id FROM orders WHERE status = 'delivered')
ORDER BY id;
```

10 行，每位顾客一次。子查询返回的是一组顾客编号，其中 1 出现了两次，但 `IN` 只关心“在不在”，不关心出现几次。

这种“只保留在另一张表里找得到配对的行，而且每行只保留一次”的效果叫{{term:semi-join}}。第 1 章学过的 `IN (1, 2, 3)` 是同一个 `IN`，只是值列表换成了子查询。

`EXISTS` 做的是同一类判断，但换了一种问法：**子查询有没有返回任何一行？**

```sql run
SELECT name
FROM customers AS c
WHERE EXISTS (
  SELECT 1
  FROM orders AS o
  WHERE o.customer_id = c.id AND o.status = 'cancelled'
);
```

对每一位顾客，子查询找这位顾客的已取消订单；找到至少一行，`EXISTS` 就是 true。注意子查询里的 `c.id` 来自外层：子查询引用了外层的列，下一篇专门讲这种关联子查询。`SELECT 1` 只是个习惯写法，`EXISTS` 只看有没有行，不看选了什么。

## 示例 {#example}

问题：Kenji Sato（顾客 3）买过哪些商品？每件商品列一次。

1. **先找出这份名单。** Kenji Sato 的订单里出现过的商品编号：连接 `order_items` 和 `orders`，筛 `o.customer_id = 3`，选出 `product_id`。
2. **单独运行它，看看形状。** 一列，可能有重复。
3. **把它放进 `IN`。** 外层查 `products`，`WHERE id IN (…)`。

```sql run
SELECT name
FROM products
WHERE id IN (
  SELECT i.product_id
  FROM order_items AS i
  JOIN orders AS o ON o.id = i.order_id
  WHERE o.customer_id = 3
);
```

4 件商品。即使某件商品被买过两次，它也只会出现一次，因为外层每件商品只判断一次。

## 变体 {#variants}

**`NOT IN` 和 `NOT EXISTS`：不在名单里的。** 从没下过单的顾客：

```sql run
SELECT name
FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders);
```

从没卖出过的商品，用 `NOT EXISTS`：

```sql run
SELECT name
FROM products AS p
WHERE NOT EXISTS (
  SELECT 1 FROM order_items AS i WHERE i.product_id = p.id
);
```

它们和第 4 章“左连接 + `IS NULL`”的反连接是同一个意思，选读起来最清楚的那种。

**`ALL` 和 `ANY`：和一组值逐个比较。** 比 Books 分类里每一本书都贵的商品：

```sql run
SELECT name, price
FROM products
WHERE price > ALL (SELECT price FROM products WHERE category_id = 1)
ORDER BY price;
```

`> ALL` 要求比每个值都大，也就是比最大的那个大；`> ANY` 只要比其中任意一个大。`= ANY` 和 `IN` 完全相同。

## 深入 {#deeper}

**`NOT IN` 遇到 NULL 会一行都不返回。** 哪些顾客从没推荐过别人？`referred_by` 存的就是推荐人编号，看起来很自然：

```sql run
SELECT name
FROM customers
WHERE id NOT IN (SELECT referred_by FROM customers);
```

0 行，可明明有 7 位顾客没推荐过任何人。原因在讲 NULL 的那一篇：`referred_by` 里有 NULL。`x NOT IN (1, 2, NULL)` 等于 `x <> 1 AND x <> 2 AND x <> NULL`，最后一项永远是 unknown，于是整个条件不可能为 true。

```sql run
SELECT 2 IN (1, NULL) AS in_result, 2 NOT IN (1, NULL) AS not_in_result;
```

两个都是 NULL，也就是 unknown。

用 `NOT EXISTS` 就没有这个问题，因为它只问“有没有行”：

```sql run
SELECT name
FROM customers AS c
WHERE NOT EXISTS (
  SELECT 1 FROM customers AS x WHERE x.referred_by = c.id
)
ORDER BY c.id;
```

7 行。规则：**子查询的列可能有 NULL 时，用 `NOT EXISTS`，或者在子查询里加上 `WHERE 列 IS NOT NULL`。** 上一个变体里 `orders.customer_id` 定义为 `NOT NULL`，所以那里的 `NOT IN` 是安全的。

**`IN` 和连接的区别在于重复。** 连接会让一对多的“一”那边重复出现；`IN` 和 `EXISTS` 不会，每个外层行最多出现一次。要显示另一张表的列时用连接，只需要判断“有没有”时用 `IN` 或 `EXISTS`。

**多列也可以用 `IN`。** `(a, b) IN (SELECT x, y …)` 比较的是整行：两列都相等才算出现。

## 常见错误 {#mistakes}

**1. 对可能含 NULL 的列用 `NOT IN`。** 见“深入”：结果悄悄变成空的，没有报错。这是子查询里最危险的错误之一。

**2. 用连接回答“有没有”，结果出现重复。** 见“为什么需要它”：一位顾客有两笔已送达的订单，就出现两次。再加 `DISTINCT` 也能去掉重复，但 `IN` 或 `EXISTS` 更直接地表达了问题。

**3. `IN` 的子查询选了多列。** `WHERE id IN (SELECT customer_id, status FROM orders)` 会报 `subquery has too many columns`：左边一个值，右边每行两个值，没法比较。子查询只选要比较的那一列。

**4. `EXISTS` 的子查询忘了和外层关联。** `WHERE EXISTS (SELECT 1 FROM orders WHERE status = 'cancelled')` 不管外层是哪位顾客，都在问“整个 `orders` 里有没有取消的订单”，答案永远是 true，于是返回所有顾客。子查询里一定要有引用外层的条件，比如 `o.customer_id = c.id`。

**5. 用 `=` 代替 `IN`。** 子查询返回多行时，`=` 会报 `more than one row returned by a subquery`，上一篇讲过。

## 小结 {#summary}

- `x IN (子查询)` 判断 `x` 是否出现在子查询返回的那一列里；`EXISTS (子查询)` 判断子查询是否返回了至少一行。
- 它们是半连接：外层每行最多出现一次，不会像连接那样重复。
- `NOT IN` 遇到子查询里的 NULL 会一行都不返回；用 `NOT EXISTS`，或先排除 NULL。
- `EXISTS` 的子查询要引用外层的列，否则对每一行都是同一个答案。
- `> ALL` 要比每个值都大，`> ANY` 只要比其中一个大，`= ANY` 等于 `IN`。
