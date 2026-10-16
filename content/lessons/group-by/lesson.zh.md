## 为什么需要它 {#why}

“每种状态的订单各有多少笔？”上一篇的聚合函数只能给出一个总数。要分开数，你只能每种状态写一条查询：

```sql run
SELECT count(*) AS orders
FROM orders
WHERE status = 'delivered';
```

shop 有 5 种状态，就得写 5 条，还得事先知道有哪几种状态。你真正想要的是：**每种状态一行**，每行带着它自己的数量。

## 核心概念 {#core}

`GROUP BY` 先把行按某些列的值分成若干{{term:group|组}}：值相同的行进同一组。然后聚合函数**在每一组里分别计算**，每组输出一行。

```sql run
SELECT status, count(*) AS orders
FROM orders
GROUP BY status;
```

24 行订单被分成 5 组，所以结果是 5 行。`GROUP BY` 后面的列叫{{term:grouping-column}}。

在{{term:logical-order}}里，`GROUP BY` 排在 `WHERE` 之后、`SELECT` 之前：

`FROM` → `WHERE` → **`GROUP BY`** → `SELECT` → `ORDER BY`

由此得出一条硬规则：**分组之后，每组只剩一行，所以 `SELECT` 里的每一列，要么是分组列，要么放在聚合函数里。** 分组列在组内的值都一样，可以直接输出；其他列在组内有很多个值，只能汇总成一个。

## 语法 {#syntax}

`GROUP BY` 写在 `WHERE` 之后、`ORDER BY` 之前：

```syntax
SELECT select_list
FROM table_name
[ WHERE condition ]
[ GROUP BY grouping_element [, …] ]
[ ORDER BY expression [, …] ]
```

| 部分 | 填什么 | 说明 |
|---|---|---|
| `grouping_element` | 一列，或一个表达式，比如 `date_trunc('month', ordered_at)` | 值相同的行进同一组 |
| `[, …]` | 更多分组列 | 按这些列的组合分组 |
| `select_list` | 每一项必须是下面三种之一 | 见下表 |

有了 `GROUP BY` 之后，`select_list` 里的每一项只能是：

| 允许的项 | 例子 | 为什么可以 |
|---|---|---|
| 分组列，或者和分组时一模一样的表达式 | `status` | 组内只有一个值 |
| 聚合函数 | `count(*)`、`min(ordered_at)` | 把组内的很多值汇总成一个 |
| 由上面两种组成的表达式 | `count(*) * 2`、`upper(status)` | 每个部分都只有一个值 |

这三种之外的列，组内有很多个值，数据库不知道该显示哪一个，于是报错。（例外是按主键分组，见“深入”。）

对照格式读几条：

- `GROUP BY status`：一个分组列。
- `GROUP BY country, city`：两个分组列，按组合分组。
- `SELECT date_trunc('month', ordered_at) … GROUP BY date_trunc('month', ordered_at)`：分组元素是一个表达式，`SELECT` 里写的是同一个表达式，所以允许。

把文字连起来的 `string_agg` 也是聚合函数，它的格式是：

```syntax
string_agg(expression, delimiter [ ORDER BY expression [, …] ])
```

括号里的 `ORDER BY` 决定组内各段文字的先后，和查询末尾的 `ORDER BY` 无关。

## 示例 {#example}

问题：每位顾客下过几笔订单，第一笔是什么时候？下单最多的排在前面。

1. **想清楚“每个什么”。** 每位顾客，所以按 `customer_id` 分组。
2. **在每组里要算什么？** 订单数 `count(*)`，最早的下单时间 `min(ordered_at)`。
3. **检查 `SELECT`。** `customer_id` 是分组列，另外两列是聚合，符合规则。
4. **排序。** 按订单数从多到少；数量相同时按顾客编号，让结果稳定。

```sql run
SELECT customer_id, count(*) AS orders, min(ordered_at) AS first_order
FROM orders
GROUP BY customer_id
ORDER BY orders DESC, customer_id;
```

10 行，因为 24 笔订单来自 10 位顾客。顾客 1 下了 4 笔，最多。

## 变体 {#variants}

**按多列分组。** 列出多个分组列时，这几列的**组合**相同的行才进同一组：

```sql run
SELECT country, city, count(*) AS customers
FROM customers
GROUP BY country, city
ORDER BY country, city;
```

9 组，和 `SELECT DISTINCT country, city` 的行数一样。没有聚合函数时，`GROUP BY` 的效果就是去重。

**按表达式分组。** 用第 2 章的 `date_trunc` 把下单时间截到月份，就能按月统计：

```sql run
SELECT date_trunc('month', ordered_at) AS month, count(*) AS orders
FROM orders
GROUP BY date_trunc('month', ordered_at)
ORDER BY month;
```

**按一个条件分组。** 分组元素可以是一个真假值的表达式，结果就分成 true 和 false 两组。高价商品和其他商品各有几件、平均多少钱：

```sql run
SELECT price >= 100 AS premium,
       count(*) AS products,
       round(avg(price), 2) AS avg_price
FROM products
GROUP BY price >= 100;
```

**把一组里的文字连起来：`string_agg`。** 它也是聚合函数，把组内的值用分隔符连成一个字符串：

```sql run
SELECT category_id, string_agg(name, ', ' ORDER BY name) AS products
FROM products
GROUP BY category_id
ORDER BY category_id;
```

## 深入 {#deeper}

**NULL 自成一组。** 上面最后一个例子里，没有分类的 Gift Card 单独成了一组，分组列显示为 NULL。和 `DISTINCT` 一样，分组时所有 NULL 被看作同一个值。

**`GROUP BY` 不保证顺序。** 分组的结果是按什么顺序出来的，取决于数据库内部怎么执行：

```sql run
SELECT country, count(*) AS customers
FROM customers
GROUP BY country;
```

需要顺序就写 `ORDER BY`。旧版的 MySQL 曾经会顺便排序，很多人因此养成了依赖它的习惯。

**按主键分组时，可以选同一张表的其他列。** 主键唯一确定一行，所以按 `id` 分组时，每组只有一行，`name` 也只有一个值。PostgreSQL 能识别这种{{term:functional-dependency}}：

```sql run
SELECT id, name, country
FROM customers
GROUP BY id
ORDER BY id;
```

这在第 4 章把顾客和订单连起来统计时很有用。但它只认主键：按 `name` 分组再选 `country`，仍然会报错。

**小计和总计：`ROLLUP`。** `GROUP BY ROLLUP (country)` 除了每个国家一行，还会多出一行总计，分组列显示为 NULL：

```sql run
SELECT country, count(*) AS customers
FROM customers
GROUP BY ROLLUP (country)
ORDER BY country;
```

最后一行的 NULL 不代表“国家未知”，而是“所有国家合计”，12 位顾客。`ROLLUP`、`CUBE`、`GROUPING SETS` 是标准 SQL 的高级分组写法；MySQL 写作 `GROUP BY country WITH ROLLUP`，SQLite 不支持。

**PostgreSQL 的简写。** `GROUP BY` 可以写输出列的别名（`GROUP BY month`），也可以写列的位置（`GROUP BY 1`）。两者都不是标准 SQL；位置写法在增删列之后容易悄悄出错，最好不用。

## 常见错误 {#mistakes}

这些都是研究中最常见、也最难自己发现的分组错误。

**1. `SELECT` 里有一列既不是分组列，也没有聚合。**

```sql run error
SELECT customer_id, status, count(*) AS orders
FROM orders
GROUP BY customer_id;
```

顾客 1 有 4 笔订单，状态各不相同，这一组的 `status` 该显示哪个？数据库无法决定。

**2. 为了消除报错，把多余的列加进 `GROUP BY`。** 照着报错提示把 `status` 加进去，查询能跑了，意思却变了：

```sql run
SELECT customer_id, status, count(*) AS orders
FROM orders
GROUP BY customer_id, status
ORDER BY customer_id;
```

现在每组是“一位顾客的一种状态”，23 行，不再是每位顾客一行。正确的修法通常是把多余的列从 `SELECT` 里删掉，而不是加进 `GROUP BY`。分组列多一个或少一个，结果的“粒度”就不对了。

**3. 以为分组后的结果是排好序的。** 见“深入”：要顺序，就写 `ORDER BY`。

**4. 想数不同的东西，却用了 `count(*)`。** “每种状态涉及几位顾客”要用 `count(DISTINCT customer_id)`；`count(*)` 数的是订单行。delivered 有 11 笔订单，却只来自 10 位顾客。

**5. 子句顺序写错。** `GROUP BY` 必须写在 `WHERE` 后面：

```sql run error
SELECT status, count(*)
FROM orders
GROUP BY status
WHERE status <> 'cancelled';
```

报 `syntax error at or near "WHERE"`。书写顺序是 `WHERE` → `GROUP BY` → `ORDER BY`，正好也是逻辑顺序：先筛行，再分组。

**6. `SELECT` 和 `GROUP BY` 里的表达式不一致。** `SELECT date_trunc('month', ordered_at) … GROUP BY date_trunc('day', ordered_at)` 会报 `must appear in the GROUP BY clause`：按天分组，每组里只有一个日期，但按月截断的值数据库并不认为是“同一个表达式”。两处要写得一模一样。

## 小结 {#summary}

- `GROUP BY` 把分组列的值相同的行分到一组，聚合函数在每组里分别计算，每组输出一行。
- 分组之后，`SELECT` 里的每一列要么是分组列，要么在聚合函数里。
- 多个分组列按组合分组；也可以按表达式分组。
- NULL 自成一组；分组不保证顺序，要排序就写 `ORDER BY`。
- 遇到分组报错，先想清楚“每个什么一行”，别为了消除报错而增加分组列。
