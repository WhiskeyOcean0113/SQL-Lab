## 为什么需要它 {#why}

“每位顾客各下过几笔订单？”

上一课的{{term:aggregate-function}}能回答“一共有几笔”：`count(*)` 把 24 行订单汇总成一个数。要问某一位顾客，可以先用 `WHERE` 只留下他的订单：

```sql run
SELECT count(*) AS orders
FROM orders
WHERE customer_id = 1;
```

顾客 1 下过 4 笔。可是下过单的顾客有 10 位，照这样就得写 10 条查询，每条只改一个数字，还得事先知道有哪些编号。你真正想要的是一条查询、一张表：每位顾客一行，每行带着他自己的订单数。

## 核心概念 {#core}

### 先分组，再把每组压成一行

`GROUP BY customer_id` 做两件事。第一，把 `customer_id` 相同的{{term:row}}放进同一{{term:group|组}}。第二，把每组压缩成一行输出，聚合函数在每组里分别计算。没有 `GROUP BY` 时，整张表就是一组，所以上一课的聚合查询总是只返回一行；有了它，就变成每组一行。

下面只看顾客 1、2、3 的订单，一步一步看这个过程：

```steps
- sql: |
    SELECT customer_id, id, status
    FROM orders
    WHERE customer_id IN (1, 2, 3)
    ORDER BY customer_id, id;
  say: 先看原始数据：3 位顾客的 10 笔订单。颜色按 `customer_id` 区分，颜色相同的行会进同一组。
  group: customer_id
- sql: |
    SELECT customer_id, count(*) AS orders
    FROM orders
    WHERE customer_id IN (1, 2, 3)
    GROUP BY customer_id
    ORDER BY customer_id;
  say: 加上 `GROUP BY customer_id`，每种颜色压缩成一行。`count(*)` 数的是这一组里的行，所以分别是 4、3、3。
  group: customer_id
- sql: |
    SELECT customer_id, status, count(*) AS orders
    FROM orders
    WHERE customer_id IN (1, 2, 3)
    GROUP BY customer_id, status
    ORDER BY customer_id, status;
  say: 再把 `status` 也写进 `GROUP BY`：顾客和状态都相同才算一组。只有顾客 1 的两笔 delivered 还在一起，结果变成 9 行。
  group: customer_id
```

### 每一项在组内只能有一个值

压缩之后每组只剩一行，所以 `SELECT` 里的每一项都必须给得出一个值。{{Term:grouping-column}}可以：组就是按它分出来的，同一组里它的值必然相同。聚合函数也可以：它的工作就是把很多值变成一个。由这两种组成的表达式同样可以，比如 `count(*) * 2`。

其他列就不行了。顾客 1 这一组有 4 笔订单，状态是 delivered、delivered、shipped、pending，而输出的那一行只有一个格子：

```sql run error
SELECT customer_id, status, count(*) AS orders
FROM orders
GROUP BY customer_id;
```

PostgreSQL 报错：`column "orders.status" must appear in the GROUP BY clause or be used in an aggregate function`。它不替你随便挑一个值，因为挑哪一个都可能是错的。

### 粒度：结果的每一行代表什么

第二步和第三步用的是同样的 10 行，只多了一个分组列，结果的意思就变了：第二步的一行是“一位顾客”，第三步的一行是“一位顾客的一种状态”。结果的一行代表什么，叫作它的{{term:grain}}。粒度由分组列决定：按 `customer_id` 分组，每位顾客一行；按 `customer_id, status` 分组，每个“顾客 + 状态”的组合一行。

所以写分组查询的第一步不是写 SQL，而是回答一个问题：结果要“每个什么一行”？问题说“每位顾客”，就按顾客分组，分组列一个不多，一个不少。多一列，组被切得更碎；少一列，不该合在一起的行被合在了一起。这两种情况下查询都能正常运行，只是答的已经不是你的问题了。

### 它在逻辑执行顺序里的位置

在{{term:logical-order}}里，`GROUP BY` 排在 `WHERE` 之后、`SELECT` 之前：

`FROM` → `WHERE` → `GROUP BY` → `SELECT` → `ORDER BY`

上面的规则都来自这个顺序。`WHERE` 先逐行筛选，留下来的行才会被分组，所以 `WHERE customer_id IN (1, 2, 3)` 决定了哪些订单参与分组。`SELECT` 在分组之后才计算，它面对的不再是一行一行的订单，而是一个一个的组，所以只能写每组只有一个值的东西。

```check
query: |
  SELECT status, count(*) AS orders
  FROM orders
  WHERE customer_id IN (1, 2, 3)
  GROUP BY status
  ORDER BY status;
question: 还是这 10 笔订单，这次按 `status` 分组。delivered 那一行的 `orders` 是多少？
choices: ['1', '3', '4', '10']
answer: 2
explain: 现在一组是“一种状态”，不再是“一位顾客”。delivered 组里有订单 1、4、2、3：顾客 1 的两笔，加上顾客 2 和顾客 3 各一笔，一共 4 行。`count(*)` 数的是组里的订单行，不是顾客人数，所以不是 3。
```

## 语法 {#syntax}

`GROUP BY` 写在 `WHERE` 之后、`ORDER BY` 之前，书写顺序和逻辑顺序一致：

```syntax
SELECT select_list
FROM table_name
[ WHERE condition ]
[ GROUP BY grouping_element [, …] ]
[ ORDER BY expression [ ASC | DESC ] [, …] ]
```

| 占位符 | 可以填什么 | 能否省略 |
|---|---|---|
| `grouping_element` | 一列，或一个由列算出来的{{term:expression}} | 整个 `GROUP BY` 可以省略，省略时整张表是一组 |
| `[, …]` | 更多分组元素，用逗号隔开 | 可以；写了几个，就按它们的组合分组 |
| `select_list` | 有 `GROUP BY` 时，每一项只能是分组元素、聚合函数，或由这两者组成的表达式 | 不能 |

对照格式读几条：

- `GROUP BY status`：一个分组元素，每种状态一组。
- `GROUP BY customer_id, status`：两个分组元素，每个“顾客 + 状态”组合一组。
- `SELECT price >= 50 AS over_50, count(*) … GROUP BY price >= 50`：分组元素是一个表达式，`SELECT` 里写的是同一个表达式，所以符合规则。

把一组里的文字连成一个字符串的 `string_agg` 也是聚合函数：

```syntax
string_agg(expression, delimiter [ ORDER BY expression [, …] ])
```

`delimiter` 是夹在各段文字之间的分隔符，比如 `', '`。括号里的 `ORDER BY` 决定组内各段的先后，可以省略，省略时先后没有保证。它和查询末尾的 `ORDER BY` 是两回事：后者排的是结果的行。

## 示例 {#example}

问题：每件商品一共卖出了多少件、带来多少销售额？销售额高的排在前面。

1. **定粒度。** 问的是“每件商品”，所以结果的一行是一件商品，按 `product_id` 分组。数据在 `order_items` 里，它的一行是“某笔订单里的一种商品”，同一件商品会出现在好几笔订单里，正需要合并。
2. **定每组算什么。** 卖出的件数是这一组 `quantity` 的和；销售额是每行 `quantity * unit_price` 的和：先逐行相乘，再在组内相加。
3. **查 `SELECT`。** `product_id` 是分组列，另外两项是聚合，每组各一个值。`quantity` 和 `unit_price` 只出现在聚合函数里面，这没有问题。
4. **排序。** 按销售额从高到低；销售额相同时按商品编号，让结果每次都一样。

```sql run
SELECT product_id,
       sum(quantity) AS units,
       sum(quantity * unit_price) AS revenue
FROM order_items
GROUP BY product_id
ORDER BY revenue DESC, product_id;
```

结果是 15 行，而 shop 有 16 件商品。Folding Chair（16 号）从没被订购过，`order_items` 里没有它的行，也就没有它的组。`GROUP BY` 只给已有的行分组，不会凭空造出一个空组。

```check
query: |
  SELECT product_id, count(*) AS lines, sum(quantity) AS units
  FROM order_items
  GROUP BY product_id
  ORDER BY product_id;
question: Ceramic Mug（8 号商品）在 4 笔订单里被买过，分别买了 2、4、6、1 个。结果里它是什么样子？
choices:
  - 一行：lines 是 1，units 是 13
  - 一行：lines 是 4，units 是 4
  - 一行：lines 是 4，units 是 13
  - 4 行，每行 lines 都是 1
answer: 2
explain: 按 `product_id` 分组，8 号商品的 4 条明细合成一组，只输出一行。`count(*)` 数的是组里的行，所以 `lines` 是 4；`sum(quantity)` 把 2、4、6、1 加起来，所以 `units` 是 13。“几条明细”和“几个商品”是两个不同的问题。
```

## 变体 {#variants}

### 按一个条件分组

分组元素不一定是现成的列，可以是任何由列算出来的表达式。一个真假条件只有 true 和 false 两种值，于是行被分成两组。价格在 50 美元及以上的商品和其他商品，各有几件、平均多少钱：

```sql run
SELECT price >= 50 AS over_50,
       count(*) AS products,
       round(avg(price), 2) AS avg_price
FROM products
GROUP BY price >= 50;
```

`SELECT` 里的 `price >= 50` 和 `GROUP BY` 里的是同一个表达式，所以它在组内只有一个值。换成 `CASE` 表达式，就能分出两档以上；换成 `extract(year FROM …)`，就能按年份统计。

### 把组里的文字连起来：`string_agg`

想在每组那一行里看到组内都有谁，不能直接选 `name`，因为它在组内有很多个值。`string_agg` 把这些值连成一个字符串，于是它也只有一个值了：

```sql run
SELECT country, string_agg(name, ', ' ORDER BY name) AS names
FROM customers
GROUP BY country
ORDER BY country;
```

China 那一行的 `names` 是 `Chen Yu, Lin Wei, Zhang Min`：三位顾客合进了一个格子。

## 深入 {#deeper}

### NULL 自成一组

有两位顾客的 `city` 是 NULL。按 `city` 分组时，他们进了同一组：

```sql run
SELECT city, count(*) AS customers
FROM customers
GROUP BY city
ORDER BY city;
```

`NULL = NULL` 的结果不是 true，但分组和 `DISTINCT` 一样，把所有 NULL 看作同一个值。所以 NULL 既不会被丢掉，也不会各自成组，而是合成一个“城市未知”的组。

### 分组不带来顺序

结果按什么顺序出来，取决于 PostgreSQL 选的执行方式，数据一变就可能跟着变。要顺序，就写 `ORDER BY`。

### 按主键分组

`id` 是 `customers` 的{{term:primary-key}}，每个 `id` 只对应一行，所以按它分组时，`name` 在每组里也只有一个值。PostgreSQL 认得这种{{term:functional-dependency}}，允许直接选：

```sql run
SELECT id, name, country
FROM customers
GROUP BY id
ORDER BY id;
```

它只认主键。按 `name` 分组再选 `country` 仍然会报错，哪怕现在的数据里名字恰好没有重复。

## 常见错误 {#mistakes}

分组查询里最难发现的错误不会报错：分组列多了一个或少了一个，查询照常运行，答的却是另一个问题。研究初学者 SQL 错误的论文发现，这类错误最常见，也最顽固。

**1. 选了组内有多个值的列。** 想看每位顾客最近一次下单的时间和那笔订单的状态：

```sql run error
SELECT customer_id, max(ordered_at) AS last_order, status
FROM orders
GROUP BY customer_id;
```

`max(ordered_at)` 只给出一个时间，不告诉你它来自哪一行，而 `status` 在组内有好几个值。修法取决于你要什么：不需要这一列，就删掉它；需要组内所有的值，就用 `string_agg` 合成一个。

**2. 为了消除报错，把这一列加进 `GROUP BY`。** 报错说 `status` must appear in the GROUP BY clause，照做之后查询就能运行了：

```sql run
SELECT customer_id, max(ordered_at) AS last_order, status
FROM orders
GROUP BY customer_id, status
ORDER BY customer_id;
```

可现在一组是“一位顾客的一种状态”，结果有 23 行，顾客 1 出现了 3 次，`last_order` 也成了“这种状态下最近的一笔”。报错信息只知道怎样让查询合法，不知道你想问什么。回到问题：要“每个什么一行”？不属于这个粒度的列，应该删掉或放进聚合，而不是加进 `GROUP BY`。

**3. 少了分组列。** 问题是“每个月、每种状态各有几笔订单”，却只按月分组：

```sql
SELECT date_trunc('month', ordered_at) AS month, count(*) AS orders
FROM orders
GROUP BY date_trunc('month', ordered_at);
```

查询能运行，可每个月的各种状态被合成了一个数。问题里有两个“每”，`GROUP BY` 里就该有两个分组元素，`SELECT` 里也该把 `status` 列出来。

**4. 选的是表达式，分组的却是原始列。** 想按上架年份统计商品：

```sql run
SELECT extract(year FROM launched_on) AS launch_year, count(*) AS products
FROM products
GROUP BY launched_on
ORDER BY launch_year;
```

不报错，因为 `extract(year FROM launched_on)` 由分组列算出来，组内只有一个值。但组是按完整的日期分的，16 件商品的上架日期各不相同，于是得到 16 行，年份一再重复，每行都是 1。按年份统计，`GROUP BY` 里就要写同一个 `extract` 表达式。

**5. 以为分组之后结果已经排好序。** 分组只决定哪些行合在一起，不决定先后。题目要求顺序时，`ORDER BY` 一个都不能少，排序方向也要和问题一致。

## 小结 {#summary}

- `GROUP BY` 把分组列的值相同的行放进同一组，每组输出一行，聚合函数在组内分别计算。
- 分组之后，`SELECT` 里的每一项在组内都只能有一个值：分组列、聚合函数，或由它们组成的表达式。
- 分组列决定结果的粒度。先回答“每个什么一行”，再写 `GROUP BY`；不要为了消除报错而增加分组列。
- 按表达式分组时，`SELECT` 里写同一个表达式；NULL 自成一组；要顺序就写 `ORDER BY`。

## 参考 {#reference}

### 小计和总计：`ROLLUP`

```sql run
SELECT status, count(*) AS orders
FROM orders
GROUP BY ROLLUP (status)
ORDER BY status;
```

除了每种状态一行，`ROLLUP` 还多出一行总计：`status` 是 NULL，`orders` 是 24。这个 NULL 的意思是“所有状态合计”，不是“状态未知”；如果分组列本身就有 NULL，两种行在结果里分不出来。`ROLLUP (a, b)` 依次按 `(a, b)`、`(a)` 和“不分组”汇总。同类的写法还有 `CUBE`（所有组合）和 `GROUPING SETS`（自己列出要哪几种分组），都是标准 SQL。MySQL 写作 `GROUP BY status WITH ROLLUP`；SQLite 不支持这些写法。

### 别名和位置

PostgreSQL 允许 `GROUP BY` 写输出列的{{term:alias}}（`GROUP BY launch_year`），或者它在 `SELECT` 里的位置（`GROUP BY 1`）。两者都是 PostgreSQL 的扩展：标准 SQL 的 `GROUP BY` 只认表里的列和由它们组成的表达式。别名和表里某一列同名时，`GROUP BY` 按表里的列理解，这和 `ORDER BY` 正好相反。位置写法在增删 `SELECT` 的列之后会悄悄指向另一列，最好不用。

### 其他数据库

`SELECT` 里有组内多个值的列时，PostgreSQL 报错。SQLite 不报错，而是从组里的某一行取值（配合 `max` 或 `min` 时，取的是极值所在的那一行）；MySQL 关闭 `ONLY_FULL_GROUP_BY` 后也会随便取一行。这样的查询能运行，结果却靠不住。另外，标准 SQL 承认的函数依赖不止主键一种，PostgreSQL 目前只认主键。
