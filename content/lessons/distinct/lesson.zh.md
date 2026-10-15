## 为什么需要它 {#why}

"shop 的顾客来自哪些国家？"直接查 `country` 会得到 12 行，China 出现三次，Canada 和 Japan 各出现两次：

```sql run
SELECT country
FROM customers;
```

你想要的是一份不重复的国家名单。`DISTINCT` 就是做这个的。

## 核心概念 {#core}

`SELECT DISTINCT` 会去掉结果中的{{term:duplicate-row}}，每一种行只保留一次：

```sql run
SELECT DISTINCT country
FROM customers;
```

8 个国家。

关键在于：**`DISTINCT` 比较的是整行，也就是选择列表里的所有列一起比较。** 只有所有列都相同的两行，才算重复。

在逻辑顺序里，`DISTINCT` 排在 `SELECT` 之后、`ORDER BY` 之前：先算出要输出的列，再去重，最后排序。

## 示例 {#example}

问题：顾客分布在哪些"国家 + 城市"的组合里？

1. **确定要比较的是哪几列。** 国家和城市，两列一起。
2. **把这两列都写进选择列表。** `DISTINCT` 会对两列的组合去重。
3. **想一想 NULL。** 城市未知的顾客怎么算？

```sql run
SELECT DISTINCT country, city
FROM customers;
```

9 行，比单独去重的国家（8 个）多一行：China 有两个组合，China + Shanghai 和 China + Beijing。Ireland + NULL 和 Brazil + NULL 各算一行。

对比只按城市去重：

```sql run
SELECT DISTINCT city
FROM customers;
```

也是 8 行，其中包括一行 NULL。两位城市未知的顾客合并成了一行。

## 变体 {#variants}

**`DISTINCT` 加排序。** 去重之后再排序，结果更好读：

```sql run
SELECT DISTINCT status
FROM orders
ORDER BY status;
```

**找出"出现过"的值。** 哪些顾客下过订单？`orders` 里每笔订单都有 `customer_id`，去重之后就是下过单的顾客：

```sql run
SELECT DISTINCT customer_id
FROM orders
ORDER BY customer_id;
```

10 位顾客，正好缺了从没下过单的 11 和 12。

**`ALL` 是默认值。** `SELECT ALL country` 和 `SELECT country` 一样，保留所有行。几乎没有人写 `ALL`，但知道它存在有助于理解：不去重才是常态，`DISTINCT` 是你主动要求的额外一步。

## 深入 {#deeper}

**`DISTINCT` 把 NULL 当作相同的值。** 讲 NULL 的那一篇说过，`NULL = NULL` 的结果是 unknown。但去重时，SQL 规定所有 NULL 算作同一个值，所以 `SELECT DISTINCT city` 只有一行 NULL。规则看起来不一致，但它很实用：你通常希望"未知"在名单里只出现一次。

**排序列必须出现在选择列表里。** 下面这条查询会报错：

```sql run error
SELECT DISTINCT status
FROM orders
ORDER BY ordered_at;
```

原因要回到逻辑顺序：去重之后，每个 `status` 只剩一行，而一个 `status` 对应很多个不同的 `ordered_at`，数据库不知道该按哪一个排。所以 PostgreSQL 要求 `SELECT DISTINCT` 的 `ORDER BY` 只能使用选择列表里的表达式。

**`DISTINCT ON`。** PostgreSQL 有一个扩展：`DISTINCT ON (列)` 对指定的列去重，每组只保留排在第一的那一行。比如每个国家最早注册的顾客：

```sql run
SELECT DISTINCT ON (country) country, name, joined_on
FROM customers
ORDER BY country, joined_on;
```

`DISTINCT ON` 的列必须和 `ORDER BY` 最左边的列一致，而"第一行"由后面的排序键决定。它不是标准 SQL；第 6 章的窗口函数能用标准的方式做到同样的事。

**`DISTINCT` 不是万能的修补。** 第 4 章学 join 时会看到，连接方式不对会让行重复。用 `DISTINCT` 把重复的行藏起来，往往掩盖了真正的错误。看到意料之外的重复，先找出它从哪里来。

## 常见错误 {#mistakes}

**1. 以为 `DISTINCT` 只作用于紧跟着它的那一列。** 加了括号也一样：

```sql run
SELECT DISTINCT (country), city
FROM customers;
```

仍然是 9 行，因为 `(country)` 只是把一列加了括号，`DISTINCT` 依旧比较 `country` 和 `city` 两列的组合。`DISTINCT` 永远作用于整个选择列表。

**2. 想去重却多选了一列。** 只想要国家名单，却顺手选了 `name`：`SELECT DISTINCT country, name` 会返回 12 行，因为每位顾客的名字都不同，没有任何两行完全相同。选择列表里只放用来去重的列。

**3. `ORDER BY` 用了不在选择列表里的列。** 见上面的"深入"：`SELECT DISTINCT` 时，排序只能用选出来的列。

**4. 用 `DISTINCT` 掩盖重复。** 当结果出现了不该有的重复，`DISTINCT` 能让它"看起来对"，但重复背后的原因还在。先弄清楚为什么重复。

## 小结 {#summary}

- `SELECT DISTINCT` 去掉重复的行，每种行只保留一次。
- "重复"指选择列表里所有列都相同，`DISTINCT` 永远作用于整行。
- 去重时所有 NULL 被看作同一个值。
- `SELECT DISTINCT` 的 `ORDER BY` 只能使用选择列表里的表达式。
- PostgreSQL 的 `DISTINCT ON (列)` 对指定列去重，并保留排序后的第一行。
