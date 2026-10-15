## 为什么需要它 {#why}

`SELECT *` 适合第一次看一张表，但真正回答问题时，你往往只需要其中几列。仓库主管问：“每件商品的名字和库存是多少？”这个问题用不到上架日期，也用不到分类编号。

再进一步，有些答案根本不在表里，需要算出来：“每件商品的库存值多少钱？”表里只有单价和库存数量，库存总价得由你在查询里算。

这一篇学的就是 `SELECT` 的这两件事：挑选列，以及计算新的列。

## 核心概念 {#core}

`SELECT` 后面写的是一张清单，叫{{term:select-list}}，每一项就是结果里的一列，用逗号分隔：

```sql run
SELECT name, stock
FROM products;
```

几个要点：

- **列的先后由你决定。** 结果的列按你在清单里写的顺序排列，和它们在表里的顺序无关。
- **清单里可以写{{term:expression}}，不只是列名。** `price * stock` 会对每一行算一次。
- **用 `AS` 给结果的列起名。** 这个名字叫{{term:alias}}。不起名时，PostgreSQL 会给计算出来的列一个难看的默认名 `?column?`。

```sql run
SELECT name, price * stock AS stock_value
FROM products;
```

回想上一篇的逻辑顺序：`SELECT` 在 `FROM` 和 `WHERE` 之后执行。它拿到的是已经筛选好的行，再对每一行算出你要的列。

## 示例 {#example}

问题：列出每件商品的名字、单价、库存数量，以及库存总价，并把最后一列命名为 `stock_value`。

1. **确定要哪些列，按什么顺序。** 名字、单价、库存，最后是库存总价。
2. **表里已有的列直接写列名。** `name, price, stock`。
3. **表里没有的列写成表达式。** 库存总价是 `price * stock`。
4. **给计算出来的列起名。** `AS stock_value`。

```sql run
SELECT name, price, stock, price * stock AS stock_value
FROM products;
```

4K Monitor 的库存是 0，所以它的 `stock_value` 是 0.00；Gift Card 的单价 50.00 乘以库存 999，得到 49950.00，是全店库存总价最高的商品。

## 变体 {#variants}

**`AS` 可以省略，但建议保留。** `price * stock stock_value` 和加了 `AS` 的写法效果相同。可省略恰恰是很多隐蔽错误的来源（见“常见错误”第 1 条），所以本课程的写法始终带上 `AS`。

**带空格或大写字母的别名要用双引号。** 双引号包住的是名字，不是文字：

```sql run
SELECT name AS "Product name", price AS "Price (USD)"
FROM products;
```

**常量列。** 清单里也可以写一个固定的值，它会出现在每一行。文字常量用单引号：

```sql run
SELECT name, price, 'USD' AS currency
FROM products;
```

**算术运算。** `+`、`-`、`*`、`/` 都可以用，比如含 10% 税的价格：

```sql run
SELECT name, price, price * 1.1 AS price_with_tax
FROM products;
```

结果带有三位小数（46.200），因为 `numeric` 相乘时会保留两边小数位数之和。第 2 章会学到怎样四舍五入。

## 深入 {#deeper}

**别名是结果的列名，不会改变表。** `AS stock_value` 只影响这一次查询的结果，`products` 表里并不会多出一列。

**别名不能和关键字冲突。** `order` 是 SQL 的关键字。`SELECT name AS order` 在 PostgreSQL 里可以运行，但如果省略 `AS`，写成 `SELECT name order`，就会报语法错误。这又是一个保留 `AS` 的理由；更好的做法是一开始就别用关键字作名字。

**`SELECT *` 的代价。** 在练习里查看一张表时 `SELECT *` 很方便，但在正式的查询里最好列出需要的列：结果更容易读，数据量更小，而且表以后加了新列，查询的结果也不会悄悄变化。

**整数除法。** 两个整数相除，结果仍是整数：`7 / 2` 得到 3，而不是 3.5。`stock / 2` 这类计算要当心。第 2 章讲数值类型时会详细说明。

## 常见错误 {#mistakes}

**1. 列之间漏了逗号。** 这是最隐蔽的错误之一，因为它不会报错：

```sql run
SELECT name price
FROM products;
```

结果只有一列，列名是 `price`，内容却是商品名。数据库把 `price` 理解成了 `name` 的别名（还记得 `AS` 可以省略吗）。只要结果的列数比你预期的少，就检查一下逗号。

**2. 最后一列后面多了逗号。** `SELECT name, price, FROM products;` 会报 `syntax error at or near "FROM"`。逗号只出现在两列之间。

**3. 用单引号写别名。** 单引号包的是文字，不是名字。`SELECT name AS 'n'` 会报语法错误，要写成 `AS n` 或 `AS "n"`。

**4. 以为列的顺序由表决定。** 结果的列按你写的顺序排列。题目要求“名字在前、价格在后”时，清单就得按这个顺序写。

**5. 计算出来的列忘了起名。** `SELECT price * stock` 的结果列叫 `?column?`。别人（包括以后的你）读结果时不知道它是什么，题目要求列名时也会判错。

## 小结 {#summary}

- `SELECT` 后面是一张用逗号分隔的清单，每一项是结果的一列，顺序由你决定。
- 清单里可以写表达式，比如 `price * stock`，它会对每一行计算一次。
- 用 `AS` 给结果的列起别名；带空格的别名用双引号，文字常量用单引号。
- 漏写逗号不会报错，却会把下一列变成别名；结果列数不对时先检查逗号。
