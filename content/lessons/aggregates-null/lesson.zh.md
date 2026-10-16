## 为什么需要它 {#why}

“shop 有多少位顾客？”和“有多少位顾客留了邮箱？”听起来是两个问题，写出来只差一个括号里的内容：

```sql run
SELECT count(*) AS customers, count(email) AS with_email
FROM customers;
```

12 和 10。两位顾客的 `email` 是 NULL，`count(email)` 没有把这两位算进去。这一篇讲聚合函数遇到 NULL 时的规则：它们大多数时候正是你想要的，但不了解规则时，结果会悄悄出错，而且不会报错。

## 核心概念 {#core}

**除了 `count(*)`，所有聚合函数都忽略 NULL。** 它们只看非 NULL 的值：

| 写法 | 数的是什么 |
|---|---|
| `count(*)` | 行数，不管内容是什么 |
| `count(x)` | `x` 不是 NULL 的行数 |
| `count(DISTINCT x)` | 不同的非 NULL 值有几个 |
| `sum(x)`、`avg(x)`、`min(x)`、`max(x)` | 只用非 NULL 的值计算 |

`avg(x)` 是“非 NULL 值的和”除以“非 NULL 值的个数”，NULL 既不算进分子，也不算进分母。

这和讲 NULL 的那一篇是一致的：NULL 表示“未知”，聚合函数不会拿一个未知的值去求和、比较大小。

## 语法 {#syntax}

聚合函数的完整格式，比这一章第一课多了一个可选的 `FILTER`：

```syntax
count(*) [ FILTER ( WHERE condition ) ]
aggregate_name ( [ DISTINCT ] expression ) [ FILTER ( WHERE condition ) ]
```

| 部分 | 填什么 | 能省略吗 |
|---|---|---|
| `aggregate_name` | `count`、`sum`、`avg`、`min`、`max`、`string_agg` 等 | 不能 |
| `expression` | 要汇总的值；为 NULL 的行会被跳过 | 不能 |
| `FILTER ( WHERE condition )` | 只让满足条件的行参加这一个函数的汇总 | 可以 |

`FILTER` 里的 `condition` 和 `WHERE` 子句里的一样，看一行就能判断。注意括号和 `WHERE` 都不能少。

遇到 NULL 和空集时，各个函数的结果：

| 函数 | 有些值是 NULL | 全部是 NULL | 一行都没有 |
|---|---|---|---|
| `count(*)` | 照常数行 | 照常数行 | 0 |
| `count(expression)` | 只数非 NULL | 0 | 0 |
| `sum`、`avg`、`min`、`max` | 只用非 NULL 计算 | NULL | NULL |

对照格式读几个表达式：

- `count(email)`：`expression` 是一列，`email` 为 NULL 的行不数。
- `count(*) FILTER (WHERE status = 'cancelled')`：数行，但只数取消的订单。
- `COALESCE(sum(quantity), 0)`：聚合结果本身是一个表达式，可以交给 `COALESCE`，NULL 时换成 0。

## 示例 {#example}

问题：顾客分布在多少个城市？

1. **先数行。** 一共 12 位顾客：`count(*)`。
2. **再数有城市的。** `count(city)` 跳过两位城市为 NULL 的顾客。
3. **最后数不同的城市。** `count(DISTINCT city)`：Shanghai、Toronto、Osaka 都有两位顾客，去重之后剩下几个？

```sql run
SELECT count(*) AS customers,
       count(city) AS known_city,
       count(DISTINCT city) AS cities
FROM customers;
```

12、10、7。对比讲 DISTINCT 的那一篇：`SELECT DISTINCT city` 返回 8 行，因为 NULL 自成一行；`count(DISTINCT city)` 却是 7，因为 `count` 不数 NULL。同一份数据，两种写法相差一。

## 变体 {#variants}

**忽略 NULL 正是你要的。** 已发货的订单平均多久发出？未发货的订单 `shipped_at` 是 NULL，相减也是 NULL，`avg` 自动跳过它们：

```sql run
SELECT avg(shipped_at - ordered_at) AS avg_shipping,
       count(shipped_at) AS shipped,
       count(*) AS orders
FROM orders;
```

平均值只来自 14 笔已发货的订单，正是问题要的。

**按条件计数：`FILTER`。** 在聚合函数后面加 `FILTER (WHERE 条件)`，这个函数就只汇总满足条件的行：

```sql run
SELECT count(*) AS all_orders,
       count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
       count(*) FILTER (WHERE shipped_at IS NOT NULL) AS shipped
FROM orders;
```

一条查询里同时得到总数和各种部分数量。`FILTER` 是标准 SQL，PostgreSQL 支持；在不支持它的数据库里，用第 2 章的 `CASE` 写出同样的效果：

```sql run
SELECT count(*) AS all_orders,
       sum(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
FROM orders;
```

**`FILTER` 和 `GROUP BY` 一起用。** 每位顾客一行，并排显示总订单数、已送达数和已取消数：

```sql run
SELECT customer_id,
       count(*) AS orders,
       count(*) FILTER (WHERE status = 'delivered') AS delivered,
       count(*) FILTER (WHERE status = 'cancelled') AS cancelled
FROM orders
GROUP BY customer_id
ORDER BY customer_id;
```

这种把一列的不同取值展开成几列的写法，叫{{term:pivot}}，在报表里很常见。

**把“没有”显示成 0：`COALESCE`。** Folding Chair（商品 16）从没卖出过：

```sql run
SELECT sum(quantity) AS units,
       COALESCE(sum(quantity), 0) AS units_or_zero
FROM order_items
WHERE product_id = 16;
```

`sum` 没有值可加，返回 NULL；`COALESCE` 把它换成 0。

## 深入 {#deeper}

**没有行可以汇总时。** `count` 返回 0，其他聚合函数返回 NULL：

```sql run
SELECT count(*) AS products, sum(stock) AS stock,
       avg(price) AS avg_price, max(price) AS max_price
FROM products
WHERE price > 1000;
```

“什么都没有”的和是 NULL 而不是 0，这是标准 SQL 的规定：没有值，就没有和。需要 0 时自己写 `COALESCE(sum(x), 0)`。

**加上 `GROUP BY` 后，没有行就没有组。** 同样筛掉所有行，分组的查询返回 0 行，而不是一行 0：

```sql run
SELECT category_id, count(*) AS products
FROM products
WHERE price > 1000
GROUP BY category_id;
```

没有组，就没有输出。只有不分组的聚合才保证一行。

**忽略 NULL 和把 NULL 当 0 不一样。** 如果 NULL 其实表示 0（比如“没填就是没买”），`avg(x)` 会偏高，因为它只除以非 NULL 的个数；这时要写 `avg(COALESCE(x, 0))`，先把 NULL 换成 0 再平均。NULL 表示“未知”还是“零”，取决于数据的含义，查询本身判断不了。

**`FILTER` 和 `WHERE` 的区别。** `WHERE` 筛掉的行，查询里所有的聚合函数都看不到；`FILTER` 只影响它所在的那一个函数，其他函数照样看到全部的行。所以上面的例子能在同一行里既显示总数、又显示部分数量。`FILTER` 是 SQL 标准，PostgreSQL 和 SQLite 支持，MySQL 不支持，在那里要用 `sum(CASE …)`。

**NULL 在 `GROUP BY` 里和在 `count` 里不一样。** `GROUP BY` 和 `DISTINCT` 把所有 NULL 当作一组，`count(x)` 和 `count(DISTINCT x)` 却跳过 NULL。

## 常见错误 {#mistakes}

**1. 想数行，却写了 `count(列)`。** 下面这条查询想数每个国家有多少位顾客：

```sql run
SELECT country, count(city) AS customers
FROM customers
GROUP BY country
ORDER BY country;
```

Brazil 和 Ireland 都显示 0，可它们各有一位顾客，只是城市为 NULL。数行就用 `count(*)`；只有当你确实要“有值的行”时，才用 `count(列)`。

**2. 以为没有行时 `sum` 是 0。** 它是 NULL，再拿去做加减比较，结果也全是 NULL。需要 0 就用 `COALESCE`。

**3. 用 `count` 加条件来按条件计数。** `count(status = 'cancelled')` 看起来像“数取消的订单”，其实返回 24：比较的结果是 true 或 false，都不是 NULL，所以每一行都被数了。按条件计数用 `FILTER`，或者 `sum(CASE … THEN 1 ELSE 0 END)`。

**4. `FILTER` 少写了 `WHERE`。**

```sql run error
SELECT count(*) FILTER (status = 'cancelled')
FROM orders;
```

报 `syntax error at or near "status"`。按格式，括号里必须以 `WHERE` 开头：`FILTER (WHERE status = 'cancelled')`。

**5. 拿 `count(DISTINCT x)` 和 `SELECT DISTINCT x` 的行数对比，以为数错了。** 前者不数 NULL，后者把 NULL 当作一行。

## 小结 {#summary}

- 除了 `count(*)`，聚合函数都忽略 NULL；`count(x)` 只数非 NULL 的值。
- `avg` 只除以非 NULL 值的个数；NULL 若表示 0，要先用 `COALESCE` 换掉。
- 没有行时：不分组的 `count` 返回 0，其他函数返回 NULL；分组的查询返回 0 行。
- `FILTER (WHERE …)` 让聚合函数只汇总满足条件的行。
- 数行用 `count(*)`；`count(条件)` 不会按条件计数。
