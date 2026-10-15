## 为什么需要它 {#why}

`SELECT *` 适合第一次看一张表，但真正回答问题时，你往往只需要其中几列。仓库主管问：“每件商品的名字和库存是多少？”这个问题用不到上架日期，也用不到分类编号。

再进一步，有些答案根本不在表里，需要算出来：“每件商品的库存值多少钱？”表里只有单价和库存数量，库存总价得由你在查询里算。

这一篇学的就是 `SELECT` 的这两件事：挑选列，以及计算新的列。

## 核心概念 {#core}

### 选择列表

`SELECT` 后面写的是一张清单，叫{{term:select-list}}。清单里的每一项就是结果里的一列，项与项之间用逗号分隔：

```sql run
SELECT name, stock
FROM products;
```

**结果的列按你写的顺序排列。** 它们在表里是什么顺序并不重要。上面的查询先列 `name` 再列 `stock`，结果就是这个顺序。

### 每一项都是一个表达式

清单里的每一项都是一个{{term:expression}}，也就是一段能算出一个值的写法。最常见的几种：

| 表达式 | 例子 | 每一行算出的值 |
|---|---|---|
| 列名 | `price` | 这一行的单价 |
| {{Term:literal}} | `'USD'`、`1.1` | 每一行都一样的固定值 |
| 用{{term:operator}}组合起来的式子 | `price * stock` | 这一行的单价乘以这一行的库存 |
| {{Term:function}}调用 | `upper(name)` | 这一行商品名的大写形式（第 2 章详讲） |

这些写法可以任意组合，比如 `price * stock * 0.8`。

**表达式对每一行各算一次。** `FROM products` 有 16 行，结果也有 16 行；每一行里的 `price * stock`，用的都是这一行自己的单价和库存。`SELECT` 只决定结果有哪些列，不会增加或减少行。

```sql run
SELECT name, price * stock AS stock_value
FROM products;
```

### 用 `AS` 给结果的列起名

`AS stock_value` 给计算出来的列起了一个名字，叫{{term:column-alias}}。不起名时，PostgreSQL 按下面的规则自动取名：

- 直接写列名，结果列就沿用这个列名。
- 函数调用，用函数名，比如 `upper(name)` 的列名是 `upper`。
- 其他表达式一律叫 `?column?`，没人看得出它是什么。

所以，凡是计算出来的列，都应该用 `AS` 起一个说明含义的名字。

回想上一篇的逻辑顺序：`SELECT` 在 `FROM` 和 `WHERE` 之后执行。它拿到的是已经筛选好的行，再对每一行算出你要的列。

## 语法 {#syntax}

```syntax
SELECT { * | expression [ [ AS ] output_name ] } [, …]
FROM table_name
```

| 部分 | 填什么 | 能省略吗 |
|---|---|---|
| `*` | 表里的所有列，按建表时的顺序排列 | 每一项写 `*` 或者写 `expression`，二选一 |
| `expression` | 列名、字面量、运算式或函数调用 | 同上 |
| `AS output_name` | 这一列在结果里的名字。`output_name` 是一个名字，规则和其他{{term:identifier}}一样：不加引号会转成小写，要保留大写或空格就加双引号 | 整个可以省略；只省略 `AS`、保留名字也能运行，但本课程始终写上 `AS` |
| `[, …]` | 更多的项，每项前面加一个逗号 | 可以省略，只写一项 |
| `table_name` | 要读的表 | 本课总是写；PostgreSQL 也允许没有 `FROM` 的查询 |

按这个格式读几条查询：

- `SELECT * FROM products`：只有一项，选了 `*`。
- `SELECT name, price * stock AS stock_value FROM products`：两项，第二项是带名字的表达式。
- `SELECT *, price * stock AS stock_value FROM products`：两项，`*` 后面还可以继续列其他项。

后面的课会在这个格式上一步步加入 `WHERE`、`ORDER BY` 等子句。

## 示例 {#example}

### 示例 1：库存总价

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

### 示例 2：打八折

问题：促销期间全场打八折。列出每件商品的名字、折后单价 `sale_price`，以及按折后单价算出的库存总价 `sale_value`。

1. **折后单价。** 单价乘以 0.8：`price * 0.8 AS sale_price`。
2. **折后库存总价。** 很自然会想写 `sale_price * stock`，但别名在同一个选择列表里还不能用（见“深入”）。所以把折后单价的表达式再写一遍：`price * 0.8 * stock`。
3. **给两列都起名。** 列多了，每项各占一行更好读。

```sql run
SELECT name,
       price * 0.8 AS sale_price,
       price * 0.8 * stock AS sale_value
FROM products;
```

Ceramic Mug 原价 12.50，折后 10.000；库存 100 件，折后库存总价 1000.000。结果有三位小数，因为 `numeric` 相乘时，小数位数是两边小数位数之和：12.50 有两位，0.8 有一位。

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

结果带有三位小数（46.200），原因和示例 2 一样。第 2 章会学到怎样四舍五入。

**`*` 和其他项一起用。** 想看整张表，同时多加一列计算结果：

```sql run
SELECT *, price * stock AS stock_value
FROM products;
```

`*` 也可以写成 `products.*`，意思是“`products` 表的所有列”。现在看不出区别，到第 4 章同时查几张表时，就能用它只展开其中一张表的列。

**同一列可以出现多次。** 选择列表里的每一项是独立计算的，`SELECT name, name FROM products` 会得到两列完全相同的商品名。这很少有用，但说明了一点：清单列的是“要输出什么”，而不是“表里有哪些列”。

## 深入 {#deeper}

**别名在同一个选择列表里不能用。** 下面这条查询想用刚起的名字 `stock_value` 再算一列，结果报错：

```sql run error
SELECT name,
       price * stock AS stock_value,
       stock_value / 2 AS half_value
FROM products;
```

选择列表里的各项，可以看作是用同一行输入“同时”算出来的。`stock_value` 是输出结果的列名，计算其他项时它还不存在。办法有两个：像示例 2 那样把表达式再写一遍，或者等到第 5 章用子查询分两步算。按照逻辑顺序，只有排在 `SELECT` 后面的 `ORDER BY` 才能使用别名。

**别名也遵守名字的大小写规则。** `AS StockValue` 得到的列名是 `stockvalue`，因为不加引号的名字会转成小写。要保留大写，就写 `AS "StockValue"`。最省心的做法是别名一律用小写加下划线：`stock_value`。

**别名是结果的列名，不会改变表。** `AS stock_value` 只影响这一次查询的结果，`products` 表里并不会多出一列。

**别名不能和关键字冲突。** `order` 是 SQL 的关键字。`SELECT name AS order` 在 PostgreSQL 里可以运行，但如果省略 `AS`，写成 `SELECT name order`，就会报语法错误。这又是一个保留 `AS` 的理由；更好的做法是一开始就别用关键字作名字。

**结果里可以有同名的列。** `SELECT name AS x, price AS x` 能运行，结果的两列都叫 `x`。PostgreSQL 不会阻止，但这样的结果没法按名字区分各列，应该避免。

**`SELECT *` 的代价。** 在练习里查看一张表时 `SELECT *` 很方便，但在正式的查询里最好列出需要的列：结果更容易读，数据量更小，而且表以后加了新列，查询的结果也不会悄悄变化。

**整数除法。** 两个整数相除，结果仍是整数：`7 / 2` 得到 3，而不是 3.5。`stock / 2` 这类计算要当心。第 2 章讲数值类型时会详细说明。

## 常见错误 {#mistakes}

**1. 列之间漏了逗号。** 这是最隐蔽的错误之一，因为它不会报错：

```sql run
SELECT name price
FROM products;
```

结果只有一列，列名是 `price`，内容却是商品名。数据库把 `price` 理解成了 `name` 的别名（还记得 `AS` 可以省略吗）。对照语法格式就能看出：`expression [ [ AS ] output_name ]` 允许表达式后面直接跟一个名字。只要结果的列数比你预期的少，就检查一下逗号。

**2. 最后一列后面多了逗号。** `SELECT name, price, FROM products;` 会报 `syntax error at or near "FROM"`。格式里的逗号写在 `[, …]` 中，只出现在两项之间。

**3. 用单引号写别名。** 单引号包的是文字，不是名字。`SELECT name AS 'n'` 会报语法错误，要写成 `AS n` 或 `AS "n"`。

**4. 以为列的顺序由表决定。** 结果的列按你写的顺序排列。题目要求“名字在前、价格在后”时，清单就得按这个顺序写。

**5. 计算出来的列忘了起名。** `SELECT price * stock` 的结果列叫 `?column?`。别人（包括以后的你）读结果时不知道它是什么，题目要求列名时也会判错。

**6. 在同一个选择列表里使用刚起的别名。** 见“深入”第一条：报错是 `column "stock_value" does not exist`，明明前面刚定义过。这时要把表达式再写一遍。

## 小结 {#summary}

- `SELECT` 后面是一张用逗号分隔的清单，每一项是一个表达式，对每一行计算一次，成为结果的一列，顺序由你决定。
- 格式是 `SELECT { * | expression [ [ AS ] output_name ] } [, …] FROM table_name`。
- 用 `AS` 给计算列起名，否则它叫 `?column?`；别名不加引号会转成小写，带空格或大写时用双引号。
- 别名只属于结果，同一个选择列表里的其他项不能用它。
- 漏写逗号不会报错，却会把下一列变成别名；结果列数不对时先检查逗号。
