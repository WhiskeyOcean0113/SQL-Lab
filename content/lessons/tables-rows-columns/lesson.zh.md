## 为什么需要它 {#why}

这门课的所有练习都在一家小网店的数据上进行，数据集叫 shop。在写任何筛选、排序或连接之前，你得先知道它里面装着什么：卖哪些商品？每件商品记录了哪些信息？

数据库把这些信息存在一张张{{term:table}}里。这一篇只做一件事：学会看懂一张表。

## 核心概念 {#core}

一张表由{{term:row|行}}和{{term:column|列}}组成：

- **每一行是一条{{term:record}}**，描述一个具体的东西。`products` 表的每一行是一件商品。
- **每一列是一种属性**，有自己的名字和{{term:data-type}}。`price` 这一列存的全是价格，类型是 `numeric`；`name` 这一列存的全是文字，类型是 `text`。
- **同一列里的所有值类型都相同。** 你不可能在 `price` 里存进一段文字。

所有表的名字、列名和类型合在一起，叫作数据库的{{term:schema}}，相当于这份数据的说明书。

要看一张表的全部内容，用这条{{term:query}}：

```sql run
SELECT * FROM categories;
```

`SELECT *` 的意思是“所有列”，`FROM categories` 指明从哪张表取。结果本身也是一张表，叫作{{term:result-set}}。

最后一个关键点：**表里的行没有固定的先后顺序。** 关系数据库把一张表看作行的集合，你看到的顺序只是数据库这一次恰好给出的顺序，下次可能不同。想要确定的顺序，必须明确要求（第 1 章会学 `ORDER BY`）。

## 示例 {#example}

问题：`products` 表里有哪些列，各是什么类型，一共有多少件商品？

按步骤来：

1. **看全表。** 运行 `SELECT * FROM products;`，数一数结果有多少行。
2. **认出每一行代表什么。** 每一行是一件商品，所以行数就是商品数。
3. **对照每一列的类型。** 每一列的类型是建表时规定好的，下面的表格列出了 `products` 的六列。

```sql run
SELECT * FROM products;
```

一共 16 行，也就是 16 件商品。每一列存什么、是什么类型：

| 列 | 类型 | 含义 |
|---|---|---|
| `id` | integer | 商品编号 |
| `name` | text | 商品名 |
| `category_id` | integer | 所属分类的编号 |
| `price` | numeric | 价格（美元，保留两位小数） |
| `stock` | integer | 库存数量 |
| `launched_on` | date | 上架日期 |

对照结果看：`price` 一列全是带两位小数的数，`launched_on` 一列全是日期。第 8 章会学怎样自己建表、规定类型，以及怎样用查询查出一张表的结构。

## 变体 {#variants}

**shop 的全部五张表。** 把 `FROM` 后面的表名换一换，就能逐一看遍它们：

| 表 | 每一行代表 | 行数 |
|---|---|---|
| `categories` | 一个商品分类 | 5 |
| `customers` | 一位顾客 | 12 |
| `products` | 一件商品 | 16 |
| `orders` | 一笔订单 | 24 |
| `order_items` | 一笔订单里的一种商品，以及买了几件 | 42 |

`order_items` 最容易误读：它的一行不是一笔订单，而是“某笔订单里的某种商品”。订单 3 买了三种商品，所以在 `order_items` 里占三行。

**名字的大小写。** 不加引号的表名和列名在 PostgreSQL 里不分大小写，`SELECT * FROM Products;` 和 `SELECT * FROM products;` 完全一样，因为数据库会先把名字转成小写。但加了双引号就区分大小写了，`"Products"` 指的是另一张（并不存在的）表。

**只看几列。** 把 `*` 换成用逗号隔开的列名，结果就只有这几列，顺序也按你写的来：

```sql run
SELECT name, price FROM products;
```

行数不变，还是 16 行，只是每一行只剩两列。第 1 章第一篇会细讲这种写法。

## 深入 {#deeper}

**{{term:null}} 不是 0，也不是空字符串。** 有些格子里显示的是 NULL，意思是“这里没有值”或“不知道”：

```sql run
SELECT * FROM customers;
```

Liam O'Brien 和 Lucas Silva 的 `city` 是 NULL，这表示城市未知，而不是城市名叫“空”。NULL 在比较和计算时有一套特殊的规则，第 1 章会专门用一篇来讲。

**表不是电子表格。** 如果你用过 Excel，很容易把表想成一张格子纸。它们有几个根本的不同：

- 表没有“第 3 行”这种位置，行没有固定顺序。
- 每一列只能存一种类型的值，不能这一格是数字、下一格是文字。
- 每个格子只存一个值，不能合并单元格，也不能存公式。需要计算时，写在查询里。

**常见的列类型。** shop 只用到了五种类型：

| 类型 | 存什么 | shop 里的例子 |
|---|---|---|
| `integer` | 整数 | `id`、`stock`、`quantity` |
| `numeric(8, 2)` | 精确的小数：最多 8 位数字，其中 2 位在小数点后 | `price`、`unit_price` |
| `text` | 任意长度的文字 | `name`、`city`、`status` |
| `date` | 日期，没有时间 | `joined_on`、`launched_on` |
| `timestamp` | 日期加时间 | `ordered_at`、`shipped_at` |

`timestamp` 只记日期和时间，不带{{term:time-zone}}信息，第 2 章讲日期时会再遇到。

**哪些列可以是 NULL，也是建表时规定的。** 在 `customers` 里，`id`、`name`、`country`、`joined_on` 必须有值，每位顾客都有名字和国家；`email`、`city`、`referred_by` 可以空着。运行上面的 `SELECT * FROM customers;`，NULL 只会出现在后三列里。

**列名的约定。** shop 的表名用复数（`orders`），列名用小写加下划线（`customer_id`），这种写法叫 snake_case。它不是强制规定，但很常见，而且不用加引号。

## 常见错误 {#mistakes}

**1. 表名写成单数。** 表叫 `customers`，写成 `customer` 会报错：

```sql run error
SELECT * FROM customer;
```

`relation "customer" does not exist` 里的 relation 就是表。看到这个错误，先回去核对表名的拼写和单复数。

**2. 把行的顺序当真。** 结果看起来按 `id` 排好了，但这是巧合，不是保证。今天的第一行，换一种查询方式、数据多了以后，可能就不再是第一行。

**3. 把表名和列名混在一起。** `name` 是 `customers` 的一列，不是一张表，写 `SELECT * FROM name;` 会得到同样的 `does not exist` 错误。写查询之前，先想清楚：你要的东西是一张表，还是某张表里的一列？

**4. 用双引号包住表名。** `SELECT * FROM "Products";` 会报错，因为加引号后名字区分大小写，而真正的表名是小写的 `products`。在 SQL 里，双引号用来包名字，单引号才用来包文字，第 1 章还会再遇到这一点。

**5. 把 NULL 当成 0 或空字符串。** 一位顾客的 `city` 是 NULL，不代表 ta 住在一个叫 “” 的城市。NULL 是“缺少值”，它和任何值都不相等。

## 小结 {#summary}

- 表由行和列组成：每一行是一条记录，每一列是一种属性，同一列的值类型相同。
- `SELECT * FROM 表名;` 查看一张表的全部内容，结果本身也是一张表。
- 表里的行没有固定顺序，需要顺序时必须明确要求。
- NULL 表示缺少值，既不是 0，也不是空字符串。
- 不加引号的名字不分大小写；表名拼错会得到 `does not exist` 错误。
