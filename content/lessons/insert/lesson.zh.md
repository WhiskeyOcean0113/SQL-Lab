## 为什么需要它 {#why}

一位新顾客 Olivia Brown 今天在悉尼注册了。到目前为止，这门课的每一条语句都只是读数据，没有一条能把这位顾客写进 `customers`。

从这一章开始，我们要修改数据。和前面一样，SQL Lab 每次运行结束都会撤销所有修改，所以你可以放心地插入、修改、删除，下一次运行时数据又是原样。

## 核心概念 {#core}

### 一行就是一组值

`INSERT` 往一张表里添加新行。你列出要填的列，再给出对应的值：

```sql run
INSERT INTO categories (id, name)
VALUES (6, 'Garden');
SELECT * FROM categories ORDER BY id;
```

值和列**按位置**一一对应：第一个值进第一列，第二个值进第二列，不看名字。每个值的类型要和它那一列兼容。

### 没写的列怎么办

列表里没有出现的列，会填上它的{{term:default-value}}。建表时没有规定默认值的列，默认值就是 NULL。shop 的表都没有规定默认值，所以没写的列全是 NULL。

### 约束先检查，再写入

每一行写进去之前，都要通过这张表的所有约束：{{term:primary-key}}不能重复，{{term:foreign-key}}必须指向存在的行，{{term:not-null-constraint}}要求有值，{{term:check-constraint}}要求值满足条件。只要有一行没通过，**整条语句都不生效**，一行也不会写进去。

### 它不返回行

`INSERT` 本身不返回{{term:result-set}}，只报告“影响了几行”。想看到刚插入的行，要么再写一条 `SELECT`，要么在语句末尾加上 `RETURNING`。

## 语法 {#syntax}

```syntax
INSERT INTO table_name [ ( column_name [, …] ) ]
{ VALUES ( { expression | DEFAULT } [, …] ) [, …] | select_statement }
[ RETURNING { * | expression [ [ AS ] output_name ] } [, …] ]
```

| 部分 | 填什么 | 规则 |
|---|---|---|
| `table_name` | 要插入的表 | 一条 `INSERT` 只能写一张表 |
| `( column_name [, …] )` | 要填的列 | 可以省略，但省略后就得按建表时的列顺序给出所有列的值；本课程总是写上 |
| `VALUES ( … )` | 一行的值 | 个数和列表里的列一样多，按位置对应 |
| `[, …]`（括号之后） | 更多的行 | 每一行一对括号，用逗号隔开 |
| `DEFAULT` | 这一格用默认值 | 没有规定默认值时就是 NULL |
| `select_statement` | 一条查询，代替 `VALUES` | 查询的每一行变成插入的一行；列数和列表一致 |
| `RETURNING` | 插入之后要看的列 | 可以省略；写法和选择列表一样 |

格式里有两个 `[, …]`，管的东西不同：括号里的那个重复的是一行中的值，括号后面的那个重复的是整行。

对照格式读几条：

- `INSERT INTO categories (id, name) VALUES (6, 'Garden')`：两列，一行，两个值。
- `INSERT INTO categories (id, name) VALUES (6, 'Garden'), (7, 'Toys')`：同样的两列，两行。
- `INSERT INTO order_items (…) SELECT … FROM …`：用一条查询代替 `VALUES`，查出几行就插入几行。

## 示例 {#example}

问题：把新顾客 Olivia Brown 写进 `customers`：编号 13，邮箱 olivia.b@example.com，住在澳大利亚的悉尼，2024 年 7 月 1 日注册，没有推荐人。

1. **先看表里有哪些列，哪些必须有值。** 第 0 章查过：`id`、`name`、`country`、`joined_on` 不能为 NULL，`email`、`city`、`referred_by` 可以。
2. **决定要写哪些列。** 没有推荐人，`referred_by` 不写，它会是 NULL。
3. **按列表的顺序写值。** 文字和日期用单引号。
4. **用 `RETURNING` 确认写进去的是什么。**

```sql run
INSERT INTO customers (id, name, email, city, country, joined_on)
VALUES (13, 'Olivia Brown', 'olivia.b@example.com', 'Sydney', 'Australia', '2024-07-01')
RETURNING *;
```

`RETURNING *` 返回刚插入的整行，`referred_by` 是 NULL，和预期一致。`'2024-07-01'` 是一段文字，因为它要进入的是 `date` 列，PostgreSQL 会把它转换成日期。

## 变体 {#variants}

**一次插入多行。** 括号之间用逗号隔开。一条语句插入多行，比写多条 `INSERT` 更快：

```sql run
INSERT INTO categories (id, name)
VALUES (6, 'Garden'),
       (7, 'Toys')
RETURNING id, name;
```

**只写必须的列。** 没有写的 `email` 和 `city` 都是 NULL：

```sql run
INSERT INTO customers (id, name, country, joined_on)
VALUES (13, 'Olivia Brown', 'Australia', '2024-07-01')
RETURNING id, name, email, city;
```

**把查询结果插进去。** Lin Wei 想把订单 1 原样再买一次。先建一笔新订单 25，再把订单 1 的明细复制过来，单价用商品现在的价格：

```sql run
INSERT INTO orders (id, customer_id, ordered_at, status)
VALUES (25, 1, '2024-07-01 10:00', 'pending');

INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT 25, i.product_id, i.quantity, p.price
FROM order_items AS i
JOIN products AS p ON p.id = i.product_id
WHERE i.order_id = 1
RETURNING *;
```

`SELECT` 部分可以单独运行，先确认它查出的正是要插入的行，再在前面加上 `INSERT INTO`。这是修改数据时的好习惯。

## 深入 {#deeper}

**一条语句要么全成功，要么全失败。** 两行里只要有一行违反约束，两行都不会写进去：

```sql run error
INSERT INTO categories (id, name)
VALUES (6, 'Garden'),
       (6, 'Toys');
```

第二行和第一行的主键重复，于是整条语句被拒绝，`Garden` 也没有留下。多条语句之间则是各算各的，第 4 篇讲{{term:transaction}}时会看到怎样把几条语句绑在一起。

**数值会被悄悄舍入。** `price` 是 `numeric(8, 2)`，插入 `12.345` 不会报错，存进去的是 `12.35`。插入之前想清楚精度，或者用 `RETURNING` 看一眼。

**新编号从哪来？** shop 的编号是手写的。用 `SELECT max(id) + 1` 算下一个编号看似可行，但两个人同时插入时会算出同一个编号，后一个就会因为主键重复而失败。真实的表通常让数据库自动生成编号，第 8 章会讲。

**大量数据用 `COPY`。** 导入成千上万行时，PostgreSQL 的 `COPY` 命令比 `INSERT` 快得多，它直接读取 CSV 之类的文件。SQL Lab 里用不到它。

**`RETURNING` 是 PostgreSQL 的扩展。** SQLite 3.35 起也支持；MySQL 没有；SQL Server 用 `OUTPUT` 子句做同样的事。

## 常见错误 {#mistakes}

**1. 不写列名，值的顺序和表不一致。**

```sql run error
INSERT INTO categories VALUES ('Garden', 6);
```

`invalid input syntax for type integer: "Garden"`：没有列名列表时，第一个值进第一列，也就是 `id`。这次类型不对，所以报错了；如果两列类型相同，值会悄悄地进错列。总是写上列名。

**2. 值的个数和列的个数不同。** `VALUES (6)` 配两列，报 `INSERT has more target columns than expressions`；三个值配两列，报 `INSERT has more expressions than target columns`。

**3. 文字用了双引号。**

```sql run error
INSERT INTO categories (id, name) VALUES (6, "Garden");
```

`column "Garden" does not exist`：双引号包的是名字，数据库去找一个叫 Garden 的列。文字用单引号。

**4. 漏写了不能为 NULL 的列。**

```sql run error
INSERT INTO customers (id, name, joined_on)
VALUES (13, 'Olivia Brown', '2024-07-01');
```

`null value in column "country" … violates not-null constraint`。DETAIL 里的 `Failing row contains (…)` 列出了这一行每一列的值，一眼就能看到哪一格是 null。

**5. 值不满足检查约束。**

```sql run error
INSERT INTO orders (id, customer_id, ordered_at, status)
VALUES (25, 1, '2024-07-01 10:00', 'new');
```

`violates check constraint "orders_status_check"`：`status` 只能是 pending、paid、shipped、delivered、cancelled 之一。约束的名字告诉你是哪张表的哪一列。

## 小结 {#summary}

- `INSERT INTO 表 (列, …) VALUES (值, …)`：值按位置对应列，总是写上列名。
- 一条 `INSERT` 可以插入多行，也可以用一条 `SELECT` 代替 `VALUES`。
- 没写的列取默认值，没有规定默认值就是 NULL。
- 每一行都要通过所有约束；有一行不通过，整条语句都不生效。
- `INSERT` 只报告影响的行数，加上 `RETURNING` 才能看到插入的行。
