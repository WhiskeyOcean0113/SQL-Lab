## 为什么需要它 {#why}

“shop 一共卖出了多少件商品？”

答案就在 `order_items` 里：每一行是某笔订单里的一种商品，`quantity` 是这种商品买了几件。可是用目前学过的 SQL，你只能把这些行列出来：

```sql run
SELECT order_id, product_id, quantity
FROM order_items;
```

42 行，每行一个数。要得到总数，你只能自己把 42 个数加起来。到目前为止，你写的每条查询都是“一行进、一行出”：`WHERE` 能去掉一些行，`round()` 这样的函数能改写每一行的值，但没有哪一样能把很多行合成一个答案。

## 核心概念 {#core}

{{Term:aggregate-function}}做的正是这件事：读入很多行，每行取一个值，最后只交出一个值。`sum(quantity)` 把所有行的 `quantity` 加起来，`count(*)` 数一共有几行，`avg`、`min`、`max` 分别求平均值、最小值和最大值。

拿第 2 章的函数来比，区别就很清楚。`round(price)` 每行算一次，16 行进去，16 行出来；`max(price)` 把 16 个价格放在一起比，只交出 1 个值。前者是逐行计算，后者是{{term:aggregation}}。

下面一步步看，订单 3 的三行明细怎样被汇总成一行：

```steps
- sql: |
    SELECT order_id, product_id, quantity, unit_price
    FROM order_items
    WHERE order_id = 3;
  say: "`FROM` 取出所有明细，`WHERE` 只留下订单 3 的三行。这三行就是要汇总的输入。"
- sql: |
    SELECT quantity, unit_price, quantity * unit_price AS line_total
    FROM order_items
    WHERE order_id = 3;
  say: "{{Term:expression}} `quantity * unit_price` 每行算一次，得出每行的金额。这一步仍是逐行计算：三行进，三行出。"
- sql: |
    SELECT sum(quantity * unit_price) AS order_total
    FROM order_items
    WHERE order_id = 3;
  say: "`sum` 把三行的金额 39.98、28.50、28.00 加在一起，得到 96.48。三行进，一行出。"
- sql: |
    SELECT count(*) AS lines, sum(quantity) AS units,
           sum(quantity * unit_price) AS order_total, max(unit_price) AS dearest
    FROM order_items
    WHERE order_id = 3;
  say: "一个 `SELECT` 里可以有好几个{{term:aggregate-function}}。它们汇总的是同一批行，所以结果仍然只有一行，每列一个汇总值。"
```

放进{{term:logical-order}}里看：`FROM` 取出行，`WHERE` 逐行判断、筛掉不要的，剩下的行一起交给聚合函数，最后 `SELECT` 输出汇总的结果。`WHERE` 在汇总之前执行，所以它决定的是“汇总哪些行”。

结果只有一行，由此得出一条规则：**聚合之后，`SELECT` 里只能放汇总值**，或者由汇总值算出来的表达式。假如在最后一步再加一列 `product_id`：三行明细有三个不同的 `product_id`，结果却只有一行，放哪一个？数据库不替你随便挑，而是直接报错。

一行都没有可汇总时，结果仍然是一行。订单 24 没有任何明细：

```sql run
SELECT count(*) AS lines, sum(quantity) AS units
FROM order_items
WHERE order_id = 24;
```

`count(*)` 数到 0 行，返回 0。`sum` 没有一个可加的值，返回 NULL：意思是“没有答案”，而不是“答案是 0”。`avg`、`min`、`max` 也是这样，没有值可比，就谈不上最大值。

```check
query: |
  SELECT count(*) AS lines, sum(quantity) AS units
  FROM order_items
  WHERE product_id = 8;
question: Ceramic Mug（商品 8）出现在 4 行明细里，分别买了 2、4、6、1 件。这条查询返回什么？
choices:
  - 4 行，每行一个 `quantity`
  - 1 行：`lines` 是 4，`units` 是 13
  - 1 行：`lines` 是 13，`units` 是 13
  - 1 行：`lines` 是 4，`units` 是 4
answer: 1
explain: 两个聚合函数汇总的是同一批 4 行。`count(*)` 数行，得 4；`sum(quantity)` 把每行的件数加起来，2 + 4 + 6 + 1 = 13。结果只有一行。
verify: { rows: 1 }
```

## 语法 {#syntax}

这一课的查询，{{term:select-list}}里放的都是聚合表达式：

```syntax
SELECT aggregate_expression [ AS output_name ] [, …]
FROM table_name
[ WHERE condition ]
```

`aggregate_expression` 是一个聚合函数调用，或者由聚合函数调用和常量组成的表达式。本课的聚合函数：

```syntax
count(*)
count([ DISTINCT ] expression)
sum(expression)
avg(expression)
min(expression)
max(expression)
bool_and(expression)
bool_or(expression)
```

| 部分 | 填什么 | 能否省略 |
|---|---|---|
| `aggregate_expression` | 比如 `count(*)`、`round(avg(price), 2)`、`max(price) - min(price)` | 不能，至少一个 |
| `*` | 只用在 `count` 里，意思是“数行”，不看任何一列的值 | 写 `count(*)` 时不能 |
| `expression` | 一列，或者每行都能算出一个值的表达式，比如 `quantity * unit_price` | 不能 |
| `DISTINCT` | 先去掉重复的值，再数 | 可以；不写就数每一行的值 |
| `condition` | 只看单行就能判断的条件；不能含聚合函数 | 可以；不写就汇总整张表 |

| 函数 | 返回 | 能用于 |
|---|---|---|
| `count` | 行数，或值的个数 | 任何类型 |
| `sum` / `avg` | 总和 / 平均值 | 数值 |
| `min` / `max` | 最小值 / 最大值 | 能比较大小的类型：数字、文字、日期、时间戳 |
| `bool_and` / `bool_or` | 是否每一行都为 true / 是否至少一行为 true | {{term:boolean}}，通常是一个条件，比如 `stock > 0` |

聚合函数调用本身也是一个表达式，这有两层意思。一是它的参数可以是表达式：`sum(quantity * unit_price)` 先逐行算出金额，再求和。二是它的结果可以放进更大的表达式：`round(avg(price), 2)`、`max(price) - min(price)`。它能写在{{term:select-list}}里，不能写在 `WHERE` 里，因为 `WHERE` 执行时还没开始汇总。

对照格式读几个表达式：

- `count(*)`：数行，不看任何列。
- `count(DISTINCT customer_id)`：有 `DISTINCT`，数的是有多少个不同的顾客编号。
- `bool_or(stock = 0)`：`expression` 是一个条件，每行得出 true 或 false；只要有一行是 true，结果就是 true。

## 示例 {#example}

问题：2024 年第二季度（4 月到 6 月）有多少笔订单，来自多少位不同的顾客？第一笔和最后一笔分别是什么时候下的？

1. **圈出要汇总的行。** 第二季度的订单，用第 1 章的半开区间：`ordered_at >= '2024-04-01' AND ordered_at < '2024-07-01'`。这个条件只看单行，所以写在 `WHERE` 里。
2. **为每个问题选一个函数。** “多少笔订单”是数行，`count(*)`；“多少位顾客”要去掉重复的顾客，`count(DISTINCT customer_id)`；“第一笔”是最早的时间，`min(ordered_at)`；“最后一笔”是 `max(ordered_at)`。
3. **给每个结果起名。** 不起{{term:alias}}，列名就是函数名，四列里会有两列都叫 `count`。

```sql run
SELECT count(*) AS orders,
       count(DISTINCT customer_id) AS customers,
       min(ordered_at) AS first_order,
       max(ordered_at) AS last_order
FROM orders
WHERE ordered_at >= '2024-04-01' AND ordered_at < '2024-07-01';
```

14 笔订单，来自 10 位顾客：有几位顾客在这三个月里下了不止一单。`min` 和 `max` 不只比较数字：时间戳按先后比，文字按字母顺序比。

```check
query: |
  SELECT count(*) AS orders, count(DISTINCT customer_id) AS customers
  FROM orders
  WHERE status = 'delivered';
question: 不看数据，下面哪一点对任何数据都成立？
choices:
  - "`customers` 不会大于 `orders`"
  - "`customers` 一定等于 `orders`"
  - "`customers` 可能大于 `orders`"
  - "两列都是 1，因为聚合查询只返回一行"
answer: 0
explain: 每笔订单只有一位顾客，`DISTINCT` 只会去掉重复的编号，所以顾客数只会和订单数相等或更少。这里是 11 笔订单、10 位顾客：有一位顾客收到了两笔。结果确实只有一行，但一行里的值是数出来的个数，不是 1。
```

## 变体 {#variants}

**用汇总结果再计算。** 价格的跨度是最高价减最低价，平均价保留两位小数：

```sql run
SELECT max(price) - min(price) AS price_range,
       round(avg(price), 2) AS avg_price
FROM products;
```

`max(price)` 和 `min(price)` 各自先汇总成一个值，然后才相减；`round` 处理的也是 `avg` 交出的那一个值。

**汇总真假：`bool_or` 和 `bool_and`。** “有没有超过 300 美元的商品？”“是不是每件商品都有库存？”

```sql run
SELECT bool_or(price > 300) AS any_over_300,
       bool_and(stock > 0) AS all_in_stock
FROM products;
```

4K Monitor 一件商品就决定了两个答案：它卖 399 美元，所以 `bool_or` 是 true；它的库存是 0，所以 `bool_and` 是 false。`bool_or` 回答“是否至少有一行”，`bool_and` 回答“是否每一行都”。

**先算再汇总，还是先汇总再算？** 同样用数量和单价，下面两列的结果相差很远：

```sql run
SELECT sum(quantity * unit_price) AS order_total,
       sum(quantity) * sum(unit_price) AS not_a_total
FROM order_items
WHERE order_id = 3;
```

第一列先逐行相乘、再相加，是订单 3 真正的金额 96.48。第二列先把件数加成 6、把单价加成 57.49，再相乘，得到 344.94：等于让每一件商品都按三行单价的总和来算，没有意义。列里没有 NULL 时，加法可以拆开，`sum(a + b)` 等于 `sum(a) + sum(b)`；乘法不行。

## 深入 {#deeper}

**结果的类型。** `count` 返回 `bigint`；整数的 `sum` 也返回 `bigint`，加得再多也不会溢出；`avg` 返回精确的 `numeric`，小数位很长，通常要配 `round`：

```sql run
SELECT avg(quantity) AS raw_avg, round(avg(quantity), 2) AS rounded
FROM order_items;
```

`quantity` 是整数，`avg` 却不做{{term:integer-division}}，1.64 不会变成 1。自己写成 `sum(quantity) / count(*)` 就会得到 1，因为那是两个整数相除。

**聚合函数不能嵌套。** `avg` 已经把所有行变成一个值，`max` 没有“很多行”可比了：

```sql run error
SELECT max(avg(price))
FROM products;
```

## 常见错误 {#mistakes}

**1. 想要“最贵商品的名字”，就把 `name` 和 `max(price)` 写在一起。**

```sql run error
SELECT name, max(price)
FROM products;
```

报错：`column "products.name" must appear in the GROUP BY clause or be used in an aggregate function`。很多人以为 `max` 会顺便把那一行带出来，可 `max(price)` 只交出一个价格，不记得它来自哪一行；`name` 却有 16 个，放不进一行。错误信息里的 `GROUP BY` 是把行分成多组的子句；这里没有它，整张表就是一组。找“最贵的那一件”其实不需要聚合，排序后取第一行即可：

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
WHERE price = max(price);
```

报错：`aggregate functions are not allowed in WHERE`。`WHERE` 逐行判断，判断第一行时，最高价还没算出来。`WHERE` 里的条件只能用这一行自己的值，比如 `quantity * unit_price > 100`。要找取到最大值的那一行，用上面的排序写法。

**3. 该用 `sum` 的地方用了 `count`。** “卖出了多少件”要把每行的 `quantity` 加起来；`count(quantity)` 只数有几行明细：

```sql run
SELECT count(quantity) AS lines, sum(quantity) AS units
FROM order_items;
```

42 行明细，69 件商品。日常说的“多少”两种意思都有，写之前先问自己：数的是行，还是行里的数？

**4. 对错误的行求平均。** “一笔订单平均多少钱”写成 `avg(quantity * unit_price)`，得到的是 76.57。可 `order_items` 的一行是一行明细，不是一笔订单，所以这是“每行明细平均多少钱”。`avg` 的分母是参与汇总的行数，而这里的行数和订单数并不相同：

```sql run
SELECT count(*) AS lines, count(DISTINCT order_id) AS orders
FROM order_items;
```

42 行明细只属于 23 笔订单。求平均之前先问：平均的是“每个什么”？表里的一行是不是这个“什么”？

## 小结 {#summary}

- {{Term:aggregate-function}}把很多行汇总成一个值：`count(*)` 数行，`sum`、`avg`、`min`、`max` 汇总一列或一个表达式，`bool_or`、`bool_and` 汇总真假。
- `WHERE` 在汇总之前逐行筛选，决定哪些行参与汇总；所以 `WHERE` 里不能有聚合函数。
- 有聚合函数而没有 `GROUP BY` 时，结果总是一行，即使没有行可汇总：`count` 得 0，其他函数得 NULL。
- 聚合之后，`SELECT` 里只能放汇总值；要找取到最大值的那一行，用 `ORDER BY … LIMIT 1`。
- 动手之前先想清楚：数的是行还是数量，平均的是每个什么。

## 参考 {#reference}

- `count(1)` 和 `count(*)` 结果相同，速度也没有可感知的差别。`count(*)` 是标准写法，意思最直白：数行。
- `sum` 和 `avg` 也接受 `DISTINCT`：`sum(DISTINCT quantity)` 先去掉重复的件数再加，得 21，而不是 69。只有问题真要“不同的值之和”时才这样写。
- 标准 SQL 把 `bool_and` 叫作 `every`，PostgreSQL 两个名字都认。标准里与 `bool_or` 对应的 `any` 和 `some`，PostgreSQL 不支持，因为它们和 `= ANY (…)` 的写法有歧义。
- 数不同的组合，要把几列用括号合成一个值：`count(DISTINCT (customer_id, status))`。MySQL 允许 `count(DISTINCT customer_id, status)`，PostgreSQL 会报错。
- SQLite 和关闭了 `ONLY_FULL_GROUP_BY` 的 MySQL 会执行 `SELECT name, max(price) FROM products`：SQLite 恰好取最大值所在的那一行，MySQL 取任意一行。PostgreSQL 报错，是在防止你得到一个看似合理的错误答案。
- 在 PostgreSQL 里，对整张表 `count(*)` 要扫描整张表或一个包含所有行的索引，表很大时并不是瞬间完成。
