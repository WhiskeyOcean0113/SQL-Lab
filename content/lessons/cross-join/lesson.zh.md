## 为什么需要它 {#why}

书店想印一张价目表：每本书买 1 本、2 本、3 本分别多少钱。或者市场部想给两位日本顾客各寄一份问卷，每个商品分类一页。

这两个问题要的不是“配对上的行”，而是**所有组合**：每本书 × 每种数量，每位顾客 × 每个分类。前面学的连接都靠条件挑出配对，这一次一个都不挑。

## 核心概念 {#core}

{{Term:cross-join}}把左表的每一行和右表的每一行都配成一对，没有连接条件，也就没有 `ON`：

```sql run
SELECT u.name AS customer, c.name AS category
FROM customers AS u
CROSS JOIN categories AS c
WHERE u.country = 'Japan'
ORDER BY u.name, c.name;
```

两张表所有可能的配对叫{{term:cartesian-product}}。它的行数就是两边行数的**乘积**：12 位顾客 × 5 个分类是 60 行；上面先筛出 2 位日本顾客，所以是 2 × 5 = 10 行。

回想讲内连接时的定义：内连接就是先求笛卡尔积，再用 `ON` 筛掉不成立的配对。`CROSS JOIN` 就是那个“筛之前”的结果。

## 示例 {#example}

问题：给 Books 分类的 3 本书做价目表，列出买 1、2、3 本的总价。

1. **先算好应该有几行。** 3 本书 × 3 种数量 = 9 行。先预估，再运行，是发现连接错误最便宜的办法。
2. **找到“数量”从哪里来。** shop 里没有一张存着 1、2、3 的表。`generate_series(1, 3)` 是一个{{term:set-returning-function}}，它像一张表一样返回 1、2、3 三行，可以直接写在 `FROM` 里。
3. **用 `CROSS JOIN` 组合，再用 `WHERE` 只留 Books。**
4. **计算总价。** 每一行都有价格和数量，相乘即可。

```sql run
SELECT p.name, n.qty, p.price * n.qty AS total
FROM products AS p
CROSS JOIN generate_series(1, 3) AS n(qty)
WHERE p.category_id = 1
ORDER BY p.name, n.qty;
```

9 行，和预估一致。`AS n(qty)` 给这张“表”起名 `n`，并把它唯一的列命名为 `qty`。

## 变体 {#variants}

**逗号就是 `CROSS JOIN`。** `FROM customers AS u, categories AS c` 和 `FROM customers AS u CROSS JOIN categories AS c` 完全相同：

```sql run
SELECT count(*) AS pairs
FROM customers AS u, categories AS c;
```

60 行。所以讲内连接时说过：用逗号列出表、却漏写 `WHERE` 里的连接条件，得到的就是笛卡尔积。

**两两组合同一张表。** `CROSS JOIN` 也可以连自己。把每两个不同的分类组合成一组促销，每组只出现一次，就是上一篇的 `a.id < b.id`：

```sql run
SELECT a.name AS first, b.name AS second
FROM categories AS a
CROSS JOIN categories AS b
WHERE a.id < b.id
ORDER BY a.id, b.id;
```

5 个分类两两组合，10 组。

**显式的“无条件”。** `JOIN … ON true` 也会得到笛卡尔积，因为每对配对都满足 `true`。它不如 `CROSS JOIN` 一眼看得懂。

## 深入 {#deeper}

**行数会乘得很快。** 每多连一张表，行数就乘上它的行数。三份 `categories` 的笛卡尔积已经是 5 × 5 × 5 = 125 行；生产环境里两张各有一百万行的表，笛卡尔积是一万亿行。

**漏掉一个连接条件，就是一次笛卡尔积。** 三张表连接时，漏掉其中一个条件最常见。下面的查询想给每行订单明细配上商品和订单，却用逗号接上了 `orders`，没有写它的条件：

```sql run
SELECT count(*) AS lines
FROM products AS p
JOIN order_items AS i ON i.product_id = p.id, orders AS o;
```

1008 行，是 42 行明细 × 24 笔订单。补上条件，才是 42 行：

```sql run
SELECT count(*) AS lines
FROM products AS p
JOIN order_items AS i ON i.product_id = p.id
JOIN orders AS o ON o.id = i.order_id;
```

这类问题叫{{term:row-explosion}}。本课程的判题器发现你的结果比预期多出好几倍时，会专门提示你检查连接条件。

**连错列也会让行数变多。** `JOIN orders AS o ON o.customer_id = i.order_id` 不会报错，因为两列都是整数，却会返回 48 行，比 42 多。它不像漏写条件那样夸张，所以更难发现。

**和其他数据库的差别。** PostgreSQL 要求 `JOIN` 必须带 `ON` 或 `USING`，只有 `CROSS JOIN` 可以不带。MySQL 和 SQLite 却把不带条件的 `JOIN` 当作 `CROSS JOIN`，漏写 `ON` 时不会有任何提示。

## 常见错误 {#mistakes}

**1. 用逗号连表，漏写了其中一个条件。** 见“深入”：三张表只写了两张的条件，行数就成了乘积。用 `JOIN … ON` 写每一张表，每个 `ON` 紧挨着它的表，少写一个会很显眼。

**2. 逗号和 `JOIN` 混着用。**

```sql run error
SELECT count(*)
FROM orders AS o, order_items AS i
JOIN products AS p ON p.id = i.product_id AND o.id = i.order_id;
```

`JOIN` 比逗号结合得更紧：它先和 `order_items` 结合，这时 `ON` 里还看不到逗号前面的 `o`。统一用 `JOIN` 就不会遇到。

**3. 用 `CROSS JOIN` 加 `WHERE` 代替内连接。** `FROM orders CROSS JOIN customers WHERE customers.id = orders.customer_id` 的结果和内连接一样，但读的人要先看到“所有组合”，再在后面找到条件。表示“配对”时就写 `JOIN … ON`，只有真的需要所有组合时才写 `CROSS JOIN`。

**4. 用 `DISTINCT` 掩盖行数暴增。** 结果里出现大量重复行时，加 `DISTINCT` 能让它看起来正常，但多余的配对还在，后面一做 `sum` 或 `count` 就会算错。先找出是哪个连接条件漏了或写错了。

**5. 不预估行数。** 运行连接之前，先估计结果大概有几行：一对多时约等于“多”那边的行数，笛卡尔积是乘积。结果和预估差得很远，就说明连接条件有问题。

## 小结 {#summary}

- `CROSS JOIN` 返回两张表所有行的配对，也就是笛卡尔积，行数是两边行数的乘积。
- `FROM a, b` 等同于 `CROSS JOIN`；内连接等于笛卡尔积再按 `ON` 筛选。
- 需要“所有组合”时才用 `CROSS JOIN`；`generate_series` 这样的集合返回函数可以像表一样写在 `FROM` 里。
- 漏写或写错连接条件会造成行数暴增，`DISTINCT` 只能掩盖它。
- 运行之前先预估行数，是发现连接错误最简单的办法。
