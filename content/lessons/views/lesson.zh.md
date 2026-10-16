## 为什么需要它 {#why}

上一篇说，订单总金额最好不要存，用的时候现算。可现算要写一段连接加分组：连接 `orders` 和 `order_items`，按订单分组，把 `quantity * unit_price` 加起来。月报要它，客服后台要它，顾客排行榜也要它。

每个地方各抄一份，迟早会有一份抄错，或者规则改了只改了其中几份。另外，客服需要看订单，但不应该看到顾客的邮箱。能不能把这段查询存在数据库里，起一个名字，谁要用谁就当一张表来查？

## 核心概念 {#core}

### 一条起了名字的查询

{{Term:view}}就是一条存在数据库里、有名字的查询。用 `CREATE VIEW` 创建，之后就能像表一样查询它：

```sql run
CREATE VIEW order_totals AS
SELECT o.id AS order_id, o.customer_id, o.status, o.ordered_at,
       sum(i.quantity * i.unit_price) AS total
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
GROUP BY o.id;

SELECT * FROM order_totals WHERE customer_id = 1 ORDER BY ordered_at;
```

### 它不存数据

视图里存的是查询，不是结果。每次查询视图，数据库都会把那条查询重新执行一遍，所以视图里看到的永远是表里现在的数据：

```sql run
CREATE VIEW order_totals AS
SELECT o.id AS order_id, o.customer_id, o.status, o.ordered_at,
       sum(i.quantity * i.unit_price) AS total
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
GROUP BY o.id;

UPDATE order_items SET quantity = 5 WHERE order_id = 1 AND product_id = 8;
SELECT order_id, total FROM order_totals WHERE order_id = 1;
```

改了明细，订单 1 的总额马上从 67.00 变成了 104.50。这正是上一篇“现算”的意思，只是不用每次都重写那段查询。

### 视图能做什么

- **封装**：复杂的连接和计算只写一次，用的人只需要知道视图的名字和列。
- **一致**：规则只定义在一个地方，改视图就等于改了所有用它的地方。
- **限制可见的内容**：视图可以只露出部分列和部分行。数据库还可以只授予别人查视图的权限，不给查底下的表。

和{{term:cte}}相比：CTE 只活在一条语句里，视图一直存在，直到被删除。

## 语法 {#syntax}

```syntax
CREATE [ OR REPLACE ] VIEW view_name [ ( column_name [, …] ) ] AS
select_statement
[ WITH CHECK OPTION ]
```

```syntax
DROP VIEW [ IF EXISTS ] view_name
```

| 部分 | 填什么 | 规则 |
|---|---|---|
| `OR REPLACE` | 已有同名视图时替换它 | 可以省略；省略时同名视图存在就报错；替换时只能在末尾加列，不能删列、改名或调换顺序 |
| `view_name` | 视图的名字 | 和表共用一套名字，不能和已有的表重名 |
| `( column_name [, …] )` | 视图的列名 | 可以省略；省略时用查询结果的列名 |
| `select_statement` | 任意查询 | 每次查询视图时重新执行 |
| `WITH CHECK OPTION` | 通过视图写入的行，必须仍然满足视图的 `WHERE` | 可以省略；只对能修改的视图有意义 |
| `DROP VIEW` | 删除视图 | 只删掉这条查询，表里的数据不受影响 |

对照格式读几条：

- 核心概念里的 `CREATE VIEW order_totals AS SELECT … GROUP BY o.id`：没有列名列表，列名来自查询里的别名。
- `CREATE VIEW order_counts (customer_id, orders) AS SELECT customer_id, count(*) FROM orders GROUP BY customer_id`：用列名列表给 `count(*)` 起名。
- `CREATE OR REPLACE VIEW v AS SELECT id, name, email FROM customers`：替换原来只有 `id, name` 的视图，在末尾加了一列。

## 示例 {#example}

问题：消费额最高的 3 位顾客，取消的订单不算。用视图 `order_totals` 来回答。

1. **建视图。** 把“每笔订单的总额”这段查询存成 `order_totals`，带上 `customer_id` 和 `status`，方便以后按顾客、按状态筛选。
2. **把视图当表用。** 和 `customers` 连接，拿到名字。
3. **筛选、分组、排序。** 和查普通的表完全一样。

```sql run
CREATE VIEW order_totals AS
SELECT o.id AS order_id, o.customer_id, o.status,
       sum(i.quantity * i.unit_price) AS total
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
GROUP BY o.id;

SELECT c.name, count(*) AS orders, sum(t.total) AS spent
FROM order_totals AS t
JOIN customers AS c ON c.id = t.customer_id
WHERE t.status <> 'cancelled'
GROUP BY c.name
ORDER BY spent DESC
LIMIT 3;
```

主查询里看不到任何明细表，也没有乘法。以后“订单总额”的算法变了，比如要加上运费，只需要改视图。

## 变体 {#variants}

**给视图的列起名。** 名字后面的括号一次给所有列命名，查询里的 `count(*)` 就不必再写 `AS`：

```sql run
CREATE VIEW order_counts (customer_id, orders) AS
SELECT customer_id, count(*)
FROM orders
GROUP BY customer_id;

SELECT * FROM order_counts ORDER BY customer_id LIMIT 3;
```

**通过简单的视图修改数据。** 只从一张表里选列和行、没有分组和聚合的视图，可以直接 `UPDATE`、`INSERT`、`DELETE`，修改会落到底下的表上：

```sql run
CREATE VIEW canadian_customers AS
SELECT id, name, email, city
FROM customers
WHERE country = 'Canada';

UPDATE canadian_customers
SET city = 'Vancouver'
WHERE id = 6
RETURNING *;
```

**`WITH CHECK OPTION`：不许写出视图的范围。** 没有它，可以通过“加拿大顾客”视图插入一位澳大利亚顾客，插完却在视图里看不到。加上它，这样的写入会被拒绝：

```sql run error
CREATE VIEW canadian_customers AS
SELECT id, name, email, city, country, joined_on
FROM customers
WHERE country = 'Canada'
WITH CHECK OPTION;

INSERT INTO canadian_customers (id, name, country, joined_on)
VALUES (13, 'Olivia Brown', 'Australia', '2024-07-01');
```

`new row violates check option for view "canadian_customers"`。

**{{Term:materialized-view}}：把结果存下来。** 普通视图每次都重新计算。计算很慢、数据又不需要分秒不差时，可以用物化视图把结果存成一张表，需要更新时手动刷新：

```sql run
CREATE MATERIALIZED VIEW order_count AS
SELECT count(*) AS n FROM orders;

INSERT INTO orders (id, customer_id, ordered_at, status)
VALUES (25, 1, '2024-07-01 10:00', 'pending');

SELECT (SELECT n FROM order_count) AS stored,
       (SELECT count(*) FROM orders) AS actual;
```

物化视图里存的还是 24，表里已经有 25 笔订单了。在最后一条 `SELECT` 之前加上一行 `REFRESH MATERIALIZED VIEW order_count;` 再运行，`stored` 就会变成 25。

## 深入 {#deeper}

**视图不会变快，也不会变慢。** 查询视图时，PostgreSQL 把视图的定义展开，和外面的查询合在一起优化，就像你把那段 SQL 直接写进去一样。视图的作用是组织代码，不是加速。真正需要加速时，用物化视图或第 9 章的{{term:index}}。

**`SELECT *` 在创建时就展开了。** 用 `CREATE VIEW v AS SELECT * FROM categories` 建的视图，列在创建那一刻就固定为 `id, name`。之后给 `categories` 加了新列，视图里也看不到。视图里最好明确写出列名。

**视图依赖它用到的列。** 视图用到了 `customers.city`，就不能直接删掉这一列：数据库会报 `cannot drop column city of table customers because other objects depend on it`。删表、删列之前，先处理依赖它的视图，或者明确写上 `CASCADE`，让视图一起被删掉。

**视图里的 `ORDER BY` 不可靠。** 视图里可以写 `ORDER BY`，但外面的查询一旦连接、分组或筛选，顺序就不再有保证。需要顺序时，在查询视图的语句里写 `ORDER BY`。

**其他数据库。** 普通视图到处都有。可修改的视图、`WITH CHECK OPTION` 是标准 SQL，规则大同小异；物化视图在 Oracle 里也有，在 SQL Server 里叫 indexed view，MySQL 没有。

## 常见错误 {#mistakes}

**1. 以为视图存的是创建那一刻的数据。** 普通视图每次都重新执行查询，看到的总是最新的数据。需要一份不变的快照，用 `CREATE TABLE … AS`；需要定期刷新的缓存，用物化视图。

**2. 用 `CREATE VIEW` 修改已有的视图。**

```sql run error
CREATE VIEW customer_contacts AS SELECT id, name FROM customers;
CREATE VIEW customer_contacts AS SELECT id, name, email FROM customers;
```

`relation "customer_contacts" already exists`。修改已有的视图写 `CREATE OR REPLACE VIEW`。

**3. 用 `OR REPLACE` 删列或调换列的顺序。**

```sql run error
CREATE VIEW customer_contacts AS SELECT id, name FROM customers;
CREATE OR REPLACE VIEW customer_contacts AS SELECT name, id FROM customers;
```

`cannot change name of view column "id" to "name"`。`OR REPLACE` 只能在末尾加列。要删列或换顺序，先 `DROP VIEW`，再重新创建。

**4. 修改带分组的视图。**

```sql run error
CREATE VIEW order_totals AS
SELECT o.id AS order_id, sum(i.quantity * i.unit_price) AS total
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
GROUP BY o.id;

UPDATE order_totals SET total = 0 WHERE order_id = 1;
```

`cannot update view "order_totals"`，DETAIL 写着 `Views containing GROUP BY are not automatically updatable`。总额是算出来的，数据库不知道该改哪一行明细。要改，就改底下的表。

**5. 视图里留着没起名的计算列。** `CREATE VIEW v AS SELECT customer_id, count(*) FROM orders GROUP BY customer_id` 的第二列叫 `count`，用的人只能猜它是什么。视图是给别人用的接口，每一列都要有清楚的名字。

## 小结 {#summary}

- 视图是一条存在数据库里、有名字的查询，用 `CREATE VIEW 名字 AS 查询` 创建，像表一样查询。
- 视图不存数据，每次查询都重新执行，看到的总是最新的数据。
- 视图用来封装复杂查询、统一规则、限制别人能看到的列和行。
- 只选自一张表、没有分组的简单视图可以修改；`WITH CHECK OPTION` 不许写出视图的范围。
- 修改视图用 `CREATE OR REPLACE`，只能在末尾加列；物化视图把结果存下来，要用 `REFRESH` 更新。
