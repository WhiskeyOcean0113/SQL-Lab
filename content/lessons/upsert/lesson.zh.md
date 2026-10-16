## 为什么需要它 {#why}

Lin Wei 的订单 22 还没付款。ta 又在购物车里加了 2 个 Ceramic Mug（商品 8）。如果订单里还没有这种商品，就新增一行明细；如果已经有了，就在原来的件数上加 2。

用前两篇的知识，这要分两步：先查一下有没有，再决定 `INSERT` 还是 `UPDATE`。两步之间如果有别人插进来，或者你的判断写错了，就会出现重复的明细或者主键冲突。这种“有则改、无则加”的操作非常常见，它有一个专门的名字。

## 核心概念 {#core}

### 先试着插入，冲突了再说

{{Term:upsert}}是 update 和 insert 合成的词。PostgreSQL 的写法是在 `INSERT` 后面加一个 `ON CONFLICT` 子句：照常插入；如果某一行撞上了主键或唯一约束，就不报错，改为执行你指定的动作。

```sql run
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (22, 8, 2, 12.50)
ON CONFLICT (order_id, product_id)
DO UPDATE SET quantity = order_items.quantity + EXCLUDED.quantity
RETURNING *;
```

订单 22 原本就有 1 个 Ceramic Mug，于是没有插入新行，而是把件数改成了 3。

### 冲突了能做什么

- **`DO NOTHING`**：跳过这一行，什么也不做，也不报错。
- **`DO UPDATE SET …`**：把已经存在的那一行按你写的 `SET` 修改，和 `UPDATE` 的 `SET` 一样。

### 两个名字：表名和 `EXCLUDED`

在 `DO UPDATE` 里，同一列有两个版本：

| 写法 | 指的是 |
|---|---|
| `order_items.quantity` | 表里已经存在的那一行的值 |
| `EXCLUDED.quantity` | 你这次想插入、但因为冲突被挡下来的值 |

“在原来的件数上加 2”就是 `order_items.quantity + EXCLUDED.quantity`。

### 冲突是谁说了算

`ON CONFLICT (order_id, product_id)` 括号里的列叫冲突目标，它必须正好是一个主键或唯一约束的列。数据库靠这个约束来判断“这一行已经存在”。没有约束，就没有冲突可言。

## 语法 {#syntax}

```syntax
INSERT INTO table_name [ AS alias ] [ ( column_name [, …] ) ]
VALUES ( expression [, …] ) [, …]
ON CONFLICT [ ( column_name [, …] ) ]
{ DO NOTHING | DO UPDATE SET column_name = expression [, …] [ WHERE condition ] }
[ RETURNING { * | expression [ [ AS ] output_name ] } [, …] ]
```

| 部分 | 填什么 | 规则 |
|---|---|---|
| `ON CONFLICT ( column_name [, …] )` | 冲突目标：主键或唯一约束的列 | `DO NOTHING` 时可以省略，表示任何唯一约束冲突都跳过；`DO UPDATE` 时必须写 |
| `DO NOTHING` | 冲突时跳过这一行 | 被跳过的行不会出现在 `RETURNING` 里 |
| `DO UPDATE SET` | 冲突时修改已有的那一行 | 写法和 `UPDATE` 的 `SET` 相同；用 `EXCLUDED.列` 取被挡下的新值 |
| `WHERE condition`（`DO UPDATE` 之后） | 只在满足条件时才修改 | 可以省略；不满足时这一行什么也不做 |
| `AS alias` | 给目标表起别名 | 可以省略；表名很长时，`SET` 右边可以用别名代替 |

`INSERT` 的其余部分和第 1 篇完全一样。

对照格式读几条：

- `ON CONFLICT (order_id, product_id) DO UPDATE SET quantity = order_items.quantity + EXCLUDED.quantity`：冲突目标是 `order_items` 的复合主键，冲突时把件数相加。
- `ON CONFLICT DO NOTHING`：没有冲突目标，任何唯一约束冲突都跳过。
- `ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price WHERE EXCLUDED.price < products.price`：按编号冲突，只有新价格更低时才更新。

## 示例 {#example}

问题：订单 22 再加 2 个 Ceramic Mug（商品 8，单价 12.50）和 1 本 SQL Pocket Guide（商品 3，单价 19.99）。已经在订单里的商品加件数，不在的新增一行。

1. **照常写 `INSERT`，两行一起。**
2. **确定冲突目标。** 同一笔订单的同一种商品只能有一行，这正是 `order_items` 的主键 `(order_id, product_id)`。
3. **冲突时做什么。** 件数相加：已有的 `order_items.quantity` 加上被挡下的 `EXCLUDED.quantity`。单价不动。
4. **用 `RETURNING` 看结果。**

```sql run
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (22, 8, 2, 12.50),
       (22, 3, 1, 19.99)
ON CONFLICT (order_id, product_id)
DO UPDATE SET quantity = order_items.quantity + EXCLUDED.quantity
RETURNING *;
```

Ceramic Mug 原来就在订单里，件数从 1 变成 3；SQL Pocket Guide 原来没有，新增了一行。一条语句，两种结果，各行各算。

## 变体 {#variants}

**`DO NOTHING`：已经有了就跳过。** 一次导入三个分类，其中 Books 已经存在：

```sql run
INSERT INTO categories (id, name)
VALUES (6, 'Garden'), (1, 'Books'), (7, 'Toys')
ON CONFLICT DO NOTHING
RETURNING *;
```

只返回了两行，Books 被安静地跳过了。不写冲突目标时，任何唯一约束上的冲突都会跳过：这里 `id` 和 `name` 都撞上了。

**按价格表同步商品。** 供应商发来新价格，表里已有的商品更新价格，没有的上架：

```sql run
INSERT INTO products (id, name, category_id, price, stock, launched_on)
VALUES (3, 'SQL Pocket Guide', 1, 21.99, 40, '2022-06-20'),
       (17, 'Plant Pot', 3, 9.99, 40, '2024-07-01')
ON CONFLICT (id)
DO UPDATE SET price = EXCLUDED.price
RETURNING id, name, price;
```

商品 3 只改了价格，库存还是原来的 40；`SET` 里没写的列不会被 `EXCLUDED` 的值覆盖。

**有条件地更新。** 只在新价格更低时才更新：

```sql run
INSERT INTO products (id, name, category_id, price, stock, launched_on)
VALUES (3, 'SQL Pocket Guide', 1, 25.00, 40, '2022-06-20')
ON CONFLICT (id)
DO UPDATE SET price = EXCLUDED.price
WHERE EXCLUDED.price < products.price
RETURNING id, price;
```

25.00 比现在的 19.99 高，条件不成立，这一行什么也没做，`RETURNING` 是空的。把价格换成 17.99 再运行一次，就会更新。

## 深入 {#deeper}

**为什么不先查再决定？** “先 `SELECT`，没有就 `INSERT`，有就 `UPDATE`”在一个人用的时候没问题。但两个请求同时到达时，可能都查到“没有”，然后都去 `INSERT`，后一个就会因为主键重复而失败。`ON CONFLICT` 把判断和写入放在同一条语句里，由数据库保证不会出现这种情况。

**同一条语句里不能撞两次同一行。**

```sql run error
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (22, 8, 2, 12.50),
       (22, 8, 1, 12.50)
ON CONFLICT (order_id, product_id)
DO UPDATE SET quantity = order_items.quantity + EXCLUDED.quantity;
```

`ON CONFLICT DO UPDATE command cannot affect row a second time`：两行要插入的数据都指向订单 22 的商品 8。先把它们合并成一行，件数写 3。

**只认冲突目标那一个约束。** `ON CONFLICT (id)` 只处理 `id` 上的冲突。新分类的 `id` 是 6、`name` 却是已有的 Books 时，撞的是 `name` 的唯一约束，照样报 `duplicate key` 错误。

**`MERGE`。** PostgreSQL 15 起支持标准 SQL 的 `MERGE` 语句，它把一张来源表和目标表按条件配对，配上的执行 `WHEN MATCHED THEN UPDATE …`，没配上的执行 `WHEN NOT MATCHED THEN INSERT …`。它更通用，比如还能在配上时删除；但并发时不像 `ON CONFLICT` 那样保证不会冲突。日常的“有则改、无则加”，`ON CONFLICT` 更简单可靠。

**其他数据库。** SQLite 用同样的 `ON CONFLICT … DO UPDATE` 写法；MySQL 写作 `INSERT … ON DUPLICATE KEY UPDATE`；SQL Server 和 Oracle 用 `MERGE`。

## 常见错误 {#mistakes}

**1. `DO UPDATE` 没写冲突目标。**

```sql run error
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (22, 8, 2, 12.50)
ON CONFLICT DO UPDATE SET quantity = 5;
```

`ON CONFLICT DO UPDATE requires inference specification or constraint name`，HINT 给出了例子 `ON CONFLICT (column_name)`。只有 `DO NOTHING` 可以不写。

**2. 冲突目标不是唯一约束。** `ON CONFLICT (country)` 会报 `there is no unique or exclusion constraint matching the ON CONFLICT specification`。`country` 可以重复，不存在“同一个国家已经存在”的冲突。

**3. `SET` 右边的列名有歧义。**

```sql run error
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (22, 8, 2, 12.50)
ON CONFLICT (order_id, product_id)
DO UPDATE SET quantity = quantity + EXCLUDED.quantity;
```

`column reference "quantity" is ambiguous`：已有的行和 `EXCLUDED` 里都有 `quantity`。写成 `order_items.quantity`。

**4. 想累加，却直接用了 `EXCLUDED`。** `SET quantity = EXCLUDED.quantity` 不会报错，但它把件数改成了这次的 2，而不是原来的 1 加 2。想清楚是“替换”还是“累加”。

**5. 以为 `ON CONFLICT` 能处理所有错误。** 它只处理冲突目标上的唯一冲突。外键不存在、非空约束、检查约束，照样报错：插入一个不存在的商品 99，即使写了 `DO NOTHING`，也会报 `violates foreign key constraint`。

## 小结 {#summary}

- `INSERT … ON CONFLICT` 先尝试插入，撞上主键或唯一约束时改为执行指定的动作。
- `DO NOTHING` 跳过冲突的行；`DO UPDATE SET` 修改已有的行。
- 在 `DO UPDATE` 里，`表名.列` 是已有的值，`EXCLUDED.列` 是被挡下的新值。
- 冲突目标必须对应一个主键或唯一约束；`DO UPDATE` 必须写冲突目标。
- 判断和写入在同一条语句里完成，比“先查再改”可靠；同一条语句不能两次撞上同一行。
