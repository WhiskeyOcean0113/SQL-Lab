## 为什么需要它 {#why}

老板每个月看一次销售额，问的总是同样两个问题：这个月比上个月多了还是少了？今年到目前为止一共卖了多少？

按月汇总，第 3 章就会了。难的是“上个月”：结果里的每一行只知道自己这个月的数字。要把上个月的数字放到同一行，以前只能把月度结果和自己连接，条件写成“月份相差一个月”，又绕又容易错。“到目前为止的总和”也一样，每一行都要把它之前的所有行加起来。

## 核心概念 {#core}

### 往前看、往后看：`lag` 和 `lead`

`lag(revenue)` 取的是窗口里**上一行**的 `revenue`，`lead(revenue)` 取的是**下一行**的。“上一行”和“下一行”由 `OVER` 里的 `ORDER BY` 决定：

```sql run
SELECT id, ordered_at,
       lag(id) OVER (ORDER BY ordered_at) AS prev_order,
       lead(id) OVER (ORDER BY ordered_at) AS next_order
FROM orders
ORDER BY ordered_at
LIMIT 4;
```

第一行没有上一行，`lag` 返回 NULL；最后一行没有下一行，`lead` 返回 NULL。

### 加上 `ORDER BY`，聚合变成累计

上一篇的 `avg(price) OVER (PARTITION BY category_id)` 对整个分区算出一个值。只要在 `OVER` 里加上 `ORDER BY`，同样的聚合函数就变成了**累计**：每一行只看从分区开头到自己为止的那些行。

```sql run
SELECT id, ordered_at,
       count(*) OVER (ORDER BY ordered_at) AS orders_so_far
FROM orders
ORDER BY ordered_at
LIMIT 5;
```

### {{Term:window-frame}}

每一行参与计算的那一段行，叫作它的窗口帧。帧随着当前行移动：

- 没有 `ORDER BY` 时，帧是**整个分区**。
- 有 `ORDER BY` 时，默认的帧是**从分区开头到当前行**。所以 `sum` 变成了{{term:running-total}}。
- 也可以自己指定帧，比如“前两行到当前行”，这样算出来的平均值就是{{term:moving-average}}。

`lag` 和 `lead` 不看帧，它们只按位置往前或往后数。

## 语法 {#syntax}

```syntax
lag(expression [, offset [, default ] ]) OVER ( window_definition )
lead(expression [, offset [, default ] ]) OVER ( window_definition )
aggregate_name ( expression ) OVER (
    [ PARTITION BY expression [, …] ]
    ORDER BY expression [ ASC | DESC ] [, …]
    [ { ROWS | RANGE } BETWEEN frame_start AND frame_end ]
)
```

`window_definition` 就是上一篇 `OVER` 括号里的 `PARTITION BY` 和 `ORDER BY`。

| 部分 | 填什么 | 规则 |
|---|---|---|
| `expression` | 要取或要汇总的值 | 任意表达式，如 `revenue`、`ordered_at::date` |
| `offset` | 往前（`lag`）或往后（`lead`）数几行 | 可以省略，默认 1 |
| `default` | 数过了头、没有那一行时返回什么 | 可以省略，默认 NULL；写了 `default` 就必须同时写 `offset` |
| `aggregate_name` | `sum`、`avg`、`count`、`min`、`max` 等聚合函数 | 加上 `ORDER BY` 后按帧计算 |
| `ROWS` / `RANGE` | 帧按行数算，还是按 `ORDER BY` 的值算 | 可以省略；省略时就是 `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` |
| `frame_start`、`frame_end` | 帧的起点和终点 | 见下表 |

帧的起点和终点可以是：

| 写法 | 意思 |
|---|---|
| `UNBOUNDED PRECEDING` | 分区的第一行 |
| `n PRECEDING` | 当前行往前数 n 行 |
| `CURRENT ROW` | 当前行 |
| `n FOLLOWING` | 当前行往后数 n 行 |
| `UNBOUNDED FOLLOWING` | 分区的最后一行 |

对照格式读几条：

- `lag(revenue) OVER (ORDER BY month)`：只有 `expression`，`offset` 默认 1，`default` 默认 NULL，按月份取上一行。
- `lag(id, 1, 0) OVER (ORDER BY ordered_at)`：往前 1 行，没有上一行时返回 0。
- `avg(orders) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)`：帧是当前行和它前面两行，共三行。

## 示例 {#example}

问题：每个月的销售额、上个月的销售额、和上个月相比的变化，以及到这个月为止的累计销售额。取消的订单不算。

1. **先按月汇总。** 把月度销售额放进 CTE `monthly`，每月一行。窗口函数在它的基础上计算。
2. **上个月：`lag(revenue) OVER (ORDER BY month)`。** 按月份排好，取上一行。
3. **变化：本月减上个月。** 1 月没有上个月，`lag` 是 NULL，减出来也是 NULL。
4. **累计：`sum(revenue) OVER (ORDER BY month)`。** 默认的帧从第一个月到当前月。

```sql run
WITH monthly AS (
  SELECT date_trunc('month', o.ordered_at)::date AS month,
         sum(i.quantity * i.unit_price) AS revenue
  FROM orders AS o
  JOIN order_items AS i ON i.order_id = o.id
  WHERE o.status <> 'cancelled'
  GROUP BY 1
)
SELECT month, revenue,
       lag(revenue) OVER (ORDER BY month) AS prev,
       revenue - lag(revenue) OVER (ORDER BY month) AS change,
       sum(revenue) OVER (ORDER BY month) AS running_total
FROM monthly
ORDER BY month;
```

2 月比 1 月少了 137.99，6 月比 5 月多了 340.99，半年累计 2687.95。最后一行的累计值等于所有月份之和，可以用来核对。

## 变体 {#variants}

**每位顾客各自累计：`PARTITION BY`。** 每笔订单的金额，以及这位顾客到这笔为止一共花了多少：

```sql run
SELECT o.customer_id, o.id,
       sum(i.quantity * i.unit_price) AS total,
       sum(sum(i.quantity * i.unit_price))
         OVER (PARTITION BY o.customer_id ORDER BY o.ordered_at) AS running
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
WHERE o.customer_id IN (1, 2)
GROUP BY o.customer_id, o.id, o.ordered_at
ORDER BY o.customer_id, o.ordered_at;
```

`sum(sum(…)) OVER (…)` 看上去奇怪，其实分两层：里面的 `sum` 是 `GROUP BY` 的聚合，算出每笔订单的金额；外面的 `sum … OVER` 是窗口函数，在分组之后把这些金额累加起来。窗口函数在 `GROUP BY` 之后计算，所以可以这样套。

**下一笔订单隔了几天：`lead`。**

```sql run
SELECT customer_id, id, ordered_at::date AS day,
       lead(ordered_at::date) OVER (PARTITION BY customer_id ORDER BY ordered_at)
         - ordered_at::date AS days_until_next
FROM orders
WHERE customer_id IN (1, 2)
ORDER BY customer_id, ordered_at;
```

两个 `date` 相减得到天数。每位顾客的最后一笔订单没有下一笔，结果是 NULL。

**移动平均：自己指定帧。** 每个月和它之前两个月，一共三个月的平均订单数：

```sql run
WITH monthly AS (
  SELECT date_trunc('month', ordered_at)::date AS month, count(*) AS orders
  FROM orders
  GROUP BY 1
)
SELECT month, orders,
       round(avg(orders) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS avg_3m
FROM monthly
ORDER BY month;
```

1 月前面没有月份，帧里只有它自己；2 月的帧有两行。从 3 月开始，帧才是完整的三个月。

**环比百分比。** 变化量除以上个月的值：

```sql run
WITH monthly AS (
  SELECT date_trunc('month', o.ordered_at)::date AS month,
         sum(i.quantity * i.unit_price) AS revenue
  FROM orders AS o
  JOIN order_items AS i ON i.order_id = o.id
  WHERE o.status <> 'cancelled'
  GROUP BY 1
)
SELECT month, revenue,
       round(100.0 * (revenue - lag(revenue) OVER (ORDER BY month))
             / lag(revenue) OVER (ORDER BY month), 1) AS pct_change
FROM monthly
ORDER BY month;
```

**往前数几行，以及缺省值。** `lag(id, 2)` 取往前第二行；`lag(id, 1, 0)` 在没有上一行时返回 0 而不是 NULL：

```sql run
SELECT id, ordered_at,
       lag(id, 2) OVER (ORDER BY ordered_at) AS two_back,
       lag(id, 1, 0) OVER (ORDER BY ordered_at) AS prev_or_zero
FROM orders
ORDER BY ordered_at
LIMIT 4;
```

## 深入 {#deeper}

**`RANGE` 把并列的行当作一组。** 默认的帧是 `RANGE … CURRENT ROW`，它的终点不是“当前这一行”，而是“和当前行 `ORDER BY` 值相同的最后一行”。这些值相同的行叫{{term:peer-row}}。按 `order_id` 累计明细的件数：

```sql run
SELECT order_id, product_id, quantity,
       sum(quantity) OVER (ORDER BY order_id) AS by_order,
       sum(quantity) OVER (ORDER BY order_id, product_id) AS by_item
FROM order_items
WHERE order_id <= 4
ORDER BY order_id, product_id;
```

订单 3 的三行明细 `order_id` 相同，在 `by_order` 里一次全部计入，三行都显示 10。`by_item` 的 `ORDER BY` 能区分每一行，没有同级行，才是一行一行地累加。想要一行一行地累计，让 `ORDER BY` 的值不重复，或者把帧写成 `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`。但在有并列时只写 `ROWS`，并列的行谁先谁后是随意的，结果仍然不确定。

**`first_value` 和 `last_value`。** 它们取帧里的第一行和最后一行。`first_value` 符合直觉；`last_value` 却常常让人意外，因为默认的帧在当前行就结束了，所以“帧里的最后一行”就是当前行自己。见“常见错误”的第 1 条。

**还有 `GROUPS` 和 `EXCLUDE`。** 除了 `ROWS` 和 `RANGE`，帧还可以按“几组同级行”来数（`GROUPS`），也可以用 `EXCLUDE CURRENT ROW` 把当前行排除在外。它们用得不多，知道有就行。

**其他数据库。** `lag`、`lead`、`first_value` 和帧都是标准 SQL，MySQL 8.0、SQLite 3.25 起支持；`GROUPS` 和 `EXCLUDE` 支持的数据库少一些。

## 常见错误 {#mistakes}

**1. 用 `last_value` 取分区的最后一行。** 想在每件电子产品旁边显示最便宜的那件：

```sql run
SELECT name, price,
       last_value(name) OVER (ORDER BY price DESC) AS cheapest_wrong,
       last_value(name) OVER (ORDER BY price DESC
                              ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS cheapest
FROM products
WHERE category_id = 2
ORDER BY price DESC;
```

`cheapest_wrong` 每一行都是自己：默认的帧到当前行为止。把帧扩展到 `UNBOUNDED FOLLOWING`，或者干脆反过来排序，用 `first_value(name) OVER (ORDER BY price)`。

**2. 忘了 `PARTITION BY`，`lag` 跨到了别人那里。** 想看顾客 1 和 2 各自的上一笔订单：

```sql run
SELECT customer_id, id,
       lag(id) OVER (ORDER BY ordered_at) AS prev
FROM orders
WHERE customer_id IN (1, 2)
ORDER BY customer_id, ordered_at;
```

顾客 1 的订单 4 的“上一笔”变成了顾客 2 的订单 2。没有分区，所有订单按时间排成一队，`lag` 只管位置，不管是谁的。加上 `PARTITION BY customer_id`。

**3. 在 `WHERE` 里用 `lag`。**

```sql run error
SELECT id, ordered_at
FROM orders
WHERE lag(ordered_at) OVER (ORDER BY ordered_at) IS NOT NULL;
```

`window functions are not allowed in WHERE`，和上一篇一样：先在 CTE 里算出 `lag`，再在外层筛选。

**4. 累计和在并列的地方一下子跳了好几行。** 原因是“深入”里讲的 `RANGE` 和同级行。累计之前，检查 `ORDER BY` 的列是不是唯一的。

**5. `OVER` 里没有 `ORDER BY`。** `lag(id) OVER ()` 不会报错，但“上一行”是数据库碰巧给出的顺序里的上一行，毫无意义。`sum(x) OVER (PARTITION BY …)` 不写 `ORDER BY`，得到的也不是累计，而是整个分区的总和。

## 小结 {#summary}

- `lag` 取前面的行，`lead` 取后面的行，前后由 `OVER` 里的 `ORDER BY` 决定；没有那一行时返回 NULL 或指定的缺省值。
- 聚合函数加上 `OVER (ORDER BY …)` 就变成累计，因为默认的帧从分区开头到当前行。
- `ROWS BETWEEN n PRECEDING AND CURRENT ROW` 这样的帧可以算移动平均。
- 默认的 `RANGE` 帧把同级行一起计入；要逐行累计，让 `ORDER BY` 唯一。
- `last_value` 要配合延伸到 `UNBOUNDED FOLLOWING` 的帧；按分组计算别忘了 `PARTITION BY`。
