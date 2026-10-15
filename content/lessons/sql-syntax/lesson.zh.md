## 为什么需要它 {#why}

下面两条查询只差一对引号。第一条列出加拿大的顾客：

```sql run
SELECT name, city
FROM customers
WHERE country = 'Canada';
```

第二条把单引号换成了双引号，结果报错：

```sql run error
SELECT name, city
FROM customers
WHERE country = "Canada";
```

报错说 `column "Canada" does not exist`。数据库没有把 `"Canada"` 当成一个国家名，而是当成了一个{{term:column}}名，去表里找一列叫 Canada 的列。

SQL 读起来像英语，但它是一门书写规则很严格的语言：哪个词是命令，哪个词是名字，哪个词是值，全靠写法来区分。这一篇把这些规则一次讲清楚，后面每一课都要用到。你还会学会读“语法”格式，从这一课开始，每一课都用它写出所学语句的结构。

## 核心概念 {#core}

### 语句与子句

一条 SQL {{term:statement}}是交给数据库的一个完整命令，以分号 `;` 结束。查询语句由几个{{term:clause}}组成，每个子句都以一个固定的词开头：

- `SELECT` 子句：要哪些列。
- `FROM` 子句：从哪张{{term:table}}取。
- `WHERE` 子句：只要哪些{{term:row}}。

子句的先后顺序是固定的，不能随意调换。下一篇会给出全部子句的顺序。

### 五种词法单元

数据库读一条语句时，先把它切成一个个{{term:token}}，再检查这些单元的组合是否合乎{{term:syntax}}。单元只有五种：

| 种类 | 例子 | 是什么 |
|---|---|---|
| {{term:keyword}} | `SELECT`、`FROM`、`WHERE`、`AS`、`NULL` | SQL 预先规定了含义的词 |
| {{term:identifier}} | `customers`、`country`、`stock_value` | 名字：表名、列名、别名 |
| {{term:literal}} | `'Canada'`、`42`、`3.5` | 写在语句里的固定值 |
| {{term:operator}} | `=`、`<`、`+`、`*`、`\|\|` | 计算或比较 |
| 特殊符号 | `,`、`(`、`)`、`.`、`;` | 分隔、分组、结束 |

读一条陌生的 SQL 时，先给每个词归类。归对了类，语句的意思也就清楚了一大半。`*` 是个特例：在选择列表里单独出现时表示“所有列”，在两个值之间时表示乘法。

### 关键字和名字不分大小写

`SELECT`、`select` 和 `Select` 是同一个关键字。不加引号的名字也一样：PostgreSQL 会先把它们统一转成小写，再去查找。所以 `CUSTOMERS`、`Customers` 和 `customers` 指的是同一张表。

本课程的写法是关键字大写、名字小写。这只是为了好读，数据库并不在乎。

### 值的写法

{{Term:literal}}的写法由它的类型决定：

- **文字**（{{term:string}}）写在单引号里：`'Canada'`。
- **数字**直接写，不加引号：`42`、`3.5`。
- **日期**写成单引号里的“年-月-日”：`'2024-01-01'`。
- **`NULL`、`TRUE`、`FALSE`** 是关键字，不加引号。

**双引号不是给值用的。** 双引号包住的是一个名字，叫{{term:quoted-identifier}}。这就是开头那条查询报错的原因：`"Canada"` 是一个名字，数据库于是去找叫 Canada 的列。

**值区分大小写。** 不分大小写的只有关键字和名字。`'Canada'` 和 `'canada'` 是两个不同的字符串。

### 空白与注释

词与词之间，用一个空格、几个空格还是换行，效果都一样。同一条语句写成一行还是分成十行，意思完全相同。本课程的习惯是每个子句另起一行。

{{Term:comment}}是写给人看的说明，数据库会跳过它：

- `--` 从这里到行尾都是注释。
- `/* … */` 之间的内容是注释，可以跨好几行。

## 语法 {#syntax}

从这一课开始，每一课都有一个“语法”小节，用固定的格式写出这一课所学语句的结构。格式和 PostgreSQL 官方手册一致，学会以后你也能直接读手册。

这是最简单的查询的格式：

```syntax
SELECT { * | expression } [, …]
FROM table_name
```

格式里的写法这样读：

| 写法 | 意思 | 本例中 |
|---|---|---|
| 大写的词 | 关键字，照原样写 | `SELECT`、`FROM` |
| 小写斜体的词 | {{term:placeholder}}，换成你自己的内容 | `table_name` 换成 `products` |
| 紧跟着括号的小写词 | {{Term:function}}名，照原样写（第 2 章开始出现） | `round(number)` 里的 `round` |
| `[ … ]` | 方括号里的部分可以不写 | `[, …]` 可以没有 |
| `{ a \| b }` | 花括号里用竖线隔开的几项，选一项 | 写 `*`，或者写一个 `expression` |
| `[, …]` | 前一项可以重复多次，用逗号隔开 | 选择列表里可以写好几项 |
| 其他符号 | 括号、逗号、`*` 等照原样写 | `*` |

方括号、花括号、竖线和省略号只是说明格式的记号，它们本身不能写进 SQL。

所以上面的格式是说：先写 `SELECT`，后面跟一项或用逗号隔开的多项，每一项要么是 `*`，要么是一个{{term:expression}}（比如一个列名）；然后写 `FROM` 和一个表名。下面这条查询符合这个格式，`expression` 换成了两个列名，`table_name` 换成了 `products`：

```sql run
SELECT name, price
FROM products;
```

每一课的语法小节都会附一张表，逐个说明格式里的占位符可以填什么、能不能省略。

## 示例 {#example}

问题：查出顾客 Liam O'Brien 的邮箱和城市。

1. **搭骨架。** 要几列，从一张表取，只要一行，所以是 `SELECT … FROM … WHERE …`，每个子句占一行。
2. **写名字。** 列 `email`、`city`、`name` 和表 `customers` 都是标识符，直接写，不加引号。
3. **写值。** 顾客的名字是文字，要放进单引号。麻烦在于名字里有一个撇号 `'`，它会被当成字符串的结尾。规则是：在单引号字符串里，用两个连续的单引号 `''` 表示一个单引号字符。所以写成 `'Liam O''Brien'`。
4. **加注释，以分号结束。** 注释说明这条查询是干什么的。

```sql run
-- contact details of one customer
SELECT email, city
FROM customers
WHERE name = 'Liam O''Brien';
```

结果只有一行：邮箱是 liam.obrien@example.com，城市是 NULL，因为数据里没有记录他所在的城市。

把这条语句拆成词法单元：

| 单元 | 种类 |
|---|---|
| `-- contact details of one customer` | 注释，数据库跳过 |
| `SELECT`、`FROM`、`WHERE` | 关键字，各自开始一个子句 |
| `email`、`city`、`customers`、`name` | 标识符 |
| `,` | 特殊符号，分隔选择列表里的两项 |
| `=` | 运算符，比较两边是否相等 |
| `'Liam O''Brien'` | 字面量，它的值是 Liam O'Brien |
| `;` | 特殊符号，语句结束 |

## 变体 {#variants}

**大小写和换行不影响意思。** 下面这条和示例里的查询完全相同。但单引号里的值必须保持原样，因为值区分大小写：

```sql run
select EMAIL, City from CUSTOMERS where NAME = 'Liam O''Brien';
```

**各种字面量。** 选择列表里可以直接写值。运行下面的查询，看看每种值的样子：

```sql run
SELECT 'Canada' AS text_value,
       42 AS integer_value,
       3.5 AS decimal_value,
       1e3 AS scientific_value,
       DATE '2024-05-01' AS date_value,
       TRUE AS boolean_value,
       NULL AS no_value;
```

- `AS` 后面是结果列的名字，下一课会详细讲。
- `1e3` 是科学计数法，表示 1 × 10³，也就是 1000。
- `DATE '2024-05-01'` 在字符串前面加上类型名，明确说明这是一个日期。第 2 章讲类型转换时再展开。
- 这条查询没有 `FROM`：它只计算几个值，不读任何表。PostgreSQL 允许这样写（见“深入”）。

**带引号的名字。** 双引号让名字可以保留大写、包含空格。最常见的用法是给结果列起一个便于阅读的名字：

```sql run
SELECT name AS "Customer name", joined_on AS "Joined"
FROM customers;
```

加了双引号，大小写就必须完全一致。表里的列叫 `name`，全是小写，写成 `"Name"` 就找不到：

```sql run error
SELECT "Name"
FROM customers;
```

PostgreSQL 在报错下面还附了一条 HINT，猜你想写的是 `customers.name`。遇到报错时，这类提示值得读一读。

**用点号写出列属于哪张表。** `customers.name` 的意思是 `customers` 表的 `name` 列。只有一张表时可写可不写；到第 4 章同时用到几张表时，就离不开它了：

```sql run
SELECT customers.name, customers.country
FROM customers;
```

**多条语句与多行注释。** 一次可以运行几条语句，用分号隔开。本课程的运行框只显示最后一条语句的结果。只有一条语句时，结尾的分号可以省略，不过最好养成写上的习惯。

```sql run
/*
  Two statements, run one after the other.
  Only the result of the last one is shown.
*/
SELECT name FROM products WHERE id = 1;
SELECT name FROM customers WHERE id = 1;  -- Lin Wei
```

## 深入 {#deeper}

**PostgreSQL 把名字转成小写，标准 SQL 转成大写。** SQL 标准规定，不加引号的名字统一转成大写，Oracle 就是这样做的；PostgreSQL 则转成小写。平时看不出差别。但如果建表时用双引号写了 `"Products"`，以后每次引用它都得写 `"Products"`，少了引号就找不到。所以名字最好一律用小写字母加下划线，比如 `stock_value`，这样永远不需要引号。

**关键字不能直接当名字。** `order`、`group`、`user` 这类词是关键字。假如有一张表叫 order，就得写成 `"order"`，否则会报{{term:syntax-error}}：

```sql run error
SELECT *
FROM order;
```

shop 的订单表叫 `orders`，所以不会遇到这个问题。自己建表时，也应该避开关键字。

**没有 `FROM` 的查询。** PostgreSQL、MySQL 和 SQLite 都允许 `SELECT 2 + 3` 这样不读表的查询。标准 SQL 要求必须有 `FROM`，Oracle 为此提供了一张只有一行的表，名叫 `dual`。

**换一个数据库，引号的规则会变。**

- MySQL 默认把双引号也当作字符串的引号，名字用反引号括起来，写作 `` `name` ``。在 MySQL 里能运行的 `"Canada"`，到了 PostgreSQL 就会报错。
- SQLite 为了兼容旧程序，在找不到同名列时，会把双引号里的内容当成字符串。拼错的列名因此可能悄悄变成一段文字，不报任何错。
- SQL Server 用方括号括名字：`[name]`。
- 用单引号写字符串，在所有数据库里都通用。所以无论用哪个数据库，值都用单引号。

**注释在其他数据库里。** MySQL 要求 `--` 后面紧跟一个空格才算注释，另外也接受 `#`。PostgreSQL 的 `/* */` 注释可以嵌套，有些数据库不行。

**另一种写撇号的办法。** PostgreSQL 还支持用 `$$` 代替单引号把字符串括起来，比如 `$$Liam O'Brien$$`，里面的撇号不用写两遍。这种写法主要用在写函数的时候，查询里用 `''` 就够了。

## 常见错误 {#mistakes}

**1. 用双引号写文字值。** 开头那条查询就是这个错误。双引号包的是名字，所以报错是“某列不存在”，而不是“值不对”。在 MySQL 里用惯了双引号的人特别容易犯。

**2. 文字值忘了加引号。**

```sql run error
SELECT name
FROM customers
WHERE country = Canada;
```

注意报错里的列名变成了小写的 `canada`：数据库把它当成不加引号的名字，按规则转成小写，再去找这一列。如果报错说某列不存在，而那个“列”其实是你想写的值，那就是少了单引号。

**3. 字符串里的撇号只写了一个。**

```sql run error
SELECT email
FROM customers
WHERE name = 'Liam O'Brien';
```

字符串在 `O` 后面就结束了，剩下的 `Brien` 成了一个多出来的词，所以报错指向它。修正的办法是把撇号写成两个：`'Liam O''Brien'`。

**4. 用了中文标点。** 中文输入法打出的全角逗号 `，`、中文引号 `‘’` 和 `“”`，看起来和英文标点很像，数据库却不认识。PostgreSQL 会把它们当成名字的一部分：

```sql run error
SELECT name
FROM customers
WHERE country = ‘Canada’;
```

报错是 `column "‘canada’" does not exist`。全角逗号也一样：`SELECT name，price` 会被读成一个叫 `name，price` 的列。写 SQL 时请切换到英文输入法；从聊天软件或文档里复制来的 SQL，也要检查一下引号。

**5. 拼错关键字，又看错了报错位置。**

```sql run error
SELECT name FORM products;
```

错的是 `FORM`，报错却指向 `products`。原因是数据库先把 `FORM` 当成了 `name` 的别名（下一课会讲到，`AS` 可以省略），读到 `products` 时才发现多了一个词。`syntax error at or near "…"` 指的是数据库发现问题的地方，真正的错误往往在它前面。

**6. 以为值也不分大小写。**

```sql run
SELECT name
FROM customers
WHERE country = 'canada';
```

查询正常运行，结果却是 0 行，因为数据里存的是 `'Canada'`。这个错误不会报错，所以更难发现。关键字和名字不分大小写，不代表值也不分。

**7. 把其他编程语言的写法带进来。** 比较是否相等，SQL 只用一个等号 `=`。写成 `price == 10` 会报 `operator does not exist`；`&&`、`!` 之类的写法在 SQL 里也有不同的意思，或者根本没有。后面讲 `WHERE` 时会学到 SQL 自己的 `AND`、`OR`、`NOT`。

## 小结 {#summary}

- 一条语句由几个子句组成，以分号结束；数据库先把它切成关键字、名字、值、运算符和特殊符号。
- 关键字和不加引号的名字不分大小写（PostgreSQL 统一转成小写），值区分大小写。
- 文字值用单引号，字符串里的撇号写成两个；双引号包的是名字，不是值。
- 读语法格式时，大写是关键字，小写斜体是占位符，`[ ]` 可省略，`{ | }` 选一项，`[, …]` 可重复。
- 报错说某列不存在，而那个“列”其实是你想写的值，多半是引号写错了。
