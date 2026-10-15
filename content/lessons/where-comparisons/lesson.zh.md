## 为什么需要它 {#why}

`products` 里有 16 件商品，但"哪些商品已经卖完了？"这个问题的答案只有一行。`SELECT` 决定要哪些列，而决定要哪些行的，是 `WHERE`。

```sql run
SELECT name, stock
FROM products
WHERE stock = 0;
```

## 核心概念 {#core}

`WHERE` 后面写一个条件，叫{{term:predicate}}。数据库对 `FROM` 给出的每一行都判断一次这个条件，只留下结果为 true 的行。

条件通常由{{term:comparison-operator}}写成：

| 运算符 | 含义 | 例子 |
|---|---|---|
| `=` | 等于 | `stock = 0` |
| `<>` 或 `!=` | 不等于 | `status <> 'delivered'` |
| `<` / `>` | 小于 / 大于 | `price > 100` |
| `<=` / `>=` | 小于等于 / 大于等于 | `price >= 129` |

`<>` 是 SQL 标准写法，`!=` 是 PostgreSQL 接受的别名，两者完全相同。

比较的对象可以是列，也可以是写在查询里的固定值，叫{{term:literal}}。它们的写法取决于类型：

- **数字**直接写：`price > 100`。
- **文字**用单引号：`country = 'Canada'`。
- **日期**也用单引号，格式写成年-月-日：`joined_on >= '2024-01-01'`。

```sql run
SELECT name, joined_on
FROM customers
WHERE joined_on >= '2024-01-01';
```

在逻辑顺序里，`WHERE` 紧跟在 `FROM` 之后、`SELECT` 之前执行。所以它可以使用表里的任何列，哪怕这一列最后没有被选出来。

## 示例 {#example}

问题：哪些订单还没有送达？列出订单编号和状态。

1. **把问题翻译成一个对每一行都能回答"是"或"否"的条件。** "还没有送达"就是"状态不是 delivered"。
2. **选择运算符。** "不是"用 `<>`。
3. **写出字面量。** `'delivered'` 是文字，用单引号，并且大小写要和数据完全一致。
4. **放进 `WHERE`。**

```sql run
SELECT id, status
FROM orders
WHERE status <> 'delivered';
```

24 笔订单里有 13 笔不是 delivered：有的已发货（shipped），有的已付款（paid）、待处理（pending），还有已取消（cancelled）。如果问题其实是"已取消以外、还没送达的订单"，条件就要更复杂，这是下一篇的内容。

## 变体 {#variants}

**按数字筛选。** 单价不低于 129 美元的商品：

```sql run
SELECT name, price
FROM products
WHERE price >= 129;
```

`>=` 包含 129 本身，所以 Mechanical Keyboard 在结果里；写成 `>` 它就会消失。边界值要不要包含，是写条件时最需要停下来想的地方。

**按日期筛选。** 日期比较按时间先后：越晚的日期越"大"。

```sql run
SELECT id, ordered_at
FROM orders
WHERE ordered_at < '2024-02-01';
```

**筛选条件和选择列表互不相干。** 上面这条查询按 `ordered_at` 筛选，也恰好选出了它；但你完全可以只选 `id`，照样按 `ordered_at` 筛选。

## 深入 {#deeper}

**文字比较区分大小写。** 在 PostgreSQL 里，`'china'` 和 `'China'` 是两个不同的值：

```sql run
SELECT name
FROM customers
WHERE country = 'china';
```

结果是 0 行，而且不会有任何报错。MySQL 默认的比较规则不区分大小写，同样的查询在那里会返回 3 行；换数据库时要格外注意。

**文字按字典顺序比较，不按数值。** `'9' > '10'` 的结果是 true，因为逐个字符比较时 `'9'` 大于 `'1'`。数字一定要存成数字类型，并且和数字比较。

```sql run
SELECT '9' > '10' AS text_comparison, 9 > 10 AS number_comparison;
```

**单引号和双引号的分工。** 这是 PostgreSQL 严格遵守标准的地方：单引号包文字，双引号包名字（表名、列名、别名）。文字里本身有单引号时，写两个单引号：`'Liam O''Brien'`。

```sql run
SELECT name, city
FROM customers
WHERE name = 'Liam O''Brien';
```

## 常见错误 {#mistakes}

**1. 用双引号包文字。** 很多编程语言用双引号表示字符串，这个习惯带到 SQL 里就会出错：

```sql run error
SELECT name
FROM customers
WHERE country = "Canada";
```

`column "Canada" does not exist`：数据库把 `"Canada"` 当成了一个列名。把它改成 `'Canada'`。

**2. 用 `==` 表示等于。** 同样来自编程语言的习惯。SQL 的等于只有一个等号，`==` 会报 `operator does not exist`。

**3. 写反了组合运算符。** 小于等于是 `<=`，不是 `=<`；后者同样会报 `operator does not exist`。

**4. 边界算错。** "价格不低于 129"是 `>= 129`，"价格高于 129"是 `> 129`。研究发现，比较运算符用错是新手最难自己发现的错误之一，因为查询能正常运行，只是多了或少了几行。写完条件后，专门检查一下边界上的那个值。

**5. 大小写和数据不一致。** `status = 'Delivered'` 一行也找不到，因为数据里存的是小写的 `delivered`。不确定时，先用 `SELECT` 看看数据实际长什么样。

## 小结 {#summary}

- `WHERE` 对每一行判断条件，只留下结果为 true 的行。
- 比较运算符有 `=`、`<>`（或 `!=`）、`<`、`>`、`<=`、`>=`。
- 文字和日期写在单引号里；双引号用来包名字。
- 文字比较区分大小写，而且按字典顺序比较。
- 写完条件要检查边界：`>=` 和 `>` 只差一个值，却最容易出错。
