## 为什么需要它 {#why}

“shop 一共卖多少种商品？平均价格是多少？最便宜和最贵的各是多少钱？”

到目前为止，你写的每条查询都是一行进、一行出：`products` 有 16 行，结果最多也是 16 行，每一行描述一件商品。可这几个问题问的不是某一件商品，而是**所有商品放在一起**的情况。答案只有一行。

## 核心概念 {#core}

{{Term:aggregate-function}}把很多行的值汇总成一个值。最常用的五个：

| 函数 | 作用 |
|---|---|
| `count(*)` | 数一共有多少行 |
| `sum(x)` | 求和 |
| `avg(x)` | 平均值 |
| `min(x)` / `max(x)` | 最小值 / 最大值 |

```sql run
SELECT count(*) AS products, sum(stock) AS units,
       avg(price) AS avg_price, min(price) AS cheapest, max(price) AS dearest
FROM products;
```

16 行进去，1 行出来。这就是{{term:aggregation}}：不再是“每行一个结果”，而是“一组行一个结果”。没有 `GROUP BY` 时（下一篇讲），整张表就是一组。

放回{{term:logical-order}}里看：`FROM` 取出行，`WHERE` 先把不要的行筛掉，剩下的行才交给聚合函数，最后 `SELECT` 输出汇总结果。所以 `WHERE` 决定了“汇总哪些行”。

## 语法 {#syntax}

```syntax
count(*)
count([ DISTINCT ] expression)
sum([ DISTINCT ] expression)
avg([ DISTINCT ] expression)
min(expression)
max(expression)
```

| 部分 | 填什么 | 说明 |
|---|---|---|
| `*` | 只能用在 `count` 里 | 数行数，不看任何一列的值 |
| `expression` | 列名或表达式，比如 `quantity * unit_price` | 对每一行算出一个值，再把这些值汇总 |
| `DISTINCT` | 可选 | 先去掉重复的值，再汇总 |

| 函数 | 能用于 | 结果的类型 |
|---|---|---|
| `count` | 任何类型 | `bigint` |
| `sum`、`avg` | 数值 | 整数求和得 `bigint`；`avg` 和 `numeric` 求和得 `numeric` |
| `min`、`max` | 能比较大小的类型：数字、文字、日期、时间戳 | 和输入相同 |

**聚合函数调用本身也是一个表达式。** 所以它能放进更大的表达式里：`round(avg(price), 2)`、`max(price) - min(price)` 都可以。但它只能出现在 `SELECT` 列表、`HAVING` 和 `ORDER BY` 里，不能出现在 `WHERE` 里，也不能套在另一个聚合函数里面。原因都在逻辑顺序里：`WHERE` 执行时，还没有开始汇总。

对照格式读几个表达式：

- `count(*)`：数行数。
- `count(DISTINCT customer_id)`：用了 `DISTINCT`，数有多少个不同的顾客编号。
- `sum(quantity * unit_price)`：`expression` 是一个乘法，每一行先算出金额，再求和。

## 示例 {#example}

问题：2024 年 6 月一共有多少笔订单？第一笔和最后一笔是什么时候下的？

1. **先圈出要汇总的行。** 6 月的订单，用第 1 章的半开区间：`ordered_at >= '2024-06-01' AND ordered_at < '2024-07-01'`。
2. **再决定每个问题用哪个函数。** “多少笔”是 `count(*)`；“第一笔”是最早的时间 `min(ordered_at)`；“最后一笔”是 `max(ordered_at)`。
3. **给每个结果起名字。** 聚合结果默认的列名就是函数名，起个别名更好读。

```sql run
SELECT count(*) AS orders,
       min(ordered_at) AS first_order,
       max(ordered_at) AS last_order
FROM orders
WHERE ordered_at >= '2024-06-01' AND ordered_at < '2024-07-01';
```

7 笔订单，最早 6 月 4 日，最晚 6 月 28 日。`min` 和 `max` 不只能比较数字，时间、日期和文字都可以比较大小。

## 变体 {#variants}

**汇总一个表达式。** 聚合函数的参数可以是任何表达式。`order_items` 里每一行的金额是数量乘单价，全部加起来就是总销售额：

```sql run
SELECT sum(quantity * unit_price) AS revenue,
       count(*) AS order_lines,
       sum(quantity) AS units
FROM order_items;
```

注意 `count(*)` 和 `sum(quantity)` 的区别：42 是订单明细的行数，69 是卖出的件数。一行明细可能买了好几件。

**只数不同的值：`count(DISTINCT x)`。** 有多少位顾客下过单？

```sql run
SELECT count(*) AS orders, count(DISTINCT customer_id) AS customers
FROM orders;
```

24 笔订单，来自 10 位不同的顾客。

**聚合结果参与计算。** 价格的跨度是最高价减最低价，平均价保留两位小数：

```sql run
SELECT max(price) - min(price) AS price_range,
       round(avg(price), 2) AS avg_price
FROM products;
```

**真假值的汇总：`bool_or` 和 `bool_and`。** “有没有卖完的商品？”“是不是所有商品都超过 5 美元？”：

```sql run
SELECT bool_or(stock = 0) AS any_sold_out,
       bool_and(price > 5) AS all_over_5
FROM products;
```

`bool_or` 在至少一行为 true 时返回 true，`bool_and` 要求每一行都为 true。标准 SQL 里 `bool_and` 叫 `every`，PostgreSQL 两个名字都认。

**文字和日期的最小、最大值。** 文字按字母顺序比较，日期按先后比较：

```sql run
SELECT min(name) AS first_name, max(name) AS last_name,
       min(joined_on) AS earliest, max(joined_on) AS latest
FROM customers;
```

## 深入 {#deeper}

**结果的类型。** `count` 返回 `bigint`；整数的 `sum` 也返回 `bigint`，防止相加溢出；`avg` 返回精确的 `numeric`，小数位很多，通常要 `round`：

```sql run
SELECT avg(stock) AS raw_avg, round(avg(stock), 1) AS rounded
FROM products;
```

和第 2 章的整数除法不同，`avg` 不会把小数丢掉。

**没有行可以汇总时，仍然返回一行。** 没有一件商品贵过 1000 美元，但下面这条查询照样返回一行，`count` 是 0：

```sql run
SELECT count(*) AS products
FROM products
WHERE price > 1000;
```

只要有聚合函数、又没有 `GROUP BY`，结果就**永远是一行**。这时 `sum`、`avg`、`min`、`max` 返回的是 NULL，本章最后一篇会专门讲。

**`count(1)` 和 `count(*)` 一样。** 很多人写 `count(1)`，以为比 `count(*)` 快。在 PostgreSQL 里两者结果相同，速度也没有可感知的差别。`count(*)` 是标准写法，意思最清楚：数行。

**`DISTINCT` 也能用于 `sum` 和 `avg`，但很少是你想要的。** `sum(DISTINCT quantity)` 是 21，而 `sum(quantity)` 是 69：前者先把相同的数量去重再加，两行都买了 2 件，只算一次。除非问题明确要“不同的值之和”，否则不要这样写。

**聚合函数不能嵌套。** `max(avg(price))` 会报错：一层聚合把很多行变成一个值，再聚合一次就没有“很多行”了。这类问题要用第 5 章的子查询。

**SQLite 和 MySQL 的不同。** 下面“常见错误”里的第一条，在 PostgreSQL 里会报错，SQLite 却会照样执行：和 `max` 写在一起时，它恰好取最大值所在的那一行，换成别的写法就是任意一行。MySQL 关闭 `ONLY_FULL_GROUP_BY` 时也会执行，取任意一行的值。PostgreSQL 的严格是在保护你。

## 常见错误 {#mistakes}

**1. 想要“最贵商品的名字”，就把 `name` 和 `max(price)` 写在一起。**

```sql run error
SELECT name, max(price)
FROM products;
```

`max(price)` 把 16 行变成一个值，`name` 却还有 16 个，数据库无法把它们放进同一行。聚合之后，只有汇总值还能选。要找最贵的那件商品，不需要聚合，排序取第一行就行：

```sql run
SELECT name, price
FROM products
ORDER BY price DESC
LIMIT 1;
```

**2. 把聚合函数写进 `WHERE`。**

```sql run error
SELECT name, price
FROM products
WHERE price > avg(price);
```

`WHERE` 在聚合之前逐行执行，那时平均值还不存在。对汇总结果的条件写在 `HAVING` 里（本章第三篇）；“比平均价贵的商品”这种问题要用第 5 章的子查询。

**3. 该用 `sum` 的地方用了 `count`。** “卖出了多少件”是 `sum(quantity)`；`count(quantity)` 只是数有多少行明细。日常说的“多少”，要先想清楚数的是行，还是行里的数量。

**4. 在 `count(DISTINCT …)` 里写两列。** MySQL 允许 `count(DISTINCT customer_id, status)`，PostgreSQL 不允许：

```sql run error
SELECT count(DISTINCT customer_id, status)
FROM orders;
```

报 `function count(integer, text) does not exist`：按格式，`count` 的括号里只能有一个 `expression`。要数不同的组合，把两列用括号包成一个整体：`count(DISTINCT (customer_id, status))`，结果是 23。

**5. 以为条件不满足就没有结果。** `WHERE` 筛掉了所有行，结果依然是一行：`count` 为 0，其他函数为 NULL。

## 小结 {#summary}

- {{Term:aggregate-function}}把很多行汇总成一个值：`count(*)`、`sum`、`avg`、`min`、`max`。
- `WHERE` 先筛选行，剩下的行才被汇总。
- 有聚合、没有 `GROUP BY` 时，结果永远是一行，即使没有行可以汇总。
- 聚合之后不能再选普通列；`count(DISTINCT x)` 只数不同的值。
- 聚合函数不能写在 `WHERE` 里，也不能嵌套。
