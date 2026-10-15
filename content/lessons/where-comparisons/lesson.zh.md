## 为什么需要它 {#why}

`products` 里有 16 件商品，但“哪些商品已经卖完了？”这个问题的答案只有一行。`SELECT` 决定要哪些列，而决定要哪些行的，是 `WHERE`。

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

比较的两边可以是列、{{term:literal}}，也可以是计算式。字面量的写法第 0 章讲过：数字直接写，文字和日期放在单引号里，日期写成“年-月-日”：

```sql run
SELECT name, joined_on
FROM customers
WHERE joined_on >= '2024-01-01';
```

在逻辑顺序里，`WHERE` 紧跟在 `FROM` 之后、`SELECT` 之前执行。所以它可以使用表里的任何列，哪怕这一列最后没有被选出来。

**条件的结果不止 true 和 false。** 比较的任何一边是 NULL 时，结果既不是 true 也不是 false，而是 NULL，意思是“不知道”。`WHERE` 只留下结果为 true 的行，所以结果为 NULL 的行也会被丢掉。“深入”里有一个例子，本章讲 NULL 的那一课会完整讲清楚。

## 语法 {#syntax}

```syntax
SELECT select_list
FROM table_name
WHERE condition
```

`WHERE` 子句是可选的；写了它，就写在 `FROM` 后面。`condition` 是一个对每一行都能算出 true、false 或 NULL 的{{term:expression}}。这一课的 `condition` 是一个比较，形状是：

```syntax
expression { = | <> | != | < | > | <= | >= } expression
```

| 部分 | 填什么 | 说明 |
|---|---|---|
| 左边的 `expression` | 列名、字面量或计算式 | 最常见的是列名，比如 `stock` |
| 运算符 | 六种比较中选一种 | `<>` 和 `!=` 完全相同 |
| 右边的 `expression` | 同左边 | 最常见的是字面量，比如 `0` |

两边的类型要能比较：数字和数字比，文字和文字比，日期和日期比。

对照这个形状读几个条件：

- `stock = 0`：列和字面量比较。
- `0 = stock`：两边换个位置，意思不变，只是不如前一种好读。
- `price * stock > 1500`：左边是计算式，每一行先算出库存总价，再和 1500 比较。

下一课会用 `AND`、`OR`、`NOT` 把几个这样的比较组合成一个 `condition`。

## 示例 {#example}

问题：哪些订单还没有送达？列出订单编号和状态。

1. **把问题翻译成一个对每一行都能回答“是”或“否”的条件。** “还没有送达”就是“状态不是 delivered”。
2. **选择运算符。** “不是”用 `<>`。
3. **写出字面量。** `'delivered'` 是文字，用单引号，并且大小写要和数据完全一致。
4. **放进 `WHERE`。**

```sql run
SELECT id, status
FROM orders
WHERE status <> 'delivered';
```

24 笔订单里有 13 笔不是 delivered：有的已发货（shipped），有的已付款（paid）、待处理（pending），还有已取消（cancelled）。如果问题其实是“已取消以外、还没送达的订单”，条件就要更复杂，这是下一篇的内容。

## 变体 {#variants}

**按数字筛选。** 单价不低于 129 美元的商品：

```sql run
SELECT name, price
FROM products
WHERE price >= 129;
```

`>=` 包含 129 本身，所以 Mechanical Keyboard 在结果里；写成 `>` 它就会消失。边界值要不要包含，是写条件时最需要停下来想的地方。

**按日期筛选。** 日期比较按时间先后：越晚的日期越“大”。

```sql run
SELECT id, ordered_at
FROM orders
WHERE ordered_at < '2024-02-01';
```

**筛选条件和选择列表互不相干。** 上面这条查询按 `ordered_at` 筛选，也恰好选出了它；但你完全可以只选 `id`，照样按 `ordered_at` 筛选。

**比较的一边可以是计算式。** 库存总价超过 1500 美元的商品：

```sql run
SELECT name, price * stock AS stock_value
FROM products
WHERE price * stock > 1500;
```

`WHERE` 里不能写 `stock_value > 1500`，因为别名要到 `SELECT` 才出现（第 0 章的逻辑顺序）。所以计算式在 `WHERE` 里要再写一遍。

**文字也能比大小。** 文字按字符逐个比较，排在前面的“小”。名字排在 D 之前的商品：

```sql run
SELECT name
FROM products
WHERE name < 'D';
```

4K Monitor 也在结果里，因为数字字符排在所有字母前面。

## 深入 {#deeper}

**文字比较区分大小写。** 在 PostgreSQL 里，`'china'` 和 `'China'` 是两个不同的值：

```sql run
SELECT name
FROM customers
WHERE country = 'china';
```

结果是 0 行，而且不会有任何报错。MySQL 默认的比较规则不区分大小写，同样的查询在那里会返回 3 行；换数据库时要格外注意。

**文字比较的顺序由排序规则决定。** 文字比大小时依据的规则叫{{term:collation}}。本课程的数据库使用最简单的 C 规则，按字符编码比较：数字在大写字母前面，大写字母又都在小写字母前面，所以 `'Zebra' < 'apple'` 为 true。很多正式安装的 PostgreSQL 使用按语言习惯排序的规则，结果可能不同。要比较文字的先后时，先确认数据的大小写是否统一。

**文字按字典顺序比较，不按数值。** `'9' > '10'` 的结果是 true，因为逐个字符比较时 `'9'` 大于 `'1'`。数字一定要存成数字类型，并且和数字比较。

```sql run
SELECT '9' > '10' AS text_comparison, 9 > 10 AS number_comparison;
```

**`<>` 不会选出 NULL。** 想找“不住在 Toronto 的顾客”：

```sql run
SELECT name, city
FROM customers
WHERE city <> 'Toronto';
```

12 位顾客里有 2 位住在 Toronto，结果却只有 8 行，而不是 10 行。Liam O'Brien 和 Lucas Silva 的城市是 NULL，`NULL <> 'Toronto'` 的结果是 NULL，不是 true，所以他们被丢掉了。要把他们也算进来，需要本章 NULL 那一课的 `IS NULL`。

**拿日期和时间戳比较等于。** `ordered_at` 是时间戳，带着时分秒。`ordered_at = '2024-01-05'` 的意思是“正好在 2024-01-05 零点整下单”：

```sql run
SELECT id, ordered_at
FROM orders
WHERE ordered_at = '2024-01-05';
```

结果是 0 行，尽管订单 1 就是那天上午下的。要找某一天的订单，得写成一个范围：`ordered_at >= '2024-01-05'` 并且 `ordered_at < '2024-01-06'`。下一课学 `AND` 之后就能这样写。

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

**4. 边界算错。** “价格不低于 129”是 `>= 129`，“价格高于 129”是 `> 129`。研究发现，比较运算符用错是新手最难自己发现的错误之一，因为查询能正常运行，只是多了或少了几行。写完条件后，专门检查一下边界上的那个值。

**5. 大小写和数据不一致。** `status = 'Delivered'` 一行也找不到，因为数据里存的是小写的 `delivered`。不确定时，先用 `SELECT` 看看数据实际长什么样。

**6. 以为 `<>` 会选出值为 NULL 的行。** 日常语言里，“城市不是 Toronto”当然包括“城市不知道”的人；在 SQL 里不包括。见“深入”：比较的一边是 NULL，结果就是 NULL，这一行会被 `WHERE` 丢掉。

**7. 在 `WHERE` 里使用 `SELECT` 的别名。** 第 0 章讲过：`WHERE` 在 `SELECT` 之前执行，别名还不存在。在 `WHERE` 里把计算式再写一遍。

## 小结 {#summary}

- `WHERE` 对每一行判断条件，只留下结果为 true 的行。
- 比较运算符有 `=`、`<>`（或 `!=`）、`<`、`>`、`<=`、`>=`。
- 比较的任何一边是 NULL，结果就是 NULL，这一行会被丢掉，`<>` 也一样。
- 文字比较区分大小写，而且按字典顺序比较。
- 写完条件要检查边界：`>=` 和 `>` 只差一个值，却最容易出错。
