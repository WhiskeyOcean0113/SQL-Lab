## 为什么需要它 {#why}

下面这条查询想找出打九折后低于 20 美元的商品。它看起来很合理，却报错了：

```sql run error
SELECT name, price * 0.9 AS sale_price
FROM products
WHERE sale_price < 20;
```

`sale_price` 明明就在上一行定义了，数据库却说它 `does not exist`。原因不在拼写，而在顺序：数据库处理 `WHERE` 的时候，`SELECT` 还没有执行，`sale_price` 这个名字还不存在。

这一篇给你一张整条查询的"地图"。后面每学一个新的{{term:clause}}，都可以把它放到这张地图上。

## 核心概念 {#core}

你写 SQL 的顺序是：

```sql
SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY … LIMIT …
```

但数据库在逻辑上处理它们的顺序是：

1. `FROM`（包括 `JOIN`）：确定从哪些表取数据。
2. `WHERE`：逐行筛选，只留下条件为 true 的行。
3. `GROUP BY`：把行分组（第 3 章）。
4. `HAVING`：筛选分组（第 3 章）。
5. `SELECT`：计算要输出的列，并给它们起名字。
6. `DISTINCT`：去掉重复的行。
7. `ORDER BY`：排序。
8. `LIMIT` / `OFFSET`：只取其中一部分。

这叫{{term:logical-order}}。每一步都拿到上一步产生的{{term:intermediate-table}}，处理之后再交给下一步。可以把它想成一条流水线：数据从 `FROM` 进来，一站一站地被筛选、计算、排序，最后从 `LIMIT` 出去。

两条推论，后面会反复用到：

- **`SELECT` 里起的名字，只有排在它后面的步骤能用。** `ORDER BY` 可以用，`WHERE` 不能。
- **`WHERE` 可以使用任何列，包括你最后没有选出来的列。** 因为 `WHERE` 运行时，`FROM` 给出的所有列都还在。

这是"逻辑"顺序，不是数据库真正干活的步骤。PostgreSQL 会自己决定最快的执行方式，比如先用索引找到少数几行再读取。但无论怎么执行，结果都和按这个顺序一步步做出来的完全一样。所以推理查询会返回什么时，只需要想这个逻辑顺序。

## 示例 {#example}

问题：Electronics 分类（`category_id` 为 2）里最贵的两件商品是哪两件？

```sql run
SELECT name, price
FROM products
WHERE category_id = 2
ORDER BY price DESC
LIMIT 2;
```

按逻辑顺序，把每一步的中间结果写出来：

1. **`FROM products`**：全部 16 件商品，6 列。
2. **`WHERE category_id = 2`**：只剩 4 行，即 Noise-Cancelling Headphones、Mechanical Keyboard、USB-C Hub 和 4K Monitor。
3. **`SELECT name, price`**：每行只保留两列。
4. **`ORDER BY price DESC`**：按价格从高到低排：4K Monitor 399.00、Noise-Cancelling Headphones 249.00、Mechanical Keyboard 129.00、USB-C Hub 35.00。
5. **`LIMIT 2`**：取前两行。

你可以把查询"截断"在任意一步，亲眼看看那一步的中间结果。比如只运行到 `WHERE`：

```sql run
SELECT *
FROM products
WHERE category_id = 2;
```

注意第 2 步之后的顺序是数据库随意给的；只有到了第 4 步，顺序才被确定下来。如果去掉 `ORDER BY`，`LIMIT 2` 取到的就是"任意两行"，而不是最贵的两行。

## 变体 {#variants}

**在 `ORDER BY` 里使用别名。** `ORDER BY` 排在 `SELECT` 之后，所以可以直接用 `SELECT` 里起的名字：

```sql run
SELECT name, price * 0.9 AS sale_price
FROM products
ORDER BY sale_price
LIMIT 3;
```

**按没有选出来的列筛选。** 下面的查询只输出名字，却按价格筛选，这完全没问题：

```sql run
SELECT name
FROM products
WHERE price > 100;
```

**`JOIN` 属于 `FROM` 这一步。** 第 4 章会学到，`JOIN` 把几张表拼成一张，这件事发生在 `WHERE` 之前。所以 `WHERE` 可以同时使用所有被连接的表的列。

## 深入 {#deeper}

**为什么别名在 `ORDER BY` 里也有限制。** 别名在 `ORDER BY` 里只能单独使用，不能放进表达式。`ORDER BY sale_price` 可以，`ORDER BY sale_price + 1` 却会报同样的 `does not exist` 错误：

```sql run error
SELECT name, price * 0.9 AS sale_price
FROM products
ORDER BY sale_price + 1;
```

PostgreSQL 文档的说法是：输出列的名字"必须单独出现"。需要在表达式里用时，就把原来的表达式再写一遍：`ORDER BY price * 0.9 + 1`。

**其他数据库的差别。** 逻辑顺序来自 SQL 标准，大多数数据库都遵守，但细节上有出入。SQLite 允许在 `WHERE` 里使用 `SELECT` 起的别名，MySQL 允许在 `HAVING` 里使用。换到 PostgreSQL 时，这些写法会报错。按标准的逻辑顺序来写，在哪里都能运行。

**完整的顺序还有几站。** 第 5 章的 `UNION`、`INTERSECT`、`EXCEPT` 发生在 `DISTINCT` 之后、`ORDER BY` 之前；第 6 章的 `WITH` 子句则在最前面。到时候把它们补到这张地图上就好。

## 常见错误 {#mistakes}

**1. 在 `WHERE` 里使用 `SELECT` 的别名。** 这正是开头那个例子。改法是在 `WHERE` 里写出原来的表达式：

```sql
SELECT name, price * 0.9 AS sale_price
FROM products
WHERE price * 0.9 < 20;
```

**2. 子句的书写顺序写错。** 书写顺序是固定的，写成 `ORDER BY` 在 `WHERE` 前面会直接报语法错误：

```sql run error
SELECT name, price
FROM products
ORDER BY price
WHERE price < 30;
```

逻辑顺序和书写顺序不同，但书写顺序本身不能随意调换。

**3. 以为 `LIMIT` 会先于 `ORDER BY` 执行。** 有人担心"先取 3 行再排序"，于是不敢一起用。实际上排序在前，`LIMIT` 永远是在排好的结果上取。反过来更常见的错误是：只写 `LIMIT` 不写 `ORDER BY`，以为能得到"前几名"，其实得到的是任意几行。

**4. 以为没选出来的列就不能用来筛选。** 正好相反：`WHERE` 能看到 `FROM` 给出的所有列。只要列在表里，就可以拿来筛选或排序，不必出现在 `SELECT` 里。

**5. 在 `ORDER BY` 的表达式里使用别名。** 见上面的"深入"：别名只能单独使用。

## 小结 {#summary}

- 逻辑顺序是 `FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `DISTINCT` → `ORDER BY` → `LIMIT`。
- 每一步拿到上一步的中间表，处理后交给下一步。
- `SELECT` 里起的别名只有 `ORDER BY` 能用，`WHERE` 不能用。
- `WHERE` 可以使用表里的任何列，不管它最后有没有被选出来。
- 只有 `ORDER BY` 之后，行的顺序才是确定的；`LIMIT` 一定要配合 `ORDER BY`。
