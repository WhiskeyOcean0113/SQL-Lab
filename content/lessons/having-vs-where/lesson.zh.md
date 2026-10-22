## 为什么需要它 {#why}

店里要在首页开一个“40 美元以下”的专区，按分类分栏。一栏至少要有 2 件商品才值得单独开出来。于是问题是：哪些分类里，价格低于 40 美元的商品至少有 2 件？

上一篇你已经会按分类数商品了。最自然的第一次尝试，是把两个条件都写进 `WHERE`：

```sql run error
SELECT category_id, count(*) AS cheap_products
FROM products
WHERE price < 40 AND count(*) >= 2
GROUP BY category_id;
```

PostgreSQL 报错：`aggregate functions are not allowed in WHERE`。`price < 40` 没有问题，出问题的是 `count(*) >= 2`。这一课讲它为什么不能放在这里，以及它该放在哪里。

## 核心概念 {#core}

这条查询里其实有两种不同的条件。`price < 40` 对着一行就能回答：拿起一件商品，看它的价格，留下或者扔掉。`count(*) >= 2` 却没法对着一行回答：单独一件商品没有“件数”，只有一整个分类才有。

所以 SQL 有两个筛选的位置，分别在{{term:logical-order}}里的两个时刻：

`FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY`

`WHERE` 在分组之前执行，一次看一{{term:row}}。这时还没有任何{{term:group|组}}，`count(*)` 无从算起，所以 `WHERE` 里不能出现{{term:aggregate-function}}。`HAVING` 在分组和聚合之后执行，一次看一组。这时每组的 `count(*)`、`sum(…)` 都已经算好，可以拿来比较；反过来，组里单独的某一行已经看不到了。

下面把这条查询拆开，一步一步看真实的中间结果：

```steps
- sql: |
    SELECT id, name, category_id, price
    FROM products
    ORDER BY category_id, id;
  say: "`FROM`：16 件商品，颜色表示分类。这是 `WHERE` 要逐行检查的全部输入。"
  group: category_id
- sql: |
    SELECT id, name, category_id, price
    FROM products
    WHERE price < 40
    ORDER BY category_id, id;
  say: "`WHERE price < 40`：一行一行判断，留下 7 行。Gift Card 正好 50 美元，被去掉了，所以没有分类的那一组根本不会出现。"
  group: category_id
- sql: |
    SELECT category_id, count(*) AS cheap_products,
           string_agg(name, ', ' ORDER BY name) AS names
    FROM products
    WHERE price < 40
    GROUP BY category_id
    ORDER BY category_id;
  say: "`GROUP BY category_id`：留下的 7 行分成 5 组，每组算出自己的 `count(*)`。`names` 一列只是把组里的商品列出来，方便核对。"
  group: category_id
- sql: |
    SELECT category_id, count(*) AS cheap_products
    FROM products
    WHERE price < 40
    GROUP BY category_id
    HAVING count(*) >= 2
    ORDER BY category_id;
  say: "`HAVING count(*) >= 2`：一组一组判断，只有分类 4 和 5 各有 2 件，留了下来。去掉的是整组，不是组里的某几行。"
  group: category_id
```

注意第 2 步和第 4 步之间的联系。分类 3（Home）一共有 3 件商品，`HAVING` 却只数到 1 件，因为另外两件在 `WHERE` 那一步就已经被去掉了。`HAVING` 看到的永远是 `WHERE` 留下的行：先筛行，再分组，再筛组，这个先后决定了数出来的是什么。

所以判断一个条件该放在哪里，只需要问一个问题：对着一行能不能回答？

| 条件 | 对着一行能回答吗 | 放在 |
|---|---|---|
| 价格低于 40 美元 | 能，每件商品有自己的价格 | `WHERE` |
| 订单没有被取消 | 能，每笔订单有自己的状态 | `WHERE` |
| 至少有 2 件 | 不能，要先数整组 | `HAVING` |
| 平均价格超过 100 美元 | 不能，要先算整组 | `HAVING` |

能回答的放 `WHERE`，在分组之前就把不要的行去掉；必须先把一组汇总起来才能回答的，放 `HAVING`。

```check
query: |
  SELECT category_id, count(*) AS products
  FROM products
  GROUP BY category_id
  HAVING count(*) >= 2;
question: 把 `WHERE price < 40` 去掉，只留下 `HAVING`。现在有几个分类留下来？
choices: ['2', '4', '5', '6']
answer: 2
explain: 没有 `WHERE`，`HAVING` 数的是每个分类的全部商品。分类 1 到 5 都至少有 2 件；没有分类的那一组只有 Gift Card 一件，被去掉了。结果从 2 组变成了 5 组：条件放在哪一步，决定了 `HAVING` 数的是什么。
verify: { rows: 5 }
```

## 语法 {#syntax}

```syntax
SELECT select_list
FROM table_name
[ WHERE condition ]
[ GROUP BY grouping_element [, …] ]
[ HAVING condition ]
[ ORDER BY expression [, …] ]
```

| 部分 | 填什么 | 能省略吗 |
|---|---|---|
| `WHERE condition` | 对单独一行的条件，可以用表里的任何列，不能用聚合函数 | 能，省略时所有行都参与分组 |
| `GROUP BY grouping_element` | {{term:grouping-column}}或表达式 | 能 |
| `HAVING condition` | 对一整组的条件：聚合函数、分组列，以及由它们组成的表达式 | 能，省略时所有组都保留 |

两个 `condition` 的写法完全一样：比较、`AND`、`OR`、`IN`、`BETWEEN` 都能用。区别只在于能引用什么。`HAVING` 里出现的普通列必须是分组列，道理和 `SELECT` 一样：分组之后，其他列在一组里有好几个值，“这一组的价格”说不清是哪一个。

`HAVING` 写在 `GROUP BY` 之后、`ORDER BY` 之前，书写顺序和执行顺序一致。

对照格式读几条：

- `HAVING count(*) >= 2`：一个聚合和一个常量比较。
- `HAVING sum(stock) > 100 AND count(*) >= 3`：两个组条件用 `AND` 连起来，和 `WHERE` 里组合条件的方式一样。
- `WHERE status <> 'cancelled' … HAVING count(*) >= 3`：一个行条件、一个组条件，各在各的位置。

## 示例 {#example}

问题：哪些商品常被一次买好几件？说得具体一点：一行订单明细里买了 2 件或更多，算一次“多件购买”。找出至少有 2 次多件购买的商品，列出商品编号、多件购买的次数，以及这些明细一共买了多少件。

1. **定下“每个什么一行”。** 每个商品一行，所以按 `product_id` 分组。
2. **把条件拆开，逐个问“对着一行能不能回答”。** “这一行买了 2 件或更多”：看这行明细的 `quantity` 就知道，放 `WHERE`。“至少 2 次”：要数一个商品有几行这样的明细，放 `HAVING`。两个条件里都有“2”，但一个说的是行，一个说的是组。
3. **确定每组要算什么。** 次数是 `count(*)`，件数是 `sum(quantity)`。因为 `WHERE` 先去掉了只买 1 件的明细，这两个聚合都只算多件购买。
4. **按执行顺序写出来，再挑一组核对。**

```sql run
SELECT product_id, count(*) AS bulk_lines, sum(quantity) AS units
FROM order_items
WHERE quantity >= 2
GROUP BY product_id
HAVING count(*) >= 2
ORDER BY product_id;
```

核对商品 8（Ceramic Mug）：它出现在 4 行明细里，其中订单 22 只买了 1 件，被 `WHERE` 去掉；剩下 3 行，一共 2 + 4 + 6 = 12 件。

```check
query: |
  SELECT product_id, count(*) AS bulk_lines, sum(quantity) AS units
  FROM order_items
  WHERE quantity >= 2
  GROUP BY product_id
  HAVING count(*) >= 3
  ORDER BY product_id;
question: 把门槛改成至少 3 次多件购买。商品 6（USB-C Hub）还会留在结果里吗？
choices:
  - 会，它一共出现在 3 行明细里
  - 会，它的多件购买加起来有 5 件
  - 不会，它只有 2 次多件购买
  - 报错，同一条查询里不能既有 WHERE 又有 HAVING
answer: 2
explain: 商品 6 出现在订单 4、11、15 里，订单 11 那行只买了 1 件，已经被 `WHERE` 去掉。`HAVING` 看到的这一组只有 2 行，`count(*)` 是 2，不满足 `>= 3`。5 件是 `sum(quantity)`，不是这里比较的值。结果只剩商品 8 和 12。
```

## 变体 {#variants}

**`HAVING` 里的聚合不必出现在 `SELECT` 里。** 哪些订单状态涉及至少 4 位不同的顾客？结果显示的是订单数，筛选用的却是顾客数：

```sql run
SELECT status, count(*) AS orders
FROM orders
GROUP BY status
HAVING count(DISTINCT customer_id) >= 4;
```

delivered 有 11 笔订单，来自 10 位顾客；cancelled 和 shipped 涉及的顾客不到 4 位，被去掉了。

**用 `AND`、`OR` 组合组条件。** 仓库要人工复核两类订单：金额超过 300 美元的，以及至少有 3 行明细的。两个条件都是对整笔订单的汇总，用 `OR` 连起来：

```sql run
SELECT order_id, count(*) AS lines, sum(quantity * unit_price) AS total
FROM order_items
GROUP BY order_id
HAVING sum(quantity * unit_price) > 300 OR count(*) >= 3
ORDER BY order_id;
```

订单 5 只有一行，但金额是 399 美元；订单 3 不到 100 美元，但有 3 行。满足任意一个条件就会留下。

## 深入 {#deeper}

**没有 `GROUP BY` 的 `HAVING`。** 写了 `HAVING`，查询就是分组查询，哪怕没写 `GROUP BY`。这时所有行是一组，结果要么一行，要么一行都没有：

```sql run
SELECT count(*) AS orders, min(ordered_at) AS first_order
FROM orders
HAVING count(*) > 30;
```

0 行。聚合照常先算出一行（24 笔订单），`HAVING` 再判断这一组不满足条件，把它去掉。

**分组列上的条件能写在 `HAVING` 里，但应该写在 `WHERE` 里。** 分组列在组内只有一个值，所以 `HAVING category_id <= 2` 能运行，结果也和写在 `WHERE` 里一样。区别在过程：写在 `HAVING` 里，数据库要先把所有行分组、算完所有聚合，再扔掉大部分组；写在 `WHERE` 里，不要的行一开始就不参与分组。意思也更清楚：`WHERE` 管行，`HAVING` 管组。

## 常见错误 {#mistakes}

**1. 把聚合条件写进 `WHERE`。** 就是“为什么需要它”里的那条查询：`WHERE … count(*) >= 2` 报 `aggregate functions are not allowed in WHERE`。修法是把这个条件挪到 `GROUP BY` 之后的 `HAVING`，行条件 `price < 40` 留在 `WHERE`。

**2. 把行条件写进 `HAVING`。** 想数每个分类里 2023 年以后上架的商品：

```sql run error
SELECT category_id, count(*) AS products
FROM products
GROUP BY category_id
HAVING launched_on >= '2023-01-01';
```

报 `column "products.launched_on" must appear in the GROUP BY clause or be used in an aggregate function`。到了 `HAVING`，一个分类里有好几个上架日期，“这一组的上架日期”没有意义。“2023 年以后上架”说的是单件商品，写进 `WHERE`。不要照着报错把 `launched_on` 加进 `GROUP BY`：查询能跑了，但每组变成了“一个分类里同一天上架的商品”。

**3. 该先筛的行没有筛，数字悄悄变大。** 想找有至少 2 笔已发货订单的顾客，却只写了 `HAVING`：

```sql run
SELECT customer_id, count(*) AS shipped
FROM orders
GROUP BY customer_id
HAVING count(*) >= 2;
```

10 位顾客全在里面，因为 `count(*)` 数的是每位顾客的全部订单。“已发货”限定的是被数的行，必须在分组之前用 `WHERE shipped_at IS NOT NULL` 去掉其他订单。这个错误没有报错，结果看上去也合理，所以最难发现。写之前问自己：这个条件是在数之前用，还是数完之后用？

**4. 把组条件写成行条件。** “平均价格低于 50 美元的分类”，写成了：

```sql run
SELECT category_id, round(avg(price), 2) AS avg_price
FROM products
WHERE price < 50
GROUP BY category_id;
```

它也能运行，但回答的是另一个问题：每个分类里低于 50 美元的商品，平均多少钱。分类 2 的均价是 203 美元，却因为有一件 35 美元的 USB-C Hub 出现在结果里。“平均价格”是一组的汇总，条件要写成 `HAVING avg(price) < 50`，并去掉 `WHERE`。

**5. 在 `HAVING` 里用 `SELECT` 的{{term:alias}}。**

```sql run error
SELECT customer_id, count(*) AS n
FROM orders
GROUP BY customer_id
HAVING n >= 3;
```

报 `column "n" does not exist`。别名在 `SELECT` 这一步才产生，而 `HAVING` 排在它前面。在 PostgreSQL 里，`GROUP BY` 和 `ORDER BY` 可以用输出列的名字，`WHERE` 和 `HAVING` 不行。修法是把聚合再写一遍：`HAVING count(*) >= 3`。

## 小结 {#summary}

- `WHERE` 在分组之前一行一行地筛，不能用聚合函数；`HAVING` 在分组之后一组一组地筛，条件里是聚合函数或分组列。
- 判断方法：对着一行就能回答的条件放 `WHERE`，要先汇总一组才能回答的放 `HAVING`。
- `HAVING` 只看得到 `WHERE` 留下的行，所以 `WHERE` 会改变 `HAVING` 数到的数。
- `HAVING` 不能用 `SELECT` 的别名；没有 `GROUP BY` 时整张表是一组，结果可能是 0 行。

## 参考 {#reference}

- 标准 SQL 和 PostgreSQL 都不允许在 `HAVING` 里用 `SELECT` 的别名。MySQL 允许，所以先在 MySQL 里学过 SQL 的人，到了 PostgreSQL 常会碰到 `column does not exist`。
- MySQL 的手册同样建议：不要把本该写在 `WHERE` 里的条件写进 `HAVING`。
- 没有 `GROUP BY` 的 `HAVING` 是标准 SQL 的写法，PostgreSQL 的手册把它描述为：所有行组成一组，条件为真时输出一行，否则不输出。
