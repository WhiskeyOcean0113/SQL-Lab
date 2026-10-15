## 为什么需要它 {#why}

“哪些顾客下过至少 3 笔订单？”上一篇你已经会数每位顾客的订单了，现在只想留下数量够多的那些。最自然的想法是把条件写进 `WHERE`：

```sql run error
SELECT customer_id, count(*) AS orders
FROM orders
WHERE count(*) >= 3
GROUP BY customer_id;
```

报错了。这一篇讲为什么，以及条件应该放在哪里。

## 核心概念 {#core}

`WHERE` 和 `HAVING` 都是筛选，区别在于**筛选的对象和时机**：

| | 筛选什么 | 什么时候执行 | 能用聚合函数吗 |
|---|---|---|---|
| `WHERE` | 单独的行 | 分组之前 | 不能 |
| `HAVING` | 整个组 | 分组和聚合之后 | 能 |

放进{{term:logical-order}}里：

`FROM` → `WHERE` → `GROUP BY` → **`HAVING`** → `SELECT` → `ORDER BY`

`WHERE` 执行时，行还没有分组，`count(*)` 根本还没算出来，所以不能用。`HAVING` 在聚合之后执行，每组的汇总值已经有了：

```sql run
SELECT customer_id, count(*) AS orders
FROM orders
GROUP BY customer_id
HAVING count(*) >= 3
ORDER BY customer_id;
```

10 组里有 3 组满足条件。`HAVING` 去掉的是整组，而不是组里的某几行。

## 示例 {#example}

问题：哪些分类里至少有 2 件低于 50 美元的商品？

1. **拆出条件。** 有两个：“低于 50 美元”和“至少 2 件”。
2. **逐个判断它说的是一行还是一组。** “低于 50 美元”是单件商品的属性，看一行就能判断，放 `WHERE`。“至少 2 件”要先数一组里有几件，放 `HAVING`。
3. **按执行顺序写。** 先 `WHERE` 留下便宜的商品，再按分类分组，最后 `HAVING` 留下数量够的组。

```sql run
SELECT category_id, count(*) AS cheap_products
FROM products
WHERE price < 50
GROUP BY category_id
HAVING count(*) >= 2
ORDER BY category_id;
```

4 个分类。Electronics（编号 2）不在里面：它有 4 件商品，但低于 50 美元的只有 USB-C Hub 一件。

## 变体 {#variants}

**`HAVING` 里的聚合不必出现在 `SELECT` 里。** 哪些状态涉及至少 4 位不同的顾客？结果只显示订单数，筛选却按顾客数：

```sql run
SELECT status, count(*) AS orders
FROM orders
GROUP BY status
HAVING count(DISTINCT customer_id) >= 4;
```

**`WHERE` 和 `HAVING` 一起用时，`WHERE` 会改变 `HAVING` 数到的东西。** 只算没有取消的订单，至少 3 笔的顾客：

```sql run
SELECT customer_id, count(*) AS orders
FROM orders
WHERE status <> 'cancelled'
GROUP BY customer_id
HAVING count(*) >= 3
ORDER BY customer_id;
```

比核心概念里的结果少了顾客 3：顾客 3 的 3 笔订单里有 1 笔取消了，`WHERE` 先把它去掉，剩下 2 笔，不够 3 笔。

**没有 `GROUP BY` 的 `HAVING`。** 这时整张表是一组，结果要么是一行，要么一行都没有：

```sql run
SELECT count(*) AS orders
FROM orders
HAVING count(*) > 100;
```

0 行。这和上上篇“有聚合就永远是一行”的规则不矛盾：那一行是先算出来的，然后被 `HAVING` 去掉了。

## 深入 {#deeper}

**`HAVING` 不能用 `SELECT` 里的别名。** 别名在 `SELECT` 这一步才产生，而 `HAVING` 排在它前面：

```sql run error
SELECT customer_id, count(*) AS n
FROM orders
GROUP BY customer_id
HAVING n >= 3;
```

把聚合再写一遍：`HAVING count(*) >= 3`。MySQL 允许在 `HAVING` 里用别名，所以在别处学过 SQL 的人常在这里出错；标准 SQL 和 PostgreSQL 不允许。

**能放 `WHERE` 的条件，就放 `WHERE`。** 关于分组列的条件，写在 `HAVING` 里也能得到同样的结果，比如 `HAVING customer_id <= 3`。但这样数据库要先把所有行分好组、算完聚合，再把大部分组扔掉。写在 `WHERE` 里，不要的行一开始就被排除，意思也更清楚：`WHERE` 管行，`HAVING` 管组。

**`HAVING` 里的普通列也必须是分组列。** 和 `SELECT` 一样，分组之后每组只剩一行，不是分组列的列在组里有很多个值。

## 常见错误 {#mistakes}

**1. 把聚合条件写进 `WHERE`。** 见“为什么需要它”：`WHERE count(*) >= 3` 会报错。对汇总值的条件写在 `HAVING` 里。

**2. 把单行的条件写进 `HAVING`。**

```sql run error
SELECT customer_id, count(*) AS orders
FROM orders
GROUP BY customer_id
HAVING status = 'delivered';
```

`status` 不是分组列，到 `HAVING` 时它在每组里有很多个值。“只算已送达的订单”说的是单行，要写在 `WHERE` 里。

**3. 在 `HAVING` 里用别名。** 见“深入”：PostgreSQL 会报 `column "n" does not exist`。

**4. 漏了 `WHERE`，悄悄改变了意思。** “至少 3 笔未取消的订单”要先用 `WHERE` 去掉取消的订单，再分组去数。只写 `HAVING count(*) >= 3`，取消的订单也会被数进去，顾客 3 就多出来了，而且不会有任何报错。写之前先问自己：这个条件是在数之前用，还是数完之后用？

## 小结 {#summary}

- `WHERE` 在分组之前筛选单行，不能用聚合函数；`HAVING` 在聚合之后筛选整组，可以用聚合函数。
- 顺序是 `FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY`。
- 判断方法：看一行就能决定的条件放 `WHERE`，要先汇总一组才能决定的放 `HAVING`。
- `WHERE` 会改变 `HAVING` 数到的行；`HAVING` 不能用 `SELECT` 的别名。
- 没有 `GROUP BY` 时，`HAVING` 把整张表当一组，结果可能是 0 行。
