## 为什么需要它 {#why}

采购想看每个分类里最贵的两件商品，名字和价格都要。

第 3 章的 `GROUP BY category_id` 能算出每个分类的最高价，但分组之后每个分类只剩一行，商品名没法再显示，第二贵的那件更是无从谈起。我们需要的是：**每一行都保留**，同时知道它在自己的分类里排第几。

## 核心概念 {#core}

### 计算，但不合并行

{{Term:window-function}}对一组和当前行相关的行做计算，再把结果写回当前行。和聚合不同，行不会被合并：16 件商品进去，16 行出来。

```sql run
SELECT name, category_id, price,
       avg(price) OVER (PARTITION BY category_id) AS category_avg
FROM products
ORDER BY category_id, price DESC;
```

`avg(price)` 后面跟着 `OVER (…)`，它就不再是聚合函数，而是窗口函数：每一行都保留，并在旁边写上自己分类的平均价。

### OVER 括号里的两样东西

- **`PARTITION BY`** 把行分成几个{{term:partition}}，函数在每个分区里各算各的。它像 `GROUP BY`，只是不合并行。不写就是整张表一个分区。
- **`ORDER BY`** 规定分区里的行按什么顺序排。排名需要它：先排好队，才知道谁是第一。

### 三个{{term:ranking-function}}

在每个分区里按顺序给行编号，有三种方式，区别只在遇到并列时：

| 函数 | 并列时 | 4、3、3、2 排名的结果 |
|---|---|---|
| `row_number()` | 照样一个接一个编号，并列的谁先谁后由数据库随意决定 | 1、2、3、4 |
| `rank()` | 并列的同名次，后面跳过被占掉的名次 | 1、2、2、4 |
| `dense_rank()` | 并列的同名次，后面不跳 | 1、2、2、3 |

### 在逻辑执行顺序里的位置

窗口函数在 `SELECT` 这一步计算，也就是在 `WHERE`、`GROUP BY`、`HAVING` 之后，在 `DISTINCT`、`ORDER BY`、`LIMIT` 之前。这带来两个后果：

- 它看到的是已经筛选、分组之后的行，所以能给分组的结果排名。
- **它不能写在 `WHERE` 里**，因为 `WHERE` 执行的时候它还没算出来。想按排名筛选，要先把排名算好，放进 CTE 或派生表，再在外层筛选。

## 语法 {#syntax}

```syntax
function_name ( [ expression [, …] ] ) OVER (
    [ PARTITION BY expression [, …] ]
    [ ORDER BY expression [ ASC | DESC ] [, …] ]
)
```

| 部分 | 填什么 | 规则 |
|---|---|---|
| `function_name` | 排名函数 `row_number`、`rank`、`dense_rank`、`ntile`，或者任何聚合函数，如 `sum`、`avg`、`count` | 排名函数的括号通常是空的；`ntile` 要一个整数参数 |
| `OVER ( … )` | 窗口的定义 | 必须有；写了它才是窗口函数，括号可以是空的 |
| `PARTITION BY expression` | 按什么分区 | 可以省略；省略时整个结果是一个分区 |
| `ORDER BY expression` | 分区里的顺序 | 排名函数需要它；可以省略，但那样编号的顺序没有意义 |

整个窗口函数是一个 `expression`，写在选择列表里，也可以写在 `ORDER BY` 里，但不能写在 `WHERE`、`GROUP BY`、`HAVING` 里。

对照格式读几条：

- `avg(price) OVER (PARTITION BY category_id)`：`function_name` 是聚合函数 `avg`，按分类分区，没有 `ORDER BY`，所以每个分区算出一个平均值。
- `row_number() OVER (PARTITION BY category_id ORDER BY price DESC)`：每个分类里按价格从高到低编号，从 1 开始。
- `count(*) OVER ()`：`OVER` 的括号是空的，整个结果是一个分区，每一行都得到总行数。

## 示例 {#example}

问题：每个分类里最贵的两件商品。

1. **给每件商品在分类内排号。** `PARTITION BY category_id` 让每个分类各排各的，`ORDER BY price DESC` 让最贵的排第 1。
2. **把排名放进 CTE。** 排名不能在同一层的 `WHERE` 里用，所以先在 CTE 里算好，起名 `rn`。
3. **在外层筛选 `rn <= 2`。** 这时 `rn` 已经是 CTE 的一列，可以像普通的列一样筛选。
4. **排序。**

```sql run
WITH ranked AS (
  SELECT name, category_id, price,
         row_number() OVER (PARTITION BY category_id ORDER BY price DESC) AS rn
  FROM products
)
SELECT category_id, name, price
FROM ranked
WHERE rn <= 2
ORDER BY category_id, price DESC;
```

11 行：5 个分类各 2 件，再加上 Gift Card。它的 `category_id` 是 NULL，所有 NULL 被分进同一个分区，它是那个分区里唯一的一件，排第 1。这类“每组前 N 名”的问题，都可以照这个模板来写：分区、排序、编号、外层筛选。

## 变体 {#variants}

**三种排名的区别。** 按下单次数给顾客排名。顾客 2 和 3 都下过 3 单，并列：

```sql run
SELECT customer_id, count(*) AS orders,
       row_number() OVER (ORDER BY count(*) DESC) AS row_number,
       rank()       OVER (ORDER BY count(*) DESC) AS rank,
       dense_rank() OVER (ORDER BY count(*) DESC) AS dense_rank
FROM orders
GROUP BY customer_id
ORDER BY orders DESC, customer_id;
```

`rank` 在并列的 2 之后直接跳到 4，`dense_rank` 接着是 3，`row_number` 给并列的两位分了 2 和 3，谁拿 2 是随意的。这条查询还说明了一点：窗口函数在 `GROUP BY` 之后计算，所以 `ORDER BY count(*)` 可以写在 `OVER` 里，给分组的结果排名。

**每位顾客最近的一笔订单。** 按顾客分区、按时间倒序编号，留下编号 1：

```sql run
WITH ranked AS (
  SELECT customer_id, id, ordered_at,
         row_number() OVER (PARTITION BY customer_id ORDER BY ordered_at DESC) AS rn
  FROM orders
)
SELECT customer_id, id AS order_id, ordered_at
FROM ranked
WHERE rn = 1
ORDER BY customer_id;
```

第 5 章用{{term:correlated-subquery}}回答过同一个问题。窗口函数的写法只扫一遍表，通常更快，也更容易改成“最近的两笔”。

**分成几档：`ntile`。** `ntile(4)` 按顺序把行尽量平均地分成 4 档。16 件商品按价格分成 4 档，每档 4 件：

```sql run
SELECT name, price, ntile(4) OVER (ORDER BY price DESC) AS quartile
FROM products
ORDER BY price DESC;
```

**整张表一个窗口。** `OVER ()` 的括号是空的，所有行在同一个分区。用它算每件商品的价格占所有价格之和的百分比：

```sql run
SELECT name, price,
       round(100.0 * price / sum(price) OVER (), 1) AS pct
FROM products
ORDER BY price DESC
LIMIT 5;
```

没有窗口函数时，这个分母要写成标量子查询 `(SELECT sum(price) FROM products)`。

**给窗口起名字。** 同一个窗口用好几次时，可以在 `ORDER BY` 之前写一个 `WINDOW` 子句，给它起名，`OVER` 后面直接写名字：

```sql run
SELECT name, price,
       rank()       OVER w AS rank,
       dense_rank() OVER w AS dense_rank
FROM products
WINDOW w AS (ORDER BY price DESC)
ORDER BY price DESC
LIMIT 4;
```

## 深入 {#deeper}

**`row_number` 遇到并列时不确定。** 上面顾客 2 和 3 谁排第 2，这一次是 3，换一份数据或换一个执行计划可能就变了。需要确定的编号时，在 `ORDER BY` 里加一列能区分它们的列，比如 `ORDER BY count(*) DESC, customer_id`。

**降序时 NULL 排在最前面。** 窗口里的 `ORDER BY` 和普通的 `ORDER BY` 规则一样：升序时 NULL 在最后，降序时 NULL 在最前。按发货时间倒序给订单排名，还没发货的订单（`shipped_at` 是 NULL）会并列第 1：

```sql run
SELECT id, shipped_at,
       rank() OVER (ORDER BY shipped_at DESC) AS r
FROM orders
WHERE customer_id IN (1, 2)
ORDER BY r;
```

想让它们排在最后，写 `ORDER BY shipped_at DESC NULLS LAST`。

**NULL 自成一个分区。** `PARTITION BY` 和 `GROUP BY` 一样，把所有 NULL 当作同一个值。示例里的 Gift Card 就是独自在 NULL 分区里排了第 1。

**还有两个分布函数。** `percent_rank()` 和 `cume_dist()` 给出每一行在分区里的相对位置，是 0 到 1 之间的小数，适合回答“这件商品比百分之多少的商品贵”。

**其他数据库。** 窗口函数是标准 SQL，MySQL 8.0 和 SQLite 3.25 起支持。Snowflake、BigQuery、DuckDB 有一个 `QUALIFY` 子句，可以直接按窗口函数筛选，省掉外层查询；PostgreSQL 没有它，还是要用 CTE 或子查询。

## 常见错误 {#mistakes}

**1. 在 `WHERE` 里用窗口函数。**

```sql run error
SELECT name, price
FROM products
WHERE row_number() OVER (ORDER BY price DESC) <= 3;
```

`window functions are not allowed in WHERE`。`WHERE` 先执行，那时还没有排名。把排名放进 CTE，在外层筛选。

**2. 在 `WHERE` 里用排名的别名。** 换成别名也不行：

```sql run error
SELECT name, price,
       row_number() OVER (ORDER BY price DESC) AS rn
FROM products
WHERE rn <= 3;
```

`column "rn" does not exist`，和第 0 章讲逻辑执行顺序时遇到的错误一样：`SELECT` 起的名字，`WHERE` 看不到。

**3. 忘了 `PARTITION BY`。** 想要“每个分类的前两名”，却只写了 `OVER (ORDER BY price DESC)`，得到的是全店最贵的两件。读一遍题目：“每个……”就是分区的信号。

**4. 该用 `rank` 时用了 `row_number`。** “价格前三的商品”如果有两件同价并列第三，`row_number() <= 3` 只会留下其中一件，另一件被随意丢掉。题目说并列的都要，用 `rank()` 或 `dense_rank()`。

**5. 想用 `GROUP BY` 取出每组最大值所在的那一行。**

```sql run error
SELECT category_id, name, price
FROM products
GROUP BY category_id
HAVING price = max(price);
```

`column "products.name" must appear in the GROUP BY clause`。分组之后每组只剩一行，`name` 不知道该取哪一个。这正是窗口函数要解决的问题：先排名，再筛选。

## 小结 {#summary}

- 窗口函数写成 `函数(…) OVER (…)`，在不合并行的情况下，对每一行算出一个值。
- `PARTITION BY` 分组但不合并，`ORDER BY` 决定分区里的顺序。
- `row_number` 并列时随意编号，`rank` 并列后跳号，`dense_rank` 并列后不跳号。
- 窗口函数在 `SELECT` 这一步计算，不能写在 `WHERE` 里；按排名筛选要先放进 CTE。
- “每组前 N 名”的模板：分区、排序、编号，再在外层筛选。
