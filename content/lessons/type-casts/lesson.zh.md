## 为什么需要它 {#why}

这一章已经好几次碰到类型的问题：`stock / 3` 因为是整数而丢掉了小数；CASE 的一个分支是文字、另一个是数字时会报错；`'9' > '10'` 按字典顺序比较。

每个值都有类型，运算和比较都要在类型一致时进行。这一篇学习怎样明确地把一个值从一种类型变成另一种，也就是{{term:type-cast}}。

## 核心概念 {#core}

有两种写法，效果完全一样：标准 SQL 的 `CAST(… AS …)`，和 PostgreSQL 的简写 `::`。完整的格式见下面的“语法”小节。

```sql run
SELECT CAST('42' AS integer) + 1 AS standard_form,
       '42'::integer + 1 AS short_form,
       '2024-03-01'::date + 1 AS next_day;
```

**转换不一定成功。** 文字必须真的能读成目标类型，否则报错：`'abc'::integer` 会报 `invalid input syntax for type integer`。

**小数转整数会四舍五入。** `19.99::integer` 是 20，`55.50::integer` 是 56，不是直接截断。

**数据库什么时候会替你转换。** 写在引号里的字面量一开始没有确定的类型，PostgreSQL 会根据上下文决定它是什么，所以 `'2024-07-01' - joined_on` 能直接算出天数，`'3' + 4` 等于 7。这叫{{term:implicit-cast}}。但如果是一列已经确定是 `text` 的值，PostgreSQL 不会自作主张把它变成数字，必须你自己写转换。

## 语法 {#syntax}

```syntax
CAST(expression AS type)
expression::type
type 'text'
```

| 形状 | 说明 | 例子 |
|---|---|---|
| `CAST(expression AS type)` | SQL 标准写法，所有数据库都认识 | `CAST(price AS integer)` |
| `expression::type` | PostgreSQL 的简写，最常用 | `stock::numeric` |
| `type 'text'` | 只能用在单引号里的字面量上，`DATE '2024-07-01'` 就是这种 | `integer '42'` |

`type` 是类型的名字。常用的有：

| 类型 | 用途 |
|---|---|
| `integer`、`bigint` | 整数 |
| `numeric`、`numeric(p, s)` | 精确小数；`p` 是总位数，`s` 是小数位数 |
| `double precision` | 浮点数 |
| `text` | 文字 |
| `date`、`timestamp`、`interval` | 日期、时间戳、时长 |
| `boolean` | 真假值 |

带格式的文字，用这三个函数转换：

```syntax
to_char(value, 'format')
to_number(text, 'format')
to_date(text, 'format')
```

`format` 是格式模板：`9` 代表一位数字，`,` 和 `.` 是千位分隔符和小数点，`FM` 去掉多余的空格；日期部分和讲日期那一课的 `to_char` 模板一样，`DD`、`MM`、`YYYY`。

关于 `::` 要记住一点：它比所有算术运算符都先算，连取相反数也比它晚。对照格式读几个表达式：

- `stock::numeric / 3`：先把 `stock` 转换，再除。
- `(stock / 3)::numeric`：括号让除法先算，再转换结果。
- `-1::text`：先算 `1::text`，再对一段文字取相反数，所以报错。要写成 `(-1)::text`。

## 示例 {#example}

问题：为每笔订单生成一个参考编号，格式是“顾客编号-订单编号”，比如 `1-4`。

1. **确定要拼接的部分。** `customer_id`、一个短横线、`id`。
2. **检查类型。** 两个编号都是整数，短横线是文字。
3. **决定是否需要转换。** `||` 可以直接连接数字和文字，但写成 `::text` 能让意图一目了然，也避免和数字的加减混淆。
4. **拼接并起名。**

```sql run
SELECT id, customer_id, customer_id::text || '-' || id::text AS reference
FROM orders;
```

## 变体 {#variants}

**整数转成精确小数，避免整数除法。** 把 `stock` 转成 `numeric` 再除：

```sql run
SELECT name, stock, round(stock::numeric / 3, 2) AS per_share
FROM products;
```

**价格取整到美元。**

```sql run
SELECT name, price, CAST(price AS integer) AS whole_dollars
FROM products;
```

**转换成指定精度的 `numeric`。** `numeric(p, s)` 规定了小数位数，转换时会四舍五入到这一位：

```sql run
SELECT name, price,
       price::numeric(6, 1) AS one_place,
       CAST(price AS numeric(6, 0)) AS whole
FROM products;
```

SQL Pocket Guide 的 19.99 变成 20.0 和 20。效果和 `round` 相似，区别是结果的类型本身就带着精度。

**查看一个值的类型：`pg_typeof`。** 拿不准一个表达式是什么类型时，问数据库：

```sql run
SELECT pg_typeof(42) AS a,
       pg_typeof(42.5) AS b,
       pg_typeof(price) AS c,
       pg_typeof(stock / 3) AS d,
       pg_typeof(stock::numeric / 3) AS e
FROM products
LIMIT 1;
```

`stock / 3` 是 `integer`，这就是整数除法丢掉小数的原因；转换之后是 `numeric`。调试类型问题时，这个函数非常有用。

**带格式的文字和数字、日期互相转换。** `to_char`、`to_number`、`to_date` 用一个格式模板描述文字的样子：

```sql run
SELECT to_char(1234.5, 'FM9,999.00') AS formatted,
       to_number('1,234.50', '9,999.99') AS parsed_number,
       to_date('05/03/2024', 'DD/MM/YYYY') AS parsed_date;
```

格式模板让含糊的 `05/03/2024` 有了确定的含义：这里是 3 月 5 日。

## 深入 {#deeper}

**转换的位置很重要。** `(stock / 3)::numeric` 是先做整数除法、再把结果转成小数，小数部分早已丢失：

```sql run
SELECT (25 / 3)::numeric AS too_late, 25::numeric / 3 AS in_time;
```

`::` 的优先级很高，`25::numeric / 3` 是先转换 25、再除。要把转换放在运算之前。

**一步转不过去时，分两步。** `'42.0'::integer` 会报错，因为 `42.0` 不是整数的写法；先转成 `numeric` 再转成整数就可以：`'42.0'::numeric::integer` 得到 42。

**PostgreSQL 比别的数据库严格。** MySQL 会把 `'abc' + 1` 悄悄算成 1，把文字里认不出的部分当成 0。PostgreSQL 宁可报错，也不猜测。这在一开始显得麻烦，但能尽早暴露数据里的问题。

**类型名的写法因数据库而异。** `::` 只有 PostgreSQL 认识；`CAST` 是标准，到处都能用。类型名本身也有差别：PostgreSQL 的 `text` 在 SQL Server 里通常写 `varchar(max)`，`double precision` 在 MySQL 里写 `double`。写需要在多种数据库里运行的 SQL 时，用 `CAST` 和标准类型名。

**布尔值。** `true::integer` 是 1；`'yes'::boolean`、`'t'::boolean`、`1::boolean` 都是 true。

## 常见错误 {#mistakes}

**1. 在错误的位置转换。** 见“深入”：`round((stock / 3)::numeric, 2)` 和不转换一样，得到 8.00。转换要包在参与除法的数上。

**2. 把带小数点的文字直接转成整数。**

```sql run error
SELECT '42.0'::integer;
```

先转成 `numeric`。

**3. 指望 PostgreSQL 自动把文字列当数字。** 一列 `text` 和数字做加法会报 `operator does not exist`。数据本应是数字时，最好把它存成数字类型；临时处理时显式转换。

**4. 用文字比较数字。** 第 1 章的 `'9' > '10'` 是 true。比较前先转换成数字，或者从一开始就存成数字。

**5. `CAST` 里用逗号。** `CAST(price, integer)` 报 `syntax error at or near ","`。`CAST` 的格式是 `CAST(expression AS type)`，中间是关键字 `AS`，和讲日期那一课的 `extract(… FROM …)` 一样，是标准 SQL 的特殊写法。

**6. 以为小数转整数是截断。** `19.99::integer` 是 20。需要截断时用 `trunc(19.99)`。

## 小结 {#summary}

- `CAST(x AS 类型)` 是标准写法，`x::类型` 是 PostgreSQL 的简写。
- 转换会检查内容，读不出来就报错；小数转整数会四舍五入。
- 引号里的字面量会按上下文自动确定类型；已有类型的列不会被悄悄转换。
- 转换要放在运算之前，`stock::numeric / 3` 而不是 `(stock / 3)::numeric`。
- `to_char`、`to_number`、`to_date` 用格式模板处理带格式的文字。
