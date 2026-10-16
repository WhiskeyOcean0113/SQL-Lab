## 为什么需要它 {#why}

上一篇建的 `reviews` 表什么都收：99 分、不存在的商品、同一位顾客给同一件商品写十条评论、连分数都没有的评论。

这些规则当然可以在网站的代码里检查。但数据库不只被一个程序写入：后台脚本、数据导入、手写的 SQL，任何一处漏掉检查，脏数据就进来了，而且之后很难清理。把规则写进表里，数据库就会对**每一次**写入执行检查，不管它来自哪里。

## 核心概念 {#core}

### 五种约束

{{Term:constraint}}是写在表上的规则。违反规则的 `INSERT` 或 `UPDATE` 会被整条拒绝：

| 约束 | 规则 | 违反时的 SQLSTATE |
|---|---|---|
| `NOT NULL` | 这一列必须有值 | 23502 |
| `UNIQUE` | 这一列（或这几列的组合）不能重复 | 23505 |
| `PRIMARY KEY` | 唯一且不为空，每张表最多一个 | 23505 或 23502 |
| `REFERENCES`（外键） | 值必须在另一张表的主键或唯一列里存在 | 23503 |
| `CHECK (条件)` | 每一行都要满足这个条件 | 23514 |

第 0 章已经见过 shop 的主键、外键和唯一约束，第 7 章在插入时撞上过它们。这一篇自己来写。

### 写在列后面，或写在表的最后

只涉及一列的约束，可以直接写在这一列的定义后面，叫列约束：`rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5)`。

涉及好几列的约束，写在所有列的后面，叫表约束：`UNIQUE (product_id, customer_id)` 表示“同一位顾客对同一件商品只能评一次”，单看哪一列都可以重复。

### `CHECK` 只拒绝“假”

`CHECK` 的条件算出来是假时，这一行被拒绝；算出来是真**或 NULL** 时，都放行。所以 `CHECK (rating BETWEEN 1 AND 5)` 挡不住 NULL：

```sql run
CREATE TABLE reviews (
  id     integer PRIMARY KEY,
  rating smallint CHECK (rating BETWEEN 1 AND 5)
);
INSERT INTO reviews VALUES (1, NULL)
RETURNING *;
```

要求必须有分数，再加一个 `NOT NULL`。这和 `WHERE` 正好相反：`WHERE` 只留下真，`CHECK` 只拒绝假。

## 语法 {#syntax}

```syntax
CREATE TABLE table_name (
    column_name data_type [ column_constraint [ … ] ] [, …]
    [, table_constraint [, …] ]
)
```

其中 `column_constraint` 是：

```syntax
[ CONSTRAINT constraint_name ]
{ NOT NULL | UNIQUE | PRIMARY KEY | CHECK ( condition )
| REFERENCES ref_table [ ( ref_column ) ] [ ON DELETE { NO ACTION | CASCADE | SET NULL } ] }
```

`table_constraint` 是：

```syntax
[ CONSTRAINT constraint_name ]
{ UNIQUE ( column_name [, …] ) | PRIMARY KEY ( column_name [, …] ) | CHECK ( condition )
| FOREIGN KEY ( column_name [, …] ) REFERENCES ref_table [ ( ref_column [, …] ) ] }
```

给已有的表加约束：

```syntax
ALTER TABLE table_name ADD [ CONSTRAINT constraint_name ] table_constraint
ALTER TABLE table_name DROP CONSTRAINT constraint_name
```

| 部分 | 填什么 | 规则 |
|---|---|---|
| `column_constraint [ … ]` | 一列后面的约束 | 可以有好几个，用空格隔开，不用逗号 |
| `table_constraint` | 涉及一列或几列的约束 | 写在所有列之后，前面有逗号 |
| `CONSTRAINT constraint_name` | 约束的名字 | 可以省略；省略时数据库按 `表名_列名_check` 这类规则起名 |
| `CHECK ( condition )` | 每一行都要满足的条件 | 括号不能省；条件可以用这一行的任何列 |
| `REFERENCES ref_table ( ref_column )` | 外键指向的表和列 | `ref_column` 省略时指向那张表的主键；它必须是主键或唯一列 |
| `ON DELETE …` | 被引用的行删除时怎么办 | 可以省略，默认 `NO ACTION`：拒绝删除 |

格式里 `[ … ]` 和 `[, …]` 的区别在这里很要紧：一列后面的多个约束用空格连着写，多列、多个表约束之间才用逗号。

对照格式读几条：

- `rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5)`：一列，两个列约束，中间只有空格。
- `product_id integer NOT NULL REFERENCES products (id)`：非空，加上外键。
- `UNIQUE (product_id, customer_id)`：表约束，两列的组合不能重复。

## 示例 {#example}

问题：重新设计 `reviews`，让下面这些规则都由数据库来保证：

- 编号自动生成，作主键；
- 必须指明是哪件商品、哪位顾客写的，而且它们必须存在；
- 分数必须有，并且在 1 到 5 之间；
- 同一位顾客对同一件商品只能评一次。

1. **主键：** `id` 自动编号，加 `PRIMARY KEY`。
2. **外键加非空：** `product_id` 和 `customer_id` 各自 `NOT NULL REFERENCES …`。只写外键还不够，外键允许 NULL。
3. **分数：** `NOT NULL` 加 `CHECK`。
4. **一人一评：** 这条规则涉及两列，写成表约束 `UNIQUE (product_id, customer_id)`。
5. **插入一条合规的评论，再试一条不合规的。**

```sql run
CREATE TABLE reviews (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  integer NOT NULL REFERENCES products (id),
  customer_id integer NOT NULL REFERENCES customers (id),
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  UNIQUE (product_id, customer_id)
);

INSERT INTO reviews (product_id, customer_id, rating)
VALUES (3, 1, 5)
RETURNING *;
```

```sql run error
CREATE TABLE reviews (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  integer NOT NULL REFERENCES products (id),
  customer_id integer NOT NULL REFERENCES customers (id),
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  UNIQUE (product_id, customer_id)
);

INSERT INTO reviews (product_id, customer_id, rating)
VALUES (3, 1, 5), (3, 1, 4);
```

第二段报 `duplicate key value violates unique constraint "reviews_product_id_customer_id_key"`：Lin Wei 想给 SQL Pocket Guide 评第二次。把 `(3, 1, 4)` 换成 `(3, 1, 6)` 或 `(99, 1, 5)` 再运行，分别会撞上检查约束和外键。

## 变体 {#variants}

**比较两列的 `CHECK`。** 促销的结束日期必须晚于开始日期。条件涉及两列，写成表约束：

```sql run error
CREATE TABLE promotions (
  id        integer PRIMARY KEY,
  starts_on date NOT NULL,
  ends_on   date NOT NULL,
  CHECK (ends_on > starts_on)
);
INSERT INTO promotions VALUES (1, '2024-07-10', '2024-07-01');
```

**给约束起名。** 默认的名字像 `promotions_check`，看不出检查的是什么。自己起个名字，报错信息就一目了然：

```sql run error
CREATE TABLE reviews (
  id     integer PRIMARY KEY,
  rating smallint CONSTRAINT rating_between_1_and_5 CHECK (rating BETWEEN 1 AND 5)
);
INSERT INTO reviews VALUES (1, 0);
```

**被引用的行删除时：`ON DELETE`。** 默认情况下，还有评论的商品删不掉。`ON DELETE CASCADE` 让评论跟着商品一起删除，`ON DELETE SET NULL` 则把评论的 `product_id` 设为 NULL：

```sql run
CREATE TABLE reviews (
  id         integer PRIMARY KEY,
  product_id integer REFERENCES products (id) ON DELETE CASCADE
);
INSERT INTO reviews VALUES (1, 16), (2, 16), (3, 3);

DELETE FROM products WHERE id = 16;
SELECT * FROM reviews;
```

删除 Folding Chair 时，它的两条评论也一起消失了。

**给已有的表加约束。** `ALTER TABLE … ADD CONSTRAINT` 会先检查表里已有的每一行：

```sql run error
ALTER TABLE customers
ADD CONSTRAINT customers_city_required CHECK (city IS NOT NULL);
```

`is violated by some row`：有两位顾客没有城市。要加上这条约束，先把这些行修好。

## 深入 {#deeper}

**NULL 能通过 `UNIQUE` 和 `CHECK`。** 两个 NULL 不算重复（第 0 章的 `email` 就是这样），`CHECK` 的条件遇到 NULL 算出 NULL，也算通过。想让 NULL 也只能出现一次，PostgreSQL 15 起可以写 `UNIQUE NULLS NOT DISTINCT`。

**主键等于唯一加非空。** `PRIMARY KEY` 会自动让那些列 `NOT NULL`，复合主键里的每一列都不能为空。一张表可以有好几个唯一约束，但只能有一个主键。

**外键只能指向主键或唯一列。** `REFERENCES customers (name)` 会报 `there is no unique constraint matching given keys`：名字可能重复，外键就不知道指的是哪一行。

**约束和程序里的检查。** 网页上的表单检查给用户即时的提示，数据库的约束保证数据本身是干净的。两者都要有：前者是为了体验，后者是最后一道防线。

**外键不会自动建索引。** 主键和唯一约束会自动建{{term:index}}，外键那一列却不会。按外键连接或删除被引用的行时，没有索引可能很慢，第 9 章会讲。

**其他数据库。** MySQL 8.0.16 之前会解析 `CHECK` 但不执行，写了也白写；SQLite 默认不检查外键，要先执行 `PRAGMA foreign_keys = ON`。

## 常见错误 {#mistakes}

**1. `CHECK` 的条件没加括号。**

```sql run error
CREATE TABLE t (n integer CHECK n > 0);
```

`syntax error at or near "n"`。`CHECK` 后面必须是一对括号：`CHECK (n > 0)`。

**2. 复合主键写成了两个 `PRIMARY KEY`。**

```sql run error
CREATE TABLE wishlist (
  customer_id integer PRIMARY KEY,
  product_id  integer PRIMARY KEY
);
```

`multiple primary keys for table "wishlist" are not allowed`。两个列约束是两个主键，而一张表只能有一个。由几列组成的主键写成表约束：`PRIMARY KEY (customer_id, product_id)`。

**3. 外键指向可能重复的列。** `REFERENCES customers (name)` 报 `there is no unique constraint matching given keys for referenced table "customers"`。外键要指向主键，通常就是 `id`。

**4. 以为 `CHECK` 能挡住 NULL。** 见核心概念：`CHECK (rating BETWEEN 1 AND 5)` 放行 NULL。必须有值的列，再加 `NOT NULL`。

**5. 只写外键，忘了 `NOT NULL`。** `product_id integer REFERENCES products (id)` 允许 NULL，也就是允许“不属于任何商品”的评论。每条评论都必须对应一件商品，就写 `NOT NULL REFERENCES …`。

**6. 随手加上 `ON DELETE CASCADE`。** 它很方便，但一条 `DELETE` 可能连带删掉几张表里的大量数据，而且不会提醒你。只在“子行离开父行就没有意义”时使用，比如订单明细之于订单；评论、订单这类有独立价值的记录，宁可让删除失败。

## 小结 {#summary}

- 约束把规则写进表里，数据库会检查每一次 `INSERT` 和 `UPDATE`，违反时整条语句被拒绝。
- 五种约束：`NOT NULL`、`UNIQUE`、`PRIMARY KEY`、外键 `REFERENCES`、`CHECK`。
- 一列的约束写在列后面，用空格连着写；涉及几列的约束写成表约束。
- `CHECK` 只拒绝假，NULL 能通过；必须有值的列要加 `NOT NULL`。
- 外键指向主键或唯一列；`ON DELETE` 决定被引用的行删除时怎么办，默认是拒绝删除。
