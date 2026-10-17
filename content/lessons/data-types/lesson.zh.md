## 为什么需要它 {#why}

shop 想让顾客给商品打分、写评论。现有的五张表里没有地方放这些信息，需要一张新表 `reviews`：评的是哪件商品，几分，评论内容，有没有核实过是真实买家，什么时候写的。

到目前为止，表都是现成的。这一章开始自己设计表。第一个决定，就是每一列存什么类型的值。

## 核心概念 {#core}

### 建一张表

`CREATE TABLE` 给出表名，以及每一列的名字和{{term:data-type}}：

```sql run
CREATE TABLE reviews (
  id          integer GENERATED ALWAYS AS IDENTITY,
  product_id  integer,
  rating      smallint,
  comment     text,
  verified    boolean DEFAULT false,
  reviewed_at timestamptz DEFAULT now()
);

INSERT INTO reviews (product_id, rating, comment)
VALUES (3, 5, 'Short and to the point.'),
       (5, 4, 'Loud but lovely.');

SELECT id, product_id, rating, comment, verified FROM reviews;
```

和前面的修改一样，SQL Lab 在运行结束后会撤销这张表，下一次运行时它就不存在了。

### 类型就是规则

一列的类型决定了三件事：能存什么值，值怎样比较和排序，能做哪些运算。同样是“10”和“9”，作为文字比较和作为数字比较，结果相反：

```sql run
SELECT '10' < '9' AS as_text, 10 < 9 AS as_number;
```

文字是一个字符一个字符地比，“1”排在“9”前面。所以数量、金额一定要用数值类型，日期一定要用日期类型，不要图省事都存成 `text`。

### 常用的类型

| 类别 | 类型 | 存什么 | 注意 |
|---|---|---|---|
| 整数 | `smallint`、`integer`、`bigint` | 不带小数的数 | 范围依次约为 ±3 万、±21 亿、±922 亿亿；超出会报错 |
| 精确小数 | `numeric(p, s)` | 金额这类不能有误差的数 | 共 p 位，其中 s 位在小数点后；多出的小数位四舍五入 |
| {{Term:floating-point}} | `real`、`double precision` | 科学计算、测量值 | 有微小误差，不要用来存钱 |
| 文字 | `text`、`varchar(n)` | 任意文字 | `varchar(n)` 最多 n 个字符，超出会报错 |
| 布尔 | `boolean` | 是或否 | 值是 `true`、`false` 或 NULL |
| 日期时间 | `date`、`timestamp`、`timestamptz`、`interval` | 日期；日期加时间；带{{term:time-zone}}的时刻；一段时长 | 见“深入” |

### 自动编号和默认值

- `GENERATED ALWAYS AS IDENTITY` 把 `id` 变成{{term:identity-column}}：插入时不用写它，数据库按 1、2、3……自动编号。第 7 章提到的“用 `max(id) + 1` 算编号”的问题，就这样解决了。
- `DEFAULT 表达式` 给一列规定{{term:default-value}}：插入时没写这一列，就用这个值。上面的 `verified` 默认是 `false`，`reviewed_at` 默认是插入那一刻的时间。

## 语法 {#syntax}

```syntax
CREATE TABLE table_name (
    column_name data_type [ DEFAULT expression ] [ GENERATED { ALWAYS | BY DEFAULT } AS IDENTITY ] [, …]
)
```

```syntax
ALTER TABLE table_name ADD COLUMN column_name data_type [ DEFAULT expression ]
DROP TABLE [ IF EXISTS ] table_name
```

| 部分 | 填什么 | 规则 |
|---|---|---|
| `table_name` | 新表的名字 | 不能和已有的表重名 |
| `column_name data_type` | 一列的名字和类型 | 必须有；多列用逗号隔开，最后一列后面没有逗号 |
| `DEFAULT expression` | 没写这一列时用的值 | 可以省略；省略时默认值是 NULL |
| `GENERATED … AS IDENTITY` | 让数据库自动编号 | 可以省略；只能用于整数列；`ALWAYS` 不允许手写编号，`BY DEFAULT` 允许 |
| `ALTER TABLE … ADD COLUMN` | 给已有的表加一列 | 已有的行在这一列上取默认值 |
| `DROP TABLE` | 删除整张表，连同所有数据 | `IF EXISTS`：表不存在时不报错 |

下一篇会在列定义的后面加上约束，比如 `PRIMARY KEY` 和 `NOT NULL`。

对照格式读核心概念里的 `CREATE TABLE`：

- `id integer GENERATED ALWAYS AS IDENTITY`：`column_name data_type` 加上自动编号。
- `rating smallint`：只有名字和类型。
- `verified boolean DEFAULT false`：加上默认值。

## 示例 {#example}

问题：为商品评论建一张表 `reviews`，并插入两条评论。

1. **列出要存的信息。** 编号、商品、分数、评论内容、是否核实、写评论的时间。
2. **为每一列选类型。**
   - 编号：`integer`，让数据库自动生成。
   - 商品：`integer`，和 `products.id` 的类型一致，以后才能连接。
   - 分数：1 到 5 分，`smallint` 足够。
   - 评论：长短不定，`text`。
   - 是否核实：`boolean`，默认 `false`。
   - 时间：`timestamptz`，默认是现在。
3. **写出 `CREATE TABLE`。** 列定义之间用逗号，最后一列后面不加。
4. **插入两行，不写有默认值的列，看看数据库填了什么。**

```sql run
CREATE TABLE reviews (
  id          integer GENERATED ALWAYS AS IDENTITY,
  product_id  integer,
  rating      smallint,
  comment     text,
  verified    boolean DEFAULT false,
  reviewed_at timestamptz DEFAULT now()
);

INSERT INTO reviews (product_id, rating, comment)
VALUES (3, 5, 'Short and to the point.'),
       (5, 4, 'Loud but lovely.')
RETURNING *;
```

`id` 是 1 和 2，`verified` 是 `false`，`reviewed_at` 是运行这一刻的时间（以 UTC 显示）。这张表还很宽松：分数可以填 0 或 99，商品编号可以指向不存在的商品。下一篇用约束把这些漏洞堵上。

## 变体 {#variants}

**字数上限。** `varchar(n)` 超过上限会报错，而不是悄悄截断：

```sql run error
CREATE TABLE labels (code varchar(5));
INSERT INTO labels VALUES ('Garden Tools');
```

`value too long for type character varying(5)`。

**精度和范围。** `numeric(5, 2)` 最多 999.99。小数位多了会四舍五入，整数位多了会报错：

```sql run
CREATE TABLE prices (amount numeric(5, 2));
INSERT INTO prices VALUES (999.994), (12.345)
RETURNING amount;
```

插入 `1234.5` 则会报 `numeric field overflow`。

**给已有的表加一列。** 给商品加上重量，已有的 16 行在新列上都是 NULL：

```sql run
ALTER TABLE products ADD COLUMN weight_kg numeric(6, 2);
SELECT id, name, weight_kg FROM products LIMIT 3;
```

加列时写上 `DEFAULT`，已有的行会取这个默认值。

**查看一张表的结构。** 每个 PostgreSQL 数据库都自带一组描述自身结构的表，放在 `information_schema` 里。其中 `information_schema.columns` 的每一行描述某张表的一列：`table_name` 是表名，`column_name` 是列名，`data_type` 是类型，`is_nullable` 说明能不能为空，`ordinal_position` 是这一列在表里排第几。按 `ordinal_position` 排序，列的顺序就和建表时一样：

```sql run
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'products'
ORDER BY ordinal_position;
```

`price` 的类型显示为 `numeric`，括号里的位数要看另外两列：`numeric_precision` 和 `numeric_scale`，也就是 `numeric(p, s)` 里的 p 和 s。标识列的 `is_identity` 是 `YES`。这一篇的部分练习就用这样的查询检查你建的表。

**日期加时长。** `interval` 表示一段时长，可以和日期、时间相加：

```sql run
SELECT DATE '2024-07-01' + INTERVAL '3 days' AS due;
```

## 深入 {#deeper}

**浮点数不精确。** `double precision` 用二进制近似地存小数，`0.1 + 0.2` 不等于 `0.3`：

```sql run
SELECT 0.1::float8 + 0.2::float8 AS float_sum,
       0.1 + 0.2 AS numeric_sum,
       0.1::float8 + 0.2::float8 = 0.3 AS float_equal;
```

`numeric` 没有这个问题，只是计算慢一些。存钱、存数量，用 `numeric` 或整数；只有科学测量这类本来就带误差的值，才用浮点数。

**`timestamp` 还是 `timestamptz`？** `timestamp` 只记“墙上的钟显示几点”，不知道是哪个时区。`timestamptz` 记的是一个确定的时刻，输入时按给出的时区换算，显示时换成当前会话的时区（SQL Lab 用 UTC）：

```sql run
SELECT TIMESTAMPTZ '2024-07-01 10:00:00+08' AS beijing_ten_am;
```

北京时间上午 10 点，显示成 UTC 的 02:00。用户分布在不同时区时，用 `timestamptz`。shop 的 `ordered_at` 用的是 `timestamp`，并约定都是 UTC。

**`text` 还是 `varchar(n)`？** 在 PostgreSQL 里两者存储和速度完全一样。只有确实需要上限时才写 `varchar(n)`，比如国家代码。`char(n)` 会用空格补足长度，几乎用不到。其他数据库的取舍可能不同，比如 MySQL 的 `TEXT` 有一些限制。

**`ALWAYS` 和 `BY DEFAULT`。** `GENERATED BY DEFAULT AS IDENTITY` 允许手写编号，但数据库的计数器不会因此跳过：手写了 10 之后，自动编号还是从 1 开始，迟早撞上 10。所以除非要导入已有编号的数据，用 `ALWAYS`。旧的 PostgreSQL 教程里常见的 `serial` 是同一件事的老写法。

**建表也能回滚。** 第 7 章的事务不只管数据。在 PostgreSQL 里，`CREATE TABLE` 这类修改表结构的语句也在事务之内：

```sql run error
BEGIN;
CREATE TABLE notes (id integer, body text);
INSERT INTO notes VALUES (1, 'hello');
ROLLBACK;
SELECT * FROM notes;
```

`relation "notes" does not exist`：建表连同里面的数据一起被撤销了。MySQL 和 Oracle 做不到这一点，它们遇到建表语句会自动提交之前的修改。

**其他类型。** PostgreSQL 还有 `uuid`（全局唯一的编号）、`jsonb`（JSON 文档）、数组、范围类型等。它们各有用处，但一张表的大部分列，用上面这几种就够了。

## 常见错误 {#mistakes}

**1. 把数字存成文字。** 存成 `text` 的数量按字符排序，“10”排在“9”前面；求和要先转换类型；还可能混进“十二”这样的值。数量、金额、编号都用数值类型。

**2. 用浮点数存钱。** `double precision` 存价格，加总之后会出现 0.30000000000000004 这样的尾巴，和账对不上。用 `numeric(p, 2)`。

**3. 给 `ALWAYS` 标识列手写编号。**

```sql run error
CREATE TABLE tags (id integer GENERATED ALWAYS AS IDENTITY, name text);
INSERT INTO tags (id, name) VALUES (1, 'sale');
```

`cannot insert a non-DEFAULT value into column "id"`。插入时不写 `id`，让数据库编号。

**4. 整数类型选小了。** `smallint` 最大 32767，插入 40000 会报 `smallint out of range`。两个 `integer` 相加超过约 21 亿也会溢出。拿不准时用 `integer`；可能很大的计数用 `bigint`。

**5. 日期写成有歧义的格式。** `'01/02/2024'` 是 1 月 2 日还是 2 月 1 日？取决于数据库的设置，SQL Lab 里干脆报错 `date/time field value out of range`。总是用 ISO 格式 `'2024-02-01'`。

**6. 列定义末尾多了一个逗号。** `CREATE TABLE t (a integer, b text,)` 会报 `syntax error at or near ")"`。逗号用来分隔列，最后一列后面没有。

## 小结 {#summary}

- `CREATE TABLE 表名 (列名 类型, …)` 建表；类型决定能存什么值、怎样比较、能做什么运算。
- 整数用 `integer` 或 `bigint`，钱用 `numeric(p, s)`，文字用 `text`，是否用 `boolean`，时刻用 `timestamptz`。
- 浮点数有误差，不要用来存钱；数字和日期不要存成文字。
- `GENERATED ALWAYS AS IDENTITY` 自动编号，`DEFAULT` 规定没写时的值。
- `ALTER TABLE … ADD COLUMN` 加列，`DROP TABLE` 删表。
