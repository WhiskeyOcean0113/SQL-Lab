## 为什么需要它 {#why}

市场部想把商品分成三档：100 美元以上是 premium，30 到 100 美元是 standard，其余是 budget。表里没有“档位”这一列，它取决于价格落在哪个区间。

“如果……就……否则……”这种逻辑，在 SQL 里用{{term:case-expression}}来写。

## 核心概念 {#core}

一个{{term:case-expression}}由若干个 `WHEN … THEN …` 分支组成，最后可以有一个 `ELSE`，以 `END` 结束。完整的格式见下面的“语法”小节；先看它怎样计算：

- 数据库**从上往下**逐个判断 `WHEN` 后面的条件，**第一个**为 true 的分支给出结果，后面的不再看。
- 所有条件都不成立时，返回 `ELSE` 的值；**没写 `ELSE`，就返回 NULL**。
- `CASE … END` 是一个表达式，每一行算出一个值。凡是能写值的地方都能用它：`SELECT`、`WHERE`、`ORDER BY` 都可以。

```sql run
SELECT name, price,
       CASE
         WHEN price >= 100 THEN 'premium'
         WHEN price >= 30 THEN 'standard'
         ELSE 'budget'
       END AS tier
FROM products
ORDER BY price DESC;
```

## 语法 {#syntax}

CASE 有两种写法。第一种叫搜索式 CASE，每个分支各写一个完整的条件：

```syntax
CASE WHEN condition THEN result
     [ WHEN … ]
     [ ELSE result ]
END
```

第二种叫简单 CASE，先在 `CASE` 后面写一个值，每个分支只写要和它比较的值：

```syntax
CASE expression
     WHEN value THEN result
     [ WHEN … ]
     [ ELSE result ]
END
```

`[ WHEN … ]` 的意思是：可以再写任意多个形状相同的 `WHEN` 分支。这是 PostgreSQL 手册的写法，和 `[, …]` 一样表示重复，只是分支之间不用逗号。

| 部分 | 填什么 | 能省略吗 |
|---|---|---|
| `condition` | 任何条件，第 1 章学过的都可以：比较、`AND`/`OR`、`IS NULL`、`IN`、`LIKE`…… | 不能 |
| `result` | 这个分支返回的值；所有分支的 `result` 类型必须一致 | 不能 |
| `expression`（简单 CASE） | 要拿来比较的值，通常是一列 | 不能 |
| `value`（简单 CASE） | 和 `expression` 比较是否相等的值 | 不能 |
| 第一个之后的 `WHEN` | 更多分支 | 可以 |
| `ELSE result` | 所有分支都不成立时的值 | 可以；不写时返回 NULL |

简单 CASE 的 `WHEN value` 等于搜索式的 `WHEN expression = value`。所以简单 CASE 只能判断“等于”，判断范围、判断 NULL 都要用搜索式。

和 CASE 关系密切的几个函数：

```syntax
coalesce(value [, …])
nullif(value1, value2)
greatest(value [, …])
least(value [, …])
```

| 函数 | 返回 |
|---|---|
| `coalesce` | 第一个不是 NULL 的参数；全是 NULL 时返回 NULL |
| `nullif` | 两个参数相等时返回 NULL，否则返回第一个参数 |
| `greatest` / `least` | 参数中最大 / 最小的那个 |

函数名不分大小写，本课的查询里写成大写的 `COALESCE`、`NULLIF`，和格式里的小写是同一个函数。

对照格式读核心概念里的分档查询：它是搜索式 CASE，有两个 `WHEN` 分支，加一个 `ELSE`，整个 `CASE … END` 是选择列表里的一项，后面跟着别名 `AS tier`。

## 示例 {#example}

问题：给每件商品加一个库存提示：卖完了显示 `sold out`，少于 10 件显示 `low`，其他情况显示 `ok`。

1. **列出所有情况和对应的值。** 0 件、少于 10 件、其他。
2. **决定顺序。** 0 件也满足“少于 10 件”，所以更具体的条件要写在前面。
3. **写 `ELSE`**，覆盖剩下的所有情况，避免出现 NULL。
4. **起名。** `AS stock_note`。

```sql run
SELECT name, stock,
       CASE
         WHEN stock = 0 THEN 'sold out'
         WHEN stock < 10 THEN 'low'
         ELSE 'ok'
       END AS stock_note
FROM products;
```

4K Monitor 是 sold out；Noise-Cancelling Headphones（8 件）、Linen Throw（7 件）、Folding Chair（5 件）是 low。

## 变体 {#variants}

**简单 CASE。** 如果每个分支都是在比较同一个值是否相等，可以把它写在 `CASE` 后面：

```sql run
SELECT id, status,
       CASE status
         WHEN 'delivered' THEN 'closed'
         WHEN 'cancelled' THEN 'closed'
         ELSE 'open'
       END AS phase
FROM orders;
```

**自定义排序。** 订单状态按字母排序没有意义；按处理流程排，就用 CASE 把状态映射成数字：

```sql run
SELECT id, status
FROM orders
ORDER BY CASE status
           WHEN 'pending' THEN 1
           WHEN 'paid' THEN 2
           WHEN 'shipped' THEN 3
           WHEN 'delivered' THEN 4
           ELSE 5
         END, id;
```

**`COALESCE`：取第一个不是 NULL 的值。** `COALESCE(city, 'unknown')` 在城市为 NULL 时给出 `unknown`，相当于一个简写的 CASE：

```sql run
SELECT name, COALESCE(city, 'unknown') AS city
FROM customers;
```

**`COALESCE` 可以有多个备选。** 从左往右找第一个不是 NULL 的值。联系顾客时，先用城市，没有城市就用邮箱，都没有就写 `no contact`：

```sql run
SELECT name, city, email, COALESCE(city, email, 'no contact') AS reach
FROM customers;
```

**`greatest` 和 `least`：取最大、最小值。** 它们在同一行的几个值之间比较，不是在多行之间比较（多行之间要用第 3 章的聚合函数）：

```sql run
SELECT greatest(3, 7, 5) AS largest, least(3, 7, 5) AS smallest;
```

**`NULLIF`：相等时变成 NULL。** `NULLIF(stock, 0)` 在库存为 0 时返回 NULL。最常见的用途是防止除以零：

```sql run
SELECT name, price, stock, price / NULLIF(stock, 0) AS price_per_unit
FROM products;
```

4K Monitor 的库存是 0，这一列得到 NULL，而不是报错。

## 深入 {#deeper}

**简单 CASE 判断不了 NULL。** `CASE city WHEN NULL THEN …` 实际上是在判断 `city = NULL`，而它永远不是 true：

```sql run
SELECT name, city,
       CASE city WHEN NULL THEN 'unknown' ELSE city END AS simple_case,
       CASE WHEN city IS NULL THEN 'unknown' ELSE city END AS searched_case
FROM customers;
```

Liam O'Brien 那一行，第一种写法仍然是 NULL。处理 NULL 要用带 `IS NULL` 的完整写法，或者直接用 `COALESCE`。

**所有分支的类型必须一致。** 一个 CASE 只能返回一种类型。下面的查询一个分支是文字、另一个是整数，于是报错：

```sql run error
SELECT name,
       CASE WHEN stock = 0 THEN 'sold out' ELSE stock END AS stock_label
FROM products;
```

PostgreSQL 试图把 `'sold out'` 转成整数而失败。把数字也转成文字，写成 `stock::text`，就能通过（本章最后一篇讲类型转换）。

**CASE 只计算被选中的分支。** 和 `AND`、`OR` 不同，PostgreSQL 保证 CASE 按顺序判断，只计算第一个成立的分支的 `result`。所以下面的写法能安全地避开除以零：

```sql run
SELECT name, stock,
       CASE WHEN stock = 0 THEN NULL ELSE 100 / stock END AS per_hundred
FROM products;
```

第 1 章讲 `AND` 时说过，`stock <> 0 AND 100 / stock > 5` 不保证先判断左边；需要控制计算顺序时，就用 CASE。（例外是常量：`100 / 0` 这种不依赖任何列的写法，可能在查询开始前就被算出来并报错。）

**`greatest` 和 `least` 遇到 NULL。** PostgreSQL 的 `greatest(1, NULL)` 是 1，它跳过 NULL；MySQL 的同名函数却返回 NULL。两者都不是 SQL 标准的一部分，换数据库时要重新确认。

**标准与方言。** `CASE`、`COALESCE`、`NULLIF` 都是 SQL 标准，在所有主流数据库里都能用。MySQL 的 `IF()`、SQL Server 的 `IIF()` 是各自的扩展。

## 常见错误 {#mistakes}

**1. 分支顺序写反。** 先写宽的条件，窄的条件就永远轮不到：

```sql run
SELECT name, price,
       CASE
         WHEN price >= 30 THEN 'standard'
         WHEN price >= 100 THEN 'premium'
         ELSE 'budget'
       END AS tier
FROM products
WHERE price >= 100;
```

三件 100 美元以上的商品全被标成了 standard，因为 `price >= 30` 先成立了。从最具体（最窄）的条件写起。

**2. 忘了 `ELSE`。** 没有匹配的行会得到 NULL，常常在后面的计算或拼接里引起连锁问题。即使你认为条件已经覆盖了所有情况，也写一个 `ELSE`。

**3. 用简单 CASE 判断 NULL。** 见“深入”：`WHEN NULL` 永远不会匹配。

**4. 分支返回不同类型。** 文字和数字混在一起会报错，要先统一类型。

**5. 把两种写法混在一起。** `CASE` 后面写了值，`WHEN` 后面又写完整的条件：

```sql run error
SELECT name,
       CASE price WHEN price >= 100 THEN 'premium' ELSE 'other' END AS tier
FROM products;
```

报 `operator does not exist: numeric = boolean`。按简单 CASE 的格式，它在比较 `price = (price >= 100)`：左边是数字，右边是真假值。要判断范围，就去掉 `CASE` 后面的 `price`，写成搜索式。

**6. 漏写 `END`。** `CASE` 必须以 `END` 结束，别名写在 `END` 之后。

## 小结 {#summary}

- `CASE WHEN … THEN … ELSE … END` 从上往下判断，第一个成立的分支给出结果。
- 没写 `ELSE` 时，不匹配的行得到 NULL。
- 简单 CASE 适合“等于某个值”的比较，但判断不了 NULL。
- CASE 可以用在 `SELECT`、`WHERE`、`ORDER BY` 等任何能写值的地方，所有分支的类型必须一致。
- `COALESCE` 取第一个非 NULL 值，`NULLIF` 在相等时返回 NULL，常用来防止除以零。
