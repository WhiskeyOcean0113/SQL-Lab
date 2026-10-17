## 为什么需要它 {#why}

Priya Nair（顾客 7）买了 2 个 USB-C Hub。系统要做三件事：在 `orders` 里新建订单，在 `order_items` 里记下明细，再把 `products` 里的库存减 2。

如果第二步之后服务器断电了怎么办？订单和明细都写进去了，库存却没减。仓库以为还有货，其实已经卖掉了。反过来，库存减了、订单没写进去，货就凭空少了两件。这三步要么全部完成，要么一步都不算，不能停在中间。

## 核心概念 {#core}

### 把几条语句绑成一个整体

{{Term:transaction}}是一组被当作一个整体的语句。用 `BEGIN` 开始，用 `COMMIT` 确认，中间的所有修改要么一起生效，要么一起撤销：

```sql run
BEGIN;
INSERT INTO orders (id, customer_id, ordered_at, status)
VALUES (25, 7, '2024-07-01 10:00', 'paid');
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (25, 6, 2, 35.00);
UPDATE products SET stock = stock - 2 WHERE id = 6;
COMMIT;

SELECT o.id, o.status, i.quantity, p.stock
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
JOIN products AS p ON p.id = i.product_id
WHERE o.id = 25;
```

### 反悔：`ROLLBACK`

`COMMIT` 之前，你随时可以用 `ROLLBACK` 撤销这个事务里的全部修改，数据回到 `BEGIN` 之前的样子：

```sql run
BEGIN;
DELETE FROM order_items;
SELECT count(*) AS inside FROM order_items;
ROLLBACK;
SELECT count(*) AS after_rollback FROM order_items;
```

事务内部，`DELETE` 之后确实是 0 行；`ROLLBACK` 之后，42 行全部回来了。

### 出错时，整个事务作废

事务里任何一条语句出错，这个事务就不能再继续了。PostgreSQL 会拒绝之后的每一条语句，直到你结束这个事务：

```sql
BEGIN;
INSERT INTO orders (id, customer_id, ordered_at, status) VALUES (25, 7, '2024-07-01 10:00', 'paid');
SELECT 1 / 0;              -- division by zero
SELECT * FROM orders;      -- current transaction is aborted, commands ignored until end of transaction block
COMMIT;                    -- 实际执行的是 ROLLBACK
```

这时即使写的是 `COMMIT`，数据库实际做的也是 `ROLLBACK`：订单 25 不会留下。出错的事务只能整体撤销。

### 没写 `BEGIN` 的时候

不写 `BEGIN` 时，每一条语句自己就是一个事务，执行成功就立即提交，这叫{{term:autocommit}}。前三篇的每一条 `INSERT`、`UPDATE`、`DELETE` 都是这样：一条语句内部要么全部成功，要么全部失败，但两条语句之间没有任何联系。

### 在 SQL Lab 里

SQL Lab 每次运行都会把你的 SQL 放进它自己的一个事务，运行结束时撤销。你写的 `BEGIN`、`COMMIT`、`ROLLBACK` 在这次运行里的行为和真实的数据库一样；只是运行结束后，连提交过的修改也会被撤销，下一次运行又从原始数据开始。

## 语法 {#syntax}

```syntax
BEGIN
statement; [ … ]
{ COMMIT | ROLLBACK }
```

```syntax
SAVEPOINT savepoint_name
ROLLBACK TO [ SAVEPOINT ] savepoint_name
RELEASE [ SAVEPOINT ] savepoint_name
```

| 部分 | 作用 | 规则 |
|---|---|---|
| `BEGIN` | 开始一个事务 | 也可以写成 `START TRANSACTION` |
| `statement` | 事务里的语句 | 任意多条，每条以分号结束 |
| `COMMIT` | 确认，让所有修改生效 | 也可以写成 `END`；事务出过错时，它实际执行的是回滚 |
| `ROLLBACK` | 撤销整个事务的修改 | 不带 `TO` 时撤销到 `BEGIN` 之前 |
| `SAVEPOINT savepoint_name` | 在事务中间做一个标记 | 只能在事务里用 |
| `ROLLBACK TO savepoint_name` | 只撤销这个标记之后的修改 | 事务继续，之前的修改保留 |
| `RELEASE savepoint_name` | 删掉这个标记 | 修改都保留，只是不能再回到这里 |

第一个格式里的 `statement; [ … ]` 表示一条或多条语句，和前面的 `[, …]` 不同，它们之间用分号而不是逗号隔开。

对照格式读几条：

- 核心概念里的第一个例子：`BEGIN`，三条 `statement`，`COMMIT`。
- 第二个例子：`BEGIN`，两条 `statement`，`ROLLBACK`，修改全部撤销。
- `SAVEPOINT before_discount` … `ROLLBACK TO SAVEPOINT before_discount`：只撤销这两行之间的修改，见“变体”。

## 示例 {#example}

问题：Chen Yu（顾客 5）的订单 15（3 个 USB-C Hub，状态 paid）要取消。订单状态改成 cancelled，三个 USB-C Hub 回到库存。两件事必须一起发生。

1. **`BEGIN` 开始事务。**
2. **改订单状态。** 按主键更新一行。
3. **把明细里的件数加回库存。** 用上一篇的 `UPDATE … FROM`，按这笔订单的每一行明细加回对应商品的库存。
4. **`COMMIT` 确认。** 两条 `UPDATE` 中只要有一条出错，事务就作废，订单不会出现“已取消、库存却没回来”的状态。
5. **查看结果。**

```sql run
BEGIN;

UPDATE orders
SET status = 'cancelled'
WHERE id = 15;

UPDATE products AS p
SET stock = p.stock + i.quantity
FROM order_items AS i
WHERE i.product_id = p.id
  AND i.order_id = 15;

COMMIT;

SELECT o.id, o.status, p.name, p.stock
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
JOIN products AS p ON p.id = i.product_id
WHERE o.id = 15;
```

USB-C Hub 的库存从 60 变成了 63。

## 变体 {#variants}

**用 `ROLLBACK` 做一次试验。** 想看看全场涨价 10% 后最贵的商品要多少钱，但不想真的改：

```sql run
BEGIN;
UPDATE products SET price = round(price * 1.1, 2);
SELECT max(price) AS new_max FROM products;
ROLLBACK;
SELECT max(price) AS real_max FROM products;
```

事务里看到的是 438.90，回滚之后还是 399.00。

**保存点：只撤销一部分。** 给 4K Monitor 补货 10 件，然后试着打五折；改主意了，只撤销打折，补货保留：

```sql run
BEGIN;
UPDATE products SET stock = stock + 10 WHERE id = 7;
SAVEPOINT before_discount;
UPDATE products SET price = price * 0.5 WHERE id = 7;
ROLLBACK TO SAVEPOINT before_discount;
COMMIT;

SELECT name, price, stock FROM products WHERE id = 7;
```

价格还是 399.00，库存从 0 变成了 10。{{Term:savepoint}}就像事务中间的存档点：`ROLLBACK TO` 回到这个存档，之前的修改不受影响，事务也继续进行。

## 深入 {#deeper}

**ACID。** 数据库对事务做出四项保证，取它们英文的首字母，合称 ACID：

| 字母 | 名称 | 保证什么 | 本篇里的例子 |
|---|---|---|---|
| A | {{term:atomicity}} | 事务里的修改要么全部生效，要么全部不生效 | 取消订单的两条 `UPDATE` 不会只做一半 |
| C | {{term:consistency}} | 事务结束时，所有约束都被满足 | 库存减成负数的事务无法提交 |
| I | {{term:isolation}} | 同时进行的事务互不干扰，像是一个接一个执行 | 别人看不到你还没提交的修改 |
| D | {{term:durability}} | 一旦提交，修改就不会丢，即使马上断电 | `COMMIT` 返回之后，订单 25 就安全了 |

**隔离有不同的程度。** 完全的隔离代价很高，所以数据库提供几种{{term:isolation-level}}，在正确性和速度之间取舍。PostgreSQL 默认是 `read committed`。`current_setting` 函数读出数据库当前的某一项设置，括号里写设置的名字：

```sql run
SELECT current_setting('transaction_isolation');
```

| 隔离级别 | 能看到别人已经提交的新数据吗 | 说明 |
|---|---|---|
| `READ COMMITTED`（默认） | 能，每条语句开始时看一次 | 同一个事务里两次查询，结果可能不同 |
| `REPEATABLE READ` | 不能，整个事务看的是开始时的快照 | 同一个事务里两次查询结果一样 |
| `SERIALIZABLE` | 不能，并且会拒绝无法排成先后顺序的事务 | 最安全；被拒绝的事务要重试 |

PostgreSQL 在任何级别都不会让你读到别人**还没提交**的数据。指定级别的写法是 `BEGIN ISOLATION LEVEL SERIALIZABLE`。SQL Lab 里只有你一个连接，看不到这些差别；在多人同时修改同一批数据的系统里，它们才重要。

**事务要短。** 一个事务修改了某一行，在提交之前，其他想修改同一行的事务只能等着。事务开得越久，别人等得越久。不要在事务中间等待用户输入。

**`now()` 在事务里不变。** `now()` 返回的是事务开始的时间，同一个事务里调用多少次都一样。需要真实的当前时间，用 `clock_timestamp()`。

## 常见错误 {#mistakes}

**1. 以为写了 `BEGIN`，出错时前面的修改还在。** 事务里一条语句出错，整个事务就作废了。在 SQL Lab 里，运行会停在第一个错误；在真实的数据库里，之后的语句都会被拒绝，最后的 `COMMIT` 实际执行的是回滚：

```sql run error
BEGIN;
UPDATE products SET stock = stock - 30 WHERE id = 1;
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (22, 1, 30, 42.00);
COMMIT;
```

第一条 `UPDATE` 就违反了检查约束，库存只有 25 件。这正是我们想要的：库存不够，订单明细也不应该写进去。

**2. 忘了 `COMMIT`。** `BEGIN` 之后一直没有 `COMMIT`，在你自己的连接里能看到修改，别人却看不到；连接一断，修改就全部丢失。每个 `BEGIN` 都要有一个对应的 `COMMIT` 或 `ROLLBACK`。

**3. 回到不存在的保存点。**

```sql run error
BEGIN;
UPDATE products SET stock = 0 WHERE id = 3;
ROLLBACK TO SAVEPOINT before_change;
```

`savepoint "before_change" does not exist`：在回滚之前，必须先用 `SAVEPOINT before_change` 做好标记。已经 `RELEASE` 的保存点也回不去了。

**4. 在事务外面用保存点。** 没有 `BEGIN` 就写 `SAVEPOINT a`，会报 `SAVEPOINT can only be used in transaction blocks`。保存点是事务内部的标记。

**5. 以为 `ROLLBACK` 能撤销已经提交的事务。** `COMMIT` 之后再 `ROLLBACK`，什么也不会发生；PostgreSQL 只给一个警告“没有正在进行的事务”。已经提交的修改只能用新的语句改回来，或者从备份恢复。

## 小结 {#summary}

- 事务把几条语句绑成一个整体：`BEGIN` 开始，`COMMIT` 生效，`ROLLBACK` 撤销。
- 事务里任何一条语句出错，整个事务作废，只能回滚。
- 没写 `BEGIN` 时，每条语句自己就是一个事务，成功就自动提交。
- `SAVEPOINT` 和 `ROLLBACK TO` 可以只撤销事务的一部分。
- ACID：原子性、一致性、隔离性、持久性；PostgreSQL 默认的隔离级别是 read committed。
