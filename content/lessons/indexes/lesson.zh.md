## 为什么需要它 {#why}

shop 只有 24 笔订单，查什么都是一眨眼。但真实的网店可能有几千万笔订单。客服输入一个顾客编号，想看 ta 的订单：数据库怎么找？

没有别的办法时，它只能从第一行读到最后一行，逐行检查 `customer_id` 是不是这个值。几千万行里只有几十行是要找的，其余的读了也白读。就像在一本没有目录、没有索引的厚书里找一个词，只能一页一页翻。

## 核心概念 {#core}

### 书后面的索引

{{Term:index}}是表之外另存的一份结构：把某一列的值排好序，每个值旁边记着它所在的行在哪里。查 `customer_id = 42` 时，数据库在这份排好序的结构里很快定位到 42，再按记录直接去取那几行，不用读整张表。

PostgreSQL 默认的索引是{{term:b-tree}}。它像一棵很矮很宽的树，几千万个值也只有三四层，从树根走到叶子只要几步。

### 先看没有索引时

下面先生成一张 10 万行的访问记录表 `visits`，每位顾客大约 50 行。`EXPLAIN` 显示数据库**打算**怎样执行一条查询，下一篇会细讲，这里只看第一行：

```sql run
CREATE TABLE visits AS
SELECT g AS id,
       g % 2000 AS customer_id,
       TIMESTAMP '2024-01-01' + g * INTERVAL '1 minute' AS visited_at
FROM generate_series(1, 100000) AS g;
ANALYZE visits;

EXPLAIN (COSTS OFF)
SELECT * FROM visits WHERE customer_id = 42;
```

`Seq Scan on visits` 是{{term:sequential-scan}}：读遍整张表，用 `Filter` 逐行检查。

### 再建一个索引

```sql run
CREATE TABLE visits AS
SELECT g AS id,
       g % 2000 AS customer_id,
       TIMESTAMP '2024-01-01' + g * INTERVAL '1 minute' AS visited_at
FROM generate_series(1, 100000) AS g;
CREATE INDEX visits_customer_id_idx ON visits (customer_id);
ANALYZE visits;

EXPLAIN (COSTS OFF)
SELECT * FROM visits WHERE customer_id = 42;
```

现在计划变成了 `Bitmap Heap Scan`，它下面一层是 `Bitmap Index Scan on visits_customer_id_idx`：数据库先在索引里找到那 50 行的位置，再直接去取。查询的写法一个字都没变，结果也完全一样，变的只是数据库找行的方式。

### 由数据库决定用不用

你不能在查询里命令数据库“用这个索引”。{{Term:query-planner}}会根据{{term:table-statistics}}估算每种方式的代价，选最便宜的那个。要找的行只占很小一部分（{{term:selectivity}}高）时，索引划算；要找的行占了一大半时，直接读整张表反而更快。

### 索引不是免费的

- **占空间**：上面这个索引大约是表的五分之一大。
- **拖慢写入**：每次 `INSERT`、`UPDATE`、`DELETE`，表上的每个索引都要跟着更新。
- 所以只给真正常用的查询条件建索引，而不是每一列都建。

主键和唯一约束会自动建一个唯一索引，所以按 `id` 查找本来就很快。{{Term:foreign-key}}却不会自动建索引。

## 语法 {#syntax}

```syntax
CREATE [ UNIQUE ] INDEX [ index_name ] ON table_name [ USING method ]
    ( { column_name | ( expression ) } [ ASC | DESC ] [, …] )
    [ WHERE condition ]
```

```syntax
DROP INDEX [ IF EXISTS ] index_name
```

| 部分 | 填什么 | 规则 |
|---|---|---|
| `UNIQUE` | 让索引同时保证不重复 | 可以省略；效果和唯一约束一样 |
| `index_name` | 索引的名字 | 可以省略，数据库会起一个，比如 `visits_customer_id_idx`；习惯写成 `表名_列名_idx` |
| `USING method` | 索引的种类 | 可以省略，默认 `btree` |
| `column_name` | 要建索引的列 | 可以有好几列，顺序很重要（见“变体”） |
| `( expression )` | 对列计算之后的值 | 比如 `(lower(email))`；外面要多一对括号 |
| `ASC` / `DESC` | 索引里的排序方向 | 可以省略；B 树正着读、倒着读都行，很少需要写 |
| `WHERE condition` | 只给满足条件的行建索引 | 可以省略 |

对照格式读几条：

- `CREATE INDEX visits_customer_id_idx ON visits (customer_id)`：起了名字，一列。
- `CREATE INDEX ON orders (customer_id, ordered_at)`：没起名字，两列。
- `CREATE UNIQUE INDEX ON customers (lower(email))`：唯一，对表达式建索引。

## 示例 {#example}

问题：客服常常按顾客查订单，并且最近的排在前面。给 `orders` 建一个合适的索引。

1. **找出查询里的条件和排序。** 条件是 `customer_id = …`，排序是 `ordered_at DESC`。
2. **条件列放在前面。** 索引先按 `customer_id` 排好，同一位顾客的订单就挨在一起。
3. **排序列放在后面。** 同一位顾客的订单再按 `ordered_at` 排好，数据库倒着读就是“最近的在前”，不用另外排序。
4. **建索引，再用 `pg_indexes` 看一眼。**

```sql run
CREATE INDEX orders_customer_id_ordered_at_idx
ON orders (customer_id, ordered_at);

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'orders';
```

`orders` 现在有两个索引：主键自带的 `orders_pkey`，和刚建的这个。shop 的表太小，数据库还是会直接读整张表；到了几百万行，这个索引就能让“某位顾客最近的订单”只读几行。

## 变体 {#variants}

**多列索引：列的顺序决定能用在哪里。** `(customer_id, visited_at)` 这个索引先按顾客排、再按时间排，就像电话簿先按姓、再按名排。只按时间查找时，它帮不上忙：

```sql run
CREATE TABLE visits AS
SELECT g AS id,
       g % 2000 AS customer_id,
       TIMESTAMP '2024-01-01' + g * INTERVAL '1 minute' AS visited_at
FROM generate_series(1, 100000) AS g;
CREATE INDEX ON visits (customer_id, visited_at);
ANALYZE visits;

EXPLAIN (COSTS OFF)
SELECT * FROM visits
WHERE visited_at >= '2024-03-01' AND visited_at < '2024-03-01 00:10';
```

`Seq Scan`。条件里要有索引的第一列，{{term:composite-index}}才用得上。把条件换成 `customer_id = 42 AND visited_at >= '2024-02-01'` 再运行，就会用上它。

**为排序建索引。** “最近的 5 次访问”如果没有索引，要先把 10 万行全部排序；有了 `visited_at` 的索引，从索引的末尾倒着读 5 个就行：

```sql run
CREATE TABLE visits AS
SELECT g AS id,
       g % 2000 AS customer_id,
       TIMESTAMP '2024-01-01' + g * INTERVAL '1 minute' AS visited_at
FROM generate_series(1, 100000) AS g;
CREATE INDEX ON visits (visited_at);
ANALYZE visits;

EXPLAIN (COSTS OFF)
SELECT * FROM visits ORDER BY visited_at DESC LIMIT 5;
```

`Index Scan Backward`：倒着读索引，没有 `Sort` 这一步。

**{{Term:expression-index}}：查询里对列做了计算。** 邮箱不区分大小写地查找，条件是 `lower(email) = …`。普通的 `email` 索引对它无效，要对 `lower(email)` 建索引。加上 `UNIQUE`，还能保证邮箱不区分大小写也不重复：

```sql run error
CREATE UNIQUE INDEX customers_email_lower_key ON customers (lower(email));

INSERT INTO customers (id, name, email, country, joined_on)
VALUES (13, 'Lin W.', 'LIN.WEI@example.com', 'China', '2024-07-01');
```

`duplicate key value violates unique constraint "customers_email_lower_key"`：大写的邮箱和 Lin Wei 的邮箱算作同一个。

**{{Term:partial-index}}：只索引需要的那部分行。** 如果只查待处理的订单，就只给它们建索引，索引更小，写入也更快：

```sql run
CREATE INDEX orders_pending_idx ON orders (ordered_at)
WHERE status = 'pending';

SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'orders_pending_idx';
```

查询的条件里要包含 `status = 'pending'`，数据库才会用它。

## 深入 {#deeper}

**什么时候索引用不上。**

- 表很小：shop 的 `orders` 只有一页，读整张表比查索引还快。
- 要找的行太多：10 万行里找 99% 的行，数据库会选择直接读表。
- 条件对列做了计算：有 `customer_id` 的索引，`WHERE customer_id + 0 = 42` 或 `WHERE customer_id::text = '42'` 都用不上。要么改写条件，要么建表达式索引。
- `LIKE` 以通配符开头：`email LIKE '%@example.com'` 无法利用排好的顺序，就像在按姓排序的电话簿里找“名字以 Wei 结尾的人”。

**B 树之外。** `USING gin` 适合数组、`jsonb` 和全文搜索；`USING brin` 适合按时间顺序写入的超大表，索引极小；`USING hash` 只支持等号。绝大多数情况用默认的 B 树。

**只读索引就够了。** 如果查询要的列全在索引里，比如 `SELECT customer_id FROM visits WHERE customer_id BETWEEN 10 AND 12`，数据库有时可以只读索引、不回表，计划里显示为 `Index Only Scan`。

**生产环境里建索引。** 普通的 `CREATE INDEX` 在建索引期间会阻止对这张表的写入。大表上要用 `CREATE INDEX CONCURRENTLY`，它慢一些，但不挡写入。它不能在事务里运行，所以 SQL Lab 里用不了。

**外键记得建索引。** 删除一位顾客时，数据库要检查有没有订单引用它，也就是查 `orders.customer_id`。没有索引，就得读遍 `orders`。经常按外键连接或删除被引用的行时，给外键列建索引。

## 常见错误 {#mistakes}

**1. 给每一列都建索引。** 索引越多，写入越慢、占的空间越大，而且很多索引一次也用不上。从真实的慢查询出发，只为常用的条件、连接和排序建索引。

**2. 多列索引的顺序不对。** 查询总是按 `customer_id` 查，索引却建成 `(ordered_at, customer_id)`，这个索引对 `WHERE customer_id = 42` 几乎没有帮助。等值条件的列放在前面，范围和排序的列放在后面。

**3. 在条件里对列做了计算。** 有 `email` 的索引，却写 `WHERE lower(email) = 'lin.wei@example.com'`，索引用不上：

```sql run
CREATE TABLE people AS
SELECT g AS id, 'User' || g || '@Example.com' AS email
FROM generate_series(1, 100000) AS g;
CREATE INDEX ON people (email);
ANALYZE people;

EXPLAIN (COSTS OFF)
SELECT * FROM people WHERE lower(email) = 'user42@example.com';
```

`Seq Scan`。把索引改成 `(lower(email))`，或者让条件直接比较 `email`。

**4. 以为建了索引，小表也会用它。** 在 shop 的 `orders` 上建 `customer_id` 的索引，`EXPLAIN` 里还是 `Seq Scan`。这不是索引坏了，而是表太小，直接读更快。测试性能要用接近真实规模的数据。

**5. 同一个名字建两个索引。** `CREATE INDEX idx ON orders (customer_id)` 之后再 `CREATE INDEX idx ON orders (status)`，会报 `relation "idx" already exists`：索引和表共用一套名字。用 `表名_列名_idx` 这样能说明用途的名字。

## 小结 {#summary}

- 索引是一份按列值排好序的结构，让数据库不读整张表就能找到要的行；默认是 B 树。
- 要不要用索引由查询规划器决定：要找的行少时用索引，多时直接读表；小表通常直接读。
- 索引占空间、拖慢写入，只为常用的条件、连接和排序建。
- 多列索引的列顺序决定它能用在哪里；对列做了计算的条件，要用表达式索引。
- 主键和唯一约束自动带索引，外键不会。
