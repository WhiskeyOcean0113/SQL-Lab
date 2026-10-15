## 为什么需要它 {#why}

shop 有 12 位顾客，其中 2 位住在 Shanghai。那么“不住在 Shanghai 的顾客”应该有几位？

```sql run
SELECT name, city
FROM customers
WHERE city <> 'Shanghai';
```

答案是 8 位，而不是 10 位。Liam O'Brien 和 Lucas Silva 不见了，因为这两位顾客的 `city` 是 {{term:null}}。没有报错，也没有警告，两行就这样悄悄消失了。NULL 是 SQL 里最容易让人困惑的概念之一，这一篇就来彻底弄清它。

## 核心概念 {#core}

NULL 表示“值未知”或“没有值”。关键在于：**任何值和 NULL 比较，结果都不是 true 或 false，而是 unknown。**

- `'Shanghai' <> NULL` 是 unknown：城市未知，你没法说它不是 Shanghai。
- `NULL = NULL` 也是 unknown：两个未知的值是否相等，同样未知。

于是 SQL 的逻辑不是两值（true、false），而是{{term:three-valued-logic}}：true、false、unknown。

**`WHERE` 只留下结果为 true 的行。** false 和 unknown 都会被丢掉。这就是开头那两位顾客消失的原因。

要判断一个值是不是 NULL，不能用 `=`，而要用专门的 `IS NULL` 和 `IS NOT NULL`，它们的结果只会是 true 或 false：

```sql run
SELECT name, email
FROM customers
WHERE email IS NULL;
```

## 示例 {#example}

问题：哪些订单已经付款或下单、但还没有发货？（已取消的订单不算。）

1. **找出表示“还没发货”的列。** `shipped_at` 为 NULL 表示还没有发货时间。
2. **用 `IS NULL` 判断，而不是 `= NULL`。**
3. **排除已取消的订单。** 取消的订单 `shipped_at` 也是 NULL，所以再加一个条件。
4. **用 `AND` 组合。**

```sql run
SELECT id, status, shipped_at
FROM orders
WHERE shipped_at IS NULL AND status <> 'cancelled';
```

8 笔订单，状态都是 paid 或 pending。

**三值逻辑的{{term:truth-table}}。** 当某个条件是 unknown 时，`AND`、`OR`、`NOT` 按下面的规则计算（U 表示 unknown）：

| A | B | A AND B | A OR B |
|---|---|---|---|
| true | U | U | true |
| false | U | false | U |
| U | U | U | U |

`NOT U` 仍是 U。记忆方法：把 unknown 想成“可能真也可能假”。`false AND U` 不管 U 是什么都是 false；`true OR U` 不管 U 是什么都是 true；其余情况都定不下来，所以是 unknown。

```sql run
SELECT NULL = NULL AS equal, NULL AND false AS and_false, NULL OR true AS or_true, 1 + NULL AS plus;
```

最后一列说明：**NULL 参与算术运算，结果也是 NULL。**

## 变体 {#variants}

**把 NULL 算进“不等于”。** 想要“不住在 Shanghai 的顾客，包括城市未知的”，有两种写法：

```sql run
SELECT name, city
FROM customers
WHERE city <> 'Shanghai' OR city IS NULL;
```

或者用 `IS DISTINCT FROM`，它把 NULL 当成一个普通的值来比较：

```sql run
SELECT name, city
FROM customers
WHERE city IS DISTINCT FROM 'Shanghai';
```

两种写法都返回 10 行。`IS DISTINCT FROM` 是 SQL 标准的一部分，`IS NOT DISTINCT FROM` 则是“把两个 NULL 视为相等”的等于。

**`IS NOT NULL`**：只要有值的行。

```sql run
SELECT name, city
FROM customers
WHERE city IS NOT NULL;
```

## 深入 {#deeper}

**`NOT IN` 遇到 NULL。** 上一篇留下的问题：

```sql run
SELECT name, city
FROM customers
WHERE city NOT IN ('Shanghai', NULL);
```

0 行。`city NOT IN ('Shanghai', NULL)` 等于 `city <> 'Shanghai' AND city <> NULL`。后半句永远是 unknown，于是整个条件最好也只能是 unknown，永远不会是 true。第 5 章用子查询写 `NOT IN` 时，如果子查询返回了 NULL，会遇到一模一样的陷阱。

**NULL 和唯一约束、外键。** 第 0 章讲过：唯一约束允许多个 NULL，外键列可以是 NULL。原因是同一个：两个 NULL 不算“相等”。

**为什么不用 `= NULL`。** PostgreSQL 文档特别提醒：不要写 `expression = NULL`，因为 NULL 不“等于” NULL。数据库有一个兼容旧程序的设置 `transform_null_equals`，会把 `= NULL` 改写成 `IS NULL`，但它默认关闭，也不应该依赖它。

**NULL 在其他子句里的表现。** `ORDER BY` 时，PostgreSQL 默认把 NULL 排在升序的最后（下一篇）；`DISTINCT` 时，所有 NULL 被看作同一个值（下下篇）；聚合函数会忽略 NULL（第 3 章）。规则各不相同，遇到时一一记住。

## 常见错误 {#mistakes}

**1. 用 `= NULL` 找空值。** 这是从编程语言带来的习惯，在 SQL 里它找不到任何行：

```sql run
SELECT name
FROM customers
WHERE email = NULL;
```

0 行，没有报错。永远用 `IS NULL`。

**2. 以为 `<>` 会包含 NULL。** 见开头的例子：`city <> 'Shanghai'` 不包含城市未知的顾客。如果题目的意思包含这些顾客，就加上 `OR city IS NULL`，或者用 `IS DISTINCT FROM`。

**3. 把 NULL 当成 0 或空字符串。** `stock` 为 NULL 不是“库存为 0”，而是“不知道库存”。NULL 加任何数都是 NULL，不是那个数本身。

**4. 在 `NOT IN` 的列表里放 NULL。** 结果永远是空的。

**5. 忘了 NULL 可能出现。** 写条件之前，先想一想这一列有没有 NULL。看表结构时，没有 `NOT NULL` 约束的列都可能是 NULL。

## 小结 {#summary}

- NULL 表示未知；任何值和 NULL 比较，结果都是 unknown。
- SQL 使用三值逻辑：true、false、unknown；`WHERE` 只留下 true。
- 判断 NULL 用 `IS NULL` / `IS NOT NULL`，绝不用 `= NULL`。
- `<>` 不包含 NULL；需要时加上 `OR ... IS NULL`，或用 `IS DISTINCT FROM`。
- `NOT IN` 的列表里有 NULL 时，结果永远为空。
