## 为什么需要它 {#why}

数据写进去以后并不是一成不变的。订单 15 今天发货了，它的状态要从 paid 改成 shipped，还要记下发货时间。下架的商品要删掉，取消的订单要清理。

上一篇只能添加新行。这一篇学修改和删除已有的行。它们比 `INSERT` 危险得多：一条写错的 `UPDATE` 可以在一瞬间改掉整张表。

## 核心概念 {#core}

### UPDATE：改哪些行，改成什么

`UPDATE` 有两个问题要回答：`WHERE` 选出要改的行，`SET` 给出新值。

```sql run
UPDATE orders
SET status = 'shipped', shipped_at = '2024-07-02 09:00'
WHERE id = 15
RETURNING id, status, shipped_at;
```

`SET` 后面的值可以是表达式，并且可以用到这一行**原来**的值：`SET stock = stock + 20` 的意思是“在原来的库存上加 20”。同一条 `SET` 里的所有表达式，看到的都是修改之前的值。

### DELETE：删掉哪些行

`DELETE` 只有一个问题：删哪些行。它总是删除整行，没有“删掉一列”的说法；想清空某一格，用 `UPDATE … SET 列 = NULL`。

```sql run
DELETE FROM orders
WHERE id = 24
RETURNING *;
```

### WHERE 决定一切

`UPDATE` 和 `DELETE` 的 `WHERE` 和查询里的 `WHERE` 完全一样，逐行判断，结果为真的行才会被修改或删除。**不写 `WHERE`，就是表里的每一行。**数据库不会追问“你确定吗”。

所以修改数据之前养成一个习惯：先用同样的 `WHERE` 写一条 `SELECT`，看清楚会选中哪些行，再把 `SELECT` 换成 `UPDATE` 或 `DELETE`。

### 约束依然有效

修改后的每一行都要通过约束：库存不能改成负数，分类编号不能指向不存在的分类。删除时，{{term:foreign-key}}会阻止你删掉还被别的行引用的行，比如还有明细的订单。

## 语法 {#syntax}

```syntax
UPDATE table_name [ [ AS ] alias ]
SET column_name = { expression | DEFAULT } [, …]
[ FROM from_item [, …] ]
[ WHERE condition ]
[ RETURNING { * | expression [ [ AS ] output_name ] } [, …] ]
```

```syntax
DELETE FROM table_name [ [ AS ] alias ]
[ USING from_item [, …] ]
[ WHERE condition ]
[ RETURNING { * | expression [ [ AS ] output_name ] } [, …] ]
```

| 部分 | 填什么 | 规则 |
|---|---|---|
| `table_name` | 要修改或删除的表 | 每条语句一张表 |
| `SET column_name = expression` | 一列和它的新值 | 多列用逗号隔开；列名前不能加表名或别名；表达式看到的是旧值 |
| `FROM from_item`（`UPDATE`） | 计算新值或筛选时要参照的其他表 | 可以省略；PostgreSQL 的扩展，条件写在 `WHERE` 里 |
| `USING from_item`（`DELETE`） | 筛选时要参照的其他表 | 可以省略；同样是 PostgreSQL 的扩展 |
| `WHERE condition` | 选出要改或要删的行 | 语法上可以省略，但省略就是全表 |
| `RETURNING` | 修改或删除之后要看的列 | 可以省略；`UPDATE` 返回新值，`DELETE` 返回被删掉的行 |

对照格式读几条：

- `UPDATE orders SET status = 'shipped', shipped_at = '…' WHERE id = 15`：两个 `column_name = expression`，用逗号隔开。
- `UPDATE products SET stock = stock + 20 WHERE stock < 10`：新值是用旧值算出来的表达式，`WHERE` 一次选中多行。
- `DELETE FROM orders WHERE id = 24 RETURNING *`：没有 `USING`，按主键删一行，并返回被删掉的那一行。

## 示例 {#example}

问题：订单 15 在 2024-07-02 09:00 发货了，把它的状态改成 shipped，并记下发货时间。

1. **先用 `SELECT` 找到要改的行。** 用主键 `id = 15` 定位，确认只有一行，并看清它现在的样子。
2. **把 `SELECT` 换成 `UPDATE`，`WHERE` 原样保留。**
3. **在 `SET` 里写两列的新值，用逗号隔开。**
4. **用 `RETURNING` 核对结果。**

```sql run
SELECT id, status, shipped_at FROM orders WHERE id = 15;
```

```sql run
UPDATE orders
SET status = 'shipped',
    shipped_at = '2024-07-02 09:00'
WHERE id = 15
RETURNING id, status, shipped_at;
```

`RETURNING` 显示的是修改之后的值。运行时界面上还会显示“影响 1 行”；如果这里的数字比你预想的大，说明 `WHERE` 选得太宽了。

## 变体 {#variants}

**用旧值算新值。** Books 分类打九折，保留两位小数：

```sql run
UPDATE products
SET price = round(price * 0.9, 2)
WHERE category_id = 1
RETURNING id, name, price;
```

**一次修改多行。** 库存不足 10 件的商品各补 20 件：

```sql run
UPDATE products
SET stock = stock + 20
WHERE stock < 10
RETURNING name, stock;
```

**参照另一张表来改：`UPDATE … FROM`。** 订单 22 还没付款，把它每一行明细的单价更新为商品现在的价格。`FROM` 引入 `products`，`WHERE` 写连接条件：

```sql run
UPDATE order_items AS i
SET unit_price = p.price
FROM products AS p
WHERE p.id = i.product_id
  AND i.order_id = 22
RETURNING i.order_id, i.product_id, i.unit_price;
```

**用子查询决定删哪些行。** 删除从来没有下过单的顾客：

```sql run
DELETE FROM customers AS c
WHERE NOT EXISTS (
  SELECT 1 FROM orders AS o WHERE o.customer_id = c.id
)
RETURNING id, name;
```

这就是第 5 章的 `NOT EXISTS`，换了一个外壳：`SELECT` 找出的行，`DELETE` 把它们删掉。

**先删明细，再删订单。** 清理所有取消的订单。订单还被明细引用，所以要先删明细：

```sql run
DELETE FROM order_items
WHERE order_id IN (SELECT id FROM orders WHERE status = 'cancelled');

DELETE FROM orders
WHERE status = 'cancelled'
RETURNING id;
```

第一条也可以写成 `DELETE FROM order_items AS i USING orders AS o WHERE o.id = i.order_id AND o.status = 'cancelled'`，`USING` 的作用和 `UPDATE` 的 `FROM` 一样。

## 深入 {#deeper}

**`SET` 里看到的都是旧值。** `UPDATE products SET stock = stock - 1, price = price + 1` 里的两个表达式，都用修改之前的 `stock` 和 `price`。所以 `SET a = b, b = a` 能交换两列的值，不需要临时变量。

**`UPDATE … FROM` 匹配到多行时，结果不确定。** 如果 `FROM` 的表里有好几行能和要修改的那一行配上，PostgreSQL 只会用其中随意的一行来更新，并且不报错。用 `FROM` 时，确认连接条件对每一行最多只配上一行，比如按主键连接。

**`TRUNCATE` 清空整张表。** `TRUNCATE order_items` 比不带 `WHERE` 的 `DELETE` 快得多，因为它不逐行处理。它不能带条件，也不能用在还被外键引用的表上（除非连同引用它的表一起清空）。

**修改数据的 CTE。** `DELETE`、`UPDATE` 和 `INSERT` 都可以放进 `WITH`，再用 `RETURNING` 把结果交给主查询。比如把删掉的行顺手统计一下：

```sql run
WITH gone AS (
  DELETE FROM order_items
  WHERE order_id IN (5, 12)
  RETURNING *
)
SELECT count(*) AS deleted, sum(quantity * unit_price) AS value
FROM gone;
```

**和其他数据库的区别。** `UPDATE … FROM` 和 `DELETE … USING` 是 PostgreSQL 的写法；MySQL 用 `UPDATE a JOIN b ON … SET …`，SQL Server 也支持 `FROM`。标准 SQL 只能用子查询，比如 `SET unit_price = (SELECT price FROM products WHERE id = order_items.product_id)`。MySQL 的客户端常开着 safe updates 模式，拒绝不带主键条件的 `UPDATE` 和 `DELETE`；PostgreSQL 没有这层保护。

## 常见错误 {#mistakes}

**1. 忘了 `WHERE`。**

```sql run
UPDATE products SET price = 10;
SELECT count(*) AS now_ten FROM products WHERE price = 10;
```

16 件商品全部变成了 10 美元，而且不会有任何警告。这是修改数据时最常见、代价最大的错误。在真实的数据库里，它只能靠备份或{{term:transaction}}挽回（第 4 篇）。

**2. 在 `SET` 里用 `AND` 连接多列。**

```sql run error
UPDATE products SET name = 'Clay Pot' AND price = 15 WHERE id = 8;
```

`invalid input syntax for type boolean: "Clay Pot"`：数据库把它读成了 `name = ('Clay Pot' AND price = 15)`，要算一个布尔值。多列之间用逗号：`SET name = 'Clay Pot', price = 15`。

**3. 给 `SET` 的列加上了表名或别名。**

```sql run error
UPDATE products AS p SET p.price = 1 WHERE p.id = 1;
```

`column "p" of relation "products" does not exist`，HINT 说得很直接：`SET target columns cannot be qualified with the relation name`。`SET` 左边只写列名；右边和 `WHERE` 里可以用别名。

**4. 用 `= NULL` 选行。** `UPDATE customers SET city = 'Unknown' WHERE city = NULL` 一行都不会改，因为 `city = NULL` 永远不是真。和查询一样，要写 `WHERE city IS NULL`。

**5. 先删被引用的行。**

```sql run error
DELETE FROM orders WHERE status = 'cancelled';
```

`violates foreign key constraint "order_items_order_id_fkey"`，DETAIL 写着订单 5 `is still referenced from table "order_items"`。先删引用它的明细，再删订单，顺序和插入时正好相反。

**6. 新值违反约束。** `UPDATE products SET stock = stock - 50 WHERE id = 1` 会报 `violates check constraint "products_stock_check"`：库存只有 25，减 50 就成了负数。约束在 `UPDATE` 时和 `INSERT` 时一样检查。

## 小结 {#summary}

- `UPDATE 表 SET 列 = 值, … WHERE 条件` 修改选中的行；`SET` 里的表达式用的是旧值。
- `DELETE FROM 表 WHERE 条件` 删除整行。
- 不写 `WHERE` 就是全表；动手之前先用同样的 `WHERE` 跑一遍 `SELECT`。
- `UPDATE … FROM` 和 `DELETE … USING` 可以参照其他表；子查询也可以决定改哪些行。
- 约束依然有效：被引用的行要后删，新值也要满足检查约束。
