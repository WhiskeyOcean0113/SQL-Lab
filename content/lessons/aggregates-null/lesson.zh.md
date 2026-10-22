## 为什么需要它 {#why}

shop 发一笔订单，平均要几天？每笔订单的发货天数，就是发货日期减去下单日期：

```sql run
SELECT id, status, shipped_at::date - ordered_at::date AS days
FROM orders
ORDER BY id;
```

24 笔订单里，14 笔有天数。另外 10 笔还没发货，`shipped_at` 是 NULL，`days` 也跟着是 NULL。现在对这一列求平均：这 10 笔该算作 0 天，还是干脆不算？又或者像 `1 + NULL` 那样，一个未知值就让整个结果变成未知？三种做法各有道理，算出来的答案各不相同，而查询本身看不出数据库会选哪一种。不弄清这条规则，任何有空缺的列上算出的汇总都不能放心使用。

## 核心概念 {#core}

{{Term:aggregate-function}}看的不是行，而是参数在每一行上的值。开始计算之前，它先把这些值里的 NULL 全部扔掉。`sum`、`avg`、`min`、`max` 和 `count(x)` 处理的都是剩下的值。

原因在于 NULL 的含义。NULL 是一个没人知道的值，和未知的值做运算，结果还是未知：`1 + NULL` 就是 NULL。如果 `sum` 把 NULL 也算进去，只要有一笔订单没有发货时间，整张表的总和就成了未知；而现实里的列几乎总有空缺。所以 SQL 只汇总已知的值，对未知的值不下结论。

跟着发货天数走一遍：

```steps
- sql: |
    SELECT id, shipped_at::date - ordered_at::date AS days,
           shipped_at IS NOT NULL AS has_days
    FROM orders
    ORDER BY id;
  say: >-
    聚合函数拿到的是这 24 个 `days` 值。`has_days` 为 false 的 10 行，值是 NULL，
    聚合函数在动手之前就把它们扔掉了。
  group: has_days
- sql: |
    SELECT count(*) AS orders,
           count(shipped_at::date - ordered_at::date) AS with_days
    FROM orders;
  say: >-
    `count(*)` 没有参数，也就没有值可扔，24 行全数进去。对天数做 `count`，
    数的是扔掉 NULL 之后剩下的值：14 个。
- sql: |
    SELECT sum(shipped_at::date - ordered_at::date) AS total_days,
           round(avg(shipped_at::date - ordered_at::date), 2) AS avg_days
    FROM orders;
  say: >-
    `sum` 把 14 个值加起来，得 24。`avg` 除以的是它加了几个值，而不是有几行：
    24 / 14 = 1.71。NULL 既不进分子，也不进分母。
- sql: |
    SELECT count(*) AS lines, count(quantity) AS with_quantity,
           sum(quantity) AS units, max(quantity) AS largest
    FROM order_items
    WHERE order_id = 24;
  say: >-
    订单 24 一条明细也没有，所以没有任何值送到聚合函数手里。两个 `count` 都是 0；
    `sum` 和 `max` 无从算起，结果是 NULL。
```

`count(*)` 和 `count(x)` 的区别全在这里。`count(*)` 问的是“有几行”，`count(x)` 问的是“有几行的 `x` 是已知的”。两者没有谁更正确，它们回答的是不同的问题，该写哪个由问题决定。

最后一步引出第二条规则。没有值可以汇总时，不管是 `WHERE` 一行都没留下，还是留下的值全是 NULL，`count` 都返回 0，其他聚合函数都返回 NULL。“有几个”即使面对空无一物也有答案：零个；“最大的是哪个”就根本没有答案。SQL 对总和也是同样处理：没有值，就没有和。PostgreSQL 手册专门点出了这种情况：没有行时 `sum` 返回 NULL，而不是很多人以为的 0。

| 聚合函数拿到的输入 | `count(*)` | `count(x)` | `sum(x)`、`avg(x)`、`min(x)`、`max(x)` |
|---|---|---|---|
| 有行，部分 `x` 是 NULL | 所有行 | 非 NULL 的 `x` 的个数 | 只用非 NULL 的 `x` 计算 |
| 有行，`x` 全是 NULL | 所有行 | 0 | NULL |
| 一行都没有 | 0 | 0 | NULL |

```check
query: |
  SELECT count(*) AS lines, sum(quantity) AS units
  FROM order_items
  WHERE product_id = 16;
question: Folding Chair（商品 16）从来没有人买过。这条查询返回什么？
choices:
  - "一行：`lines` 是 0，`units` 是 0"
  - "一行：`lines` 是 0，`units` 是 NULL"
  - "一行：两列都是 NULL"
  - "一行都没有"
answer: 1
explain: >-
  不带 `GROUP BY` 的聚合查询总是返回一行。没有一条明细符合条件，
  `count(*)` 的答案是 0；`sum` 没有值可加，答案是 NULL。
verify: { rows: 1 }
```

## 语法 {#syntax}

前面的规则决定聚合函数看到哪些“值”。很多时候，你还想决定它看到哪些“行”：比如在同一行结果里，并排给出全部订单数和取消的订单数。`WHERE` 做不到，因为它筛掉的行，查询里所有的聚合函数都看不到了。`FILTER` 把条件只挂在一个聚合函数上：

```syntax
count(*) [ FILTER ( WHERE condition ) ]
aggregate_name ( [ DISTINCT ] expression ) [ FILTER ( WHERE condition ) ]
```

| 部分 | 填什么 | 能省略吗 |
|---|---|---|
| `aggregate_name` | `count`、`sum`、`avg`、`min`、`max` 或其他聚合函数 | 不能 |
| `DISTINCT` | 汇总之前先去掉重复的值 | 可以 |
| `expression` | 要汇总的值；它为 NULL 的行会被扔掉 | 不能 |
| `FILTER ( WHERE condition )` | 只有 `condition` 为 true 的行，才会送进这一个聚合函数 | 可以 |

`condition` 就是普通的行条件，和 `WHERE` 子句里的一样，也遵守同样的{{term:three-valued-logic}}：只有条件为 true 的行才能进去，false 和 unknown 都被挡在外面。`FILTER` 写在聚合函数的右括号之后、`AS` 之前；括号和 `WHERE` 这个词都是它的一部分，不能省。

对照格式读几个表达式：

- `count(*) FILTER (WHERE status = 'cancelled')`：第一行的形式，只数已取消的订单。
- `sum(quantity) FILTER (WHERE unit_price >= 100)`：第二行的形式，没有 `DISTINCT`，只把单价不低于 100 美元的明细的数量加起来。
- `count(DISTINCT customer_id) FILTER (WHERE status = 'paid')`：两个可选部分都用上了，数的是有多少位不同的顾客有已付款的订单。

## 示例 {#example}

任务：做一份按月的发货报表。每个月一行：下了多少单、发出了多少单、取消了多少单，以及平均几天发货。

1. **每月一行。** 按 `date_trunc('month', ordered_at)` 分组。
2. **数行，还是数值？** “下了多少单”数的是行，用 `count(*)`；“发出了多少单”数的是有发货时间的订单，用 `count(shipped_at)`，NULL 会自己掉出去。
3. **只数其中一部分行。** “取消了多少单”写成 `count(*) FILTER (WHERE status = 'cancelled')`。要是用 `WHERE`，其他订单就从每一列里都消失了。
4. **只对已知的值求平均。** 对发货天数求 `avg`，会跳过还没发货的订单，这正是“发货花了多久”的意思。`round` 保留一位小数。

```sql run
SELECT date_trunc('month', ordered_at) AS month,
       count(*) AS orders,
       count(shipped_at) AS shipped,
       count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
       round(avg(shipped_at::date - ordered_at::date), 1) AS avg_days
FROM orders
GROUP BY date_trunc('month', ordered_at)
ORDER BY month;
```

5. **读懂这个 NULL。** 6 月的 7 笔订单一笔都还没发货。在这一组里，`count(shipped_at)` 遇到的全是 NULL，答案是 0；`avg` 遇到的也全是 NULL，答案是 NULL。这个 NULL 是如实的回答：6 月还没有任何发货时间。把它换成 0，就等于声称 6 月的订单都是当天发出的。

```check
query: |
  SELECT count(*) AS orders,
         count(*) FILTER (WHERE status = 'delivered') AS delivered
  FROM orders
  WHERE shipped_at IS NOT NULL;
question: 24 笔订单中有 14 笔有发货时间，其中 11 笔已送达。`orders` 和 `delivered` 分别是多少？
choices:
  - "`orders` 是 24，`delivered` 是 11"
  - "`orders` 是 14，`delivered` 是 11"
  - "`orders` 是 11，`delivered` 是 11"
  - "`orders` 是 14，`delivered` 是 14"
answer: 1
explain: >-
  `WHERE` 先执行，留下 14 笔已发货的订单，所有聚合函数看到的都是这 14 行，
  所以 `orders` 是 14。`FILTER` 再只替 `delivered` 一个函数挑出其中 11 笔已送达的，
  `orders` 不受影响。
```

## 变体 {#variants}

**“没有”就是 0 的时候：`COALESCE`。** 第一个检查点里，Folding Chair 的 `units` 是 NULL。对“卖出了多少件”来说，没卖出就是 0 件，可以用第 2 章的 `COALESCE` 把 NULL 换掉：

```sql run
SELECT COALESCE(sum(quantity), 0) AS units
FROM order_items
WHERE product_id = 16;
```

换不换，看含义，不看习惯。件数里什么都没有，就是 0 件；上面 6 月的平均发货天数却不是 0 天，而是还不知道。

**`count` 配 `CASE`：让 NULL 规则替你筛选。** 没有 `ELSE` 的 `CASE`，在没有分支匹配的行上给出 NULL，而 `count` 会扔掉 NULL。两者合起来，正好数出匹配的行：

```sql run
SELECT count(*) AS all_orders,
       count(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled,
       count(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS not_what_you_want
FROM orders;
```

结果是 2 和 24。加上 `ELSE 0` 之后，每一行都有值，而 `count` 数的是值的个数，不是 1 的个数。第一种写法和 `FILTER` 的效果相同，在不支持 `FILTER` 的数据库里也能用。

**几个 `FILTER` 并排：{{term:pivot}}。** 每种状态一行，每两个月的订单数各占一列：

```sql run
SELECT status,
       count(*) FILTER (WHERE ordered_at < '2024-03-01') AS jan_feb,
       count(*) FILTER (WHERE ordered_at >= '2024-03-01' AND ordered_at < '2024-05-01') AS mar_apr,
       count(*) FILTER (WHERE ordered_at >= '2024-05-01') AS may_jun
FROM orders
GROUP BY status
ORDER BY status;
```

即使某个时段一笔订单都没有，每种状态也都保留着自己的那一行：`FILTER` 可以让一个计数落空，但从不删掉一个组。原本是一列里的不同取值（时段），现在变成了几个列名。

**`count(DISTINCT x)` 同样扔掉 NULL。** 顾客分布在几个城市？

```sql run
SELECT count(DISTINCT city) AS cities
FROM customers;
```

答案是 7。可是 `GROUP BY city` 会分出 8 组，`SELECT DISTINCT city` 也返回 8 行。分组和 `DISTINCT` 会让所有 NULL 单独成为一组；`count(DISTINCT city)` 数的是值，而 NULL 不算一个值。

## 深入 {#deeper}

**有意把 NULL 当作 0。** `avg(COALESCE(x, 0))` 在求平均之前先把 NULL 换成 0，于是每一行都进了分母。用在发货天数上，结果正好是 1，仿佛每笔没发货的订单都在当天发了出去：

```sql run
SELECT round(avg(COALESCE(shipped_at::date - ordered_at::date, 0)), 2) AS avg_days
FROM orders;
```

只有当数据里的 NULL 确实表示 0 时才这样写。查询自己判断不了，得由你来判断。

**分组查询遇到空输入，返回 0 行。** “聚合总是返回一行”只在没有 `GROUP BY` 时成立。有了分组，没有行就没有组，没有组结果就是空的，而不是一行 0：

```sql run
SELECT status, count(*) AS orders
FROM orders
WHERE ordered_at >= '2025-01-01'
GROUP BY status;
```

## 常见错误 {#mistakes}

**1. 想数行，却写了 `count(列)`。** 每个分类有几件商品？

```sql run
SELECT category_id, count(category_id) AS products
FROM products
GROUP BY category_id
ORDER BY category_id;
```

最后一组，也就是没有分类的商品，显示 0，可 Gift Card 明明在这一组里。`GROUP BY` 给 NULL 分了一组，`count(category_id)` 却把本该数进去的那个 NULL 扔掉了。数行就写 `count(*)`；只有问题是“有几个有值”时，才写 `count(列)`。

**2. 用 `sum(x) / count(*)` 自己算平均。**

```sql run
SELECT sum(shipped_at::date - ordered_at::date) / count(*) AS avg_days
FROM orders;
```

结果是 1，而不是 1.71。分子和分母遵守的是两条不同的规则：`sum` 跳过了 10 个 NULL，`count(*)` 却把那 10 行也数了进去。（第 2 章讲过的整数除法还顺手截掉了小数。）`avg(x)` 的分子和分母用的是同一批值。

**3. 拿空的总和和 0 比较。** 哪些订单里没有单价不低于 100 美元的明细？

```sql run
SELECT order_id
FROM order_items
GROUP BY order_id
HAVING sum(quantity) FILTER (WHERE unit_price >= 100) = 0;
```

一行都没有，可大多数订单其实都符合。这些订单里没有一条明细通过 `FILTER`，总和是 NULL；`NULL = 0` 的结果是 unknown，`HAVING` 就把这一组扔掉了。改成计数，因为什么都没有时 `count` 是 0：`HAVING count(*) FILTER (WHERE unit_price >= 100) = 0`。把总和包进 `COALESCE(…, 0)` 也可以。

**4. 拿 `count` 去数一个条件。** `count(status = 'cancelled')` 读起来像“数已取消的订单”，结果却是 24。比较的结果是 true 或 false，从来不是 NULL，而 `count` 数的是所有不为 NULL 的值，false 也算。条件应该放进 `FILTER`：`count(*) FILTER (WHERE status = 'cancelled')`。

**5. 该用 `FILTER` 的地方用了 `WHERE`。** 每个分类有几件商品，其中几件已售罄：

```sql run
SELECT category_id, count(*) AS products, count(*) AS sold_out
FROM products
WHERE stock = 0
GROUP BY category_id;
```

只有一行，Electronics，两列都是 1。`WHERE` 在分组之前就把所有还有库存的商品筛掉了，于是其他分类全部消失，`products` 也只数到了售罄的那一件。应该保留所有行，只给需要条件的那个计数加上条件：`count(*) FILTER (WHERE stock = 0) AS sold_out`。

**6. `FILTER` 里漏了 `WHERE`。**

```sql run error
SELECT count(*) FILTER (stock = 0) AS sold_out
FROM products;
```

报错 `syntax error at or near "stock"`。按照格式，这个词不能少：`FILTER (WHERE stock = 0)`。

## 小结 {#summary}

- 聚合函数在计算之前先扔掉 NULL：`sum`、`avg`、`min`、`max` 和 `count(x)` 只看已知的值，`count(*)` 数的是行。
- `avg` 除以的是已知值的个数，而不是行数。
- 没有值可汇总时，`count` 返回 0，其他聚合函数返回 NULL；只有当“没有”就是 0 时，才用 `COALESCE` 把 NULL 换成 0。
- `FILTER (WHERE …)` 决定哪些行能进入某一个聚合函数；`WHERE` 替所有聚合函数一起决定，还可能让整组消失。

## 参考 {#reference}

- `FILTER` 是标准 SQL（SQL:2003）。PostgreSQL 从 9.4 起支持，SQLite 从 3.30 起支持。MySQL、MariaDB、SQL Server 和 Oracle 都不支持，在那里用 `count(CASE WHEN … THEN 1 END)` 或 `sum(CASE WHEN … THEN x END)` 达到同样效果。
- 标准要求聚合函数扔掉 NULL 时发出一条警告：“null value eliminated in set function”（SQLSTATE 01003）。SQL Server 会显示它；PostgreSQL 虽然列出了这个代码，却不会发出，所以扔掉 NULL 的过程悄无声息。
- 并不是所有聚合函数都扔掉 NULL。PostgreSQL 的 `array_agg` 和 `json_agg` 会保留 NULL；本章用到的聚合函数都会扔掉。
