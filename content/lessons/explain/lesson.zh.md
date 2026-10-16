## 为什么需要它 {#why}

一条报表查询昨天还很快，今天要跑几十秒。是数据变多了？少了索引？还是连接写错了？凭感觉去猜，往往改了半天也没改到点子上。

SQL 只说“要什么”，不说“怎么做”。“怎么做”由数据库自己决定，写在一份{{term:query-plan}}里。`EXPLAIN` 把这份计划拿给你看。上一篇已经用它看过第一行，这一篇学会读整份计划。

## 核心概念 {#core}

### 计划是一棵树

`EXPLAIN` 加在任意一条语句前面，返回的不是查询结果，而是数据库打算怎样执行它：

```sql run
EXPLAIN
SELECT c.name, count(*) AS orders
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
GROUP BY c.name
ORDER BY orders DESC;
```

每一行是一个{{term:plan-node}}，`->` 和缩进表示父子关系。数据从最里层的节点开始产生，一层层往外交给父节点，最外层的节点给出最终结果。所以计划要**从里往外、从下往上**读：

1. `Seq Scan on customers c`：读顾客表。
2. `Hash`：把顾客放进一张以 `id` 为键的哈希表。
3. `Seq Scan on orders o`：读订单表。
4. `Hash Join`：每一笔订单到哈希表里找它的顾客，条件是 `Hash Cond`。
5. `HashAggregate`：按 `Group Key` 分组计数，也就是 `GROUP BY`。
6. `Sort`：按 `Sort Key` 排序，也就是 `ORDER BY`。

这正是第 0 章的逻辑执行顺序：先 `FROM` 和连接，再分组，最后排序。

### 括号里的估算

每个节点后面的括号是{{term:cost-estimate}}：

| 字段 | 意思 |
|---|---|
| `cost=1.27..2.60` | 启动代价..总代价，单位是数据库自定的“代价单位”，不是毫秒；只能拿来比较 |
| `rows=24` | 估计这个节点会输出几行 |
| `width=11` | 估计每行平均几个字节 |

这些全是**估算**，来自数据库收集的{{term:table-statistics}}。`EXPLAIN` 本身不执行查询。

### EXPLAIN ANALYZE：真的跑一遍

加上 `ANALYZE`，数据库会真正执行这条语句，并在每个节点旁边写上实际的情况：

```sql run
EXPLAIN ANALYZE
SELECT * FROM orders WHERE status = 'pending';
```

`actual time` 是这个节点实际用的毫秒数，`rows` 是实际输出的行数，`loops` 是它被执行了几次。`Rows Removed by Filter: 20` 说明读了 24 行、扔掉了 20 行。估算的行数和实际的行数差得很远，往往就是计划选错的原因。

## 语法 {#syntax}

```syntax
EXPLAIN [ ANALYZE ] statement
EXPLAIN ( option [ boolean ] [, …] ) statement
```

| 部分 | 填什么 | 规则 |
|---|---|---|
| `statement` | 任意 `SELECT`、`INSERT`、`UPDATE`、`DELETE` | 不加 `ANALYZE` 时不会执行 |
| `ANALYZE` | 真的执行，并报告实际的时间和行数 | 对修改数据的语句，修改会真的发生 |
| `COSTS OFF` | 不显示括号里的估算 | 只想看计划的形状时很清爽 |
| `TIMING OFF` | 不显示每个节点的时间 | 配合 `ANALYZE` 使用 |
| `BUFFERS OFF`、`SUMMARY OFF` | 不显示读了多少数据页、不显示总时间 | 配合 `ANALYZE` 使用 |
| `FORMAT JSON` | 用 JSON 输出计划 | 给可视化工具用 |

`option [ boolean ]` 里的 `boolean` 是 `ON` 或 `OFF`，省略就是 `ON`。

对照格式读几条：

- `EXPLAIN SELECT …`：第一种形状，只看估算的计划。
- `EXPLAIN ANALYZE SELECT …`：第一种形状，真的执行。
- `EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) SELECT …`：第二种形状，三个选项，`COSTS` 和 `TIMING` 写了 `OFF`。

## 示例 {#example}

问题：为什么在一张新建的大表上，同一条查询的估算和实际差了十倍？怎样修正？

1. **建一张 10 万行的表，不做 `ANALYZE`。** 数据库还没有关于它的统计信息。
2. **用 `EXPLAIN ANALYZE` 看估算和实际。** 估算的 `rows` 在左边的括号里，实际的 `rows` 在右边的括号里。
3. **对比。** 估计 506 行，实际只有 50 行：没有统计信息，数据库只能按默认的比例去猜。

```sql run
CREATE TABLE visits AS
SELECT g AS id, g % 2000 AS customer_id
FROM generate_series(1, 100000) AS g;

EXPLAIN (ANALYZE, BUFFERS OFF, TIMING OFF, SUMMARY OFF)
SELECT * FROM visits WHERE customer_id = 42;
```

4. **收集统计信息再看一次。** `ANALYZE visits` 抽样统计每一列的值分布：

```sql run
CREATE TABLE visits AS
SELECT g AS id, g % 2000 AS customer_id
FROM generate_series(1, 100000) AS g;
ANALYZE visits;

EXPLAIN (ANALYZE, BUFFERS OFF, TIMING OFF, SUMMARY OFF)
SELECT * FROM visits WHERE customer_id = 42;
```

现在估算是 50 行，和实际一致。这里差十倍还不要紧，计划没有变；但在复杂的连接里，估错的行数会让数据库选错连接方式，慢上百倍。真实的数据库会在后台自动 `ANALYZE`，但大批量导入数据之后，手动运行一次更稳妥。

## 变体 {#variants}

**只看形状：`COSTS OFF`。** 去掉估算，计划更好读：

```sql run
EXPLAIN (COSTS OFF)
SELECT name, price
FROM products
WHERE category_id = 2
ORDER BY price DESC
LIMIT 2;
```

从里往外：读 `products` 并用 `Filter` 留下分类 2，`Sort` 按价格排序，`Limit` 取前两行。

**用到了主键的索引。** 按主键查找时，计划里是 `Index Scan using products_pkey`，`Index Cond` 是用索引查找的条件：

```sql run
EXPLAIN (COSTS OFF)
SELECT * FROM products WHERE id = 3;
```

**另一种连接：`Nested Loop`。** 外层每取一行，就到内层去查一次。内层有索引、外层行数很少时，数据库会选它：

```sql run
CREATE TABLE visits AS
SELECT g AS id, g % 2000 AS customer_id
FROM generate_series(1, 100000) AS g;
CREATE TABLE people AS
SELECT g AS id, 'User ' || g AS name
FROM generate_series(0, 1999) AS g;
CREATE INDEX ON visits (customer_id);
ANALYZE visits;
ANALYZE people;

EXPLAIN (COSTS OFF)
SELECT p.name, count(*)
FROM visits AS v
JOIN people AS p ON p.id = v.customer_id
WHERE p.id < 5
GROUP BY p.name;
```

5 个人，每人到索引里查一次。把 `WHERE p.id < 5` 去掉再运行：要连接全部 2000 人时，数据库改用 `Hash Join`。同一条查询，数据不同，计划也不同。

**看修改语句的计划，但不真的修改。** `EXPLAIN ANALYZE` 会真的执行 `DELETE`。把它放进事务里，看完就回滚：

```sql run
BEGIN;
EXPLAIN ANALYZE DELETE FROM order_items WHERE order_id = 3;
ROLLBACK;

SELECT count(*) AS still_there FROM order_items WHERE order_id = 3;
```

## 深入 {#deeper}

**常见的节点。**

| 节点 | 做什么 |
|---|---|
| `Seq Scan` | 从头到尾读整张表 |
| `Index Scan` | 通过索引找到行，再去表里取 |
| `Index Only Scan` | 只读索引就够了，不回表 |
| `Bitmap Index Scan` + `Bitmap Heap Scan` | 先从索引收集所有匹配行的位置，再按顺序成批去表里取 |
| `Nested Loop` | 外层每一行，到内层查一次；适合外层行少、内层有索引 |
| `Hash Join` | 用一边建哈希表，另一边逐行去查；适合两边都较大、条件是等号 |
| `Merge Join` | 两边都按连接列排好序，像拉拉链一样合并 |
| `HashAggregate`、`GroupAggregate` | 分组和聚合，也用于 `DISTINCT` |
| `Sort`、`Limit` | 排序；取前几行 |

**代价是怎么算的。** 读一个数据页按顺序算 1，随机读算 4，处理一行算 0.01，等等。节点的代价把这些加起来。它只在同一份数据、同一台机器上互相比较才有意义。

**统计信息。** `ANALYZE` 抽样记录每一列有多少不同的值、最常见的值、值的分布。规划器靠它估算 `WHERE` 能留下几行、连接会产生几行。真实的 PostgreSQL 由后台的 autovacuum 定期更新它。SQL Lab 在载入 shop 时就做了一次 `ANALYZE`，所以 shop 的估算是准的；你在一次运行里新建的表，则需要自己 `ANALYZE`。

**可视化工具。** 计划很长时，用 `EXPLAIN (ANALYZE, FORMAT JSON)` 得到 JSON，再贴到在线的计划可视化工具里，可以看到一棵带颜色的树，最慢的节点一目了然。

**其他数据库。** MySQL 8 和 SQLite 也有 `EXPLAIN`（SQLite 常用 `EXPLAIN QUERY PLAN`），SQL Server 在图形界面里显示执行计划，Oracle 用 `EXPLAIN PLAN FOR`。输出各不相同，但都是一棵节点树。

## 常见错误 {#mistakes}

**1. 从上往下读计划。** 第一行是最后完成的那一步。读计划要从缩进最深的节点开始，往外、往上读。

**2. 把 `cost` 当成毫秒。** `cost=1.27..2.60` 是代价单位，不是时间。想知道真实的时间，用 `EXPLAIN ANALYZE` 看 `actual time`。

**3. 对修改语句用 `EXPLAIN ANALYZE`，结果数据真的改了。**

```sql run
EXPLAIN (ANALYZE, COSTS OFF, BUFFERS OFF, TIMING OFF, SUMMARY OFF)
DELETE FROM order_items WHERE order_id = 3;

SELECT count(*) AS left_over FROM order_items WHERE order_id = 3;
```

明细已经删掉了。在真实的数据库里，这样做就是真的删除。要看修改语句的实际执行情况，先 `BEGIN`，看完 `ROLLBACK`。

**4. 在很小的数据上判断计划好坏。** shop 每张表只有几十行，几乎所有查询都是 `Seq Scan`，这完全正确。同一条查询到了几百万行，计划会完全不同。分析性能要用接近真实规模的数据。

**5. 新建或大量导入数据后忘了 `ANALYZE`。** 没有统计信息，估算可能差上十倍、百倍，规划器就会选错计划。见“示例”。

## 小结 {#summary}

- `EXPLAIN` 显示数据库打算怎样执行一条语句，计划是一棵节点树，从最里层往外读。
- 括号里的 `cost`、`rows`、`width` 是估算，`cost` 的单位不是毫秒。
- `EXPLAIN ANALYZE` 真的执行语句，显示实际的时间、行数和循环次数；对修改语句要放进事务里再回滚。
- 估算行数和实际行数差很多，常常是计划选错的原因；新表或大量导入后运行 `ANALYZE`。
- 同一条查询，数据规模不同，计划也不同；用接近真实规模的数据来判断。
