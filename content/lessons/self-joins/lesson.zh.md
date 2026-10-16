## 为什么需要它 {#why}

“每位顾客是被谁推荐来的？”第 0 章讲过，`customers.referred_by` 是一个{{term:self-reference}}：它存的是推荐人的顾客编号，而推荐人也在 `customers` 里。

```sql run
SELECT id, name, referred_by
FROM customers
ORDER BY id;
```

Kenji Sato 的 `referred_by` 是 1，可 1 是谁？要把编号换成名字，得到同一张表里再找一次。前面的连接都是两张不同的表，这次两边是同一张。

## 核心概念 {#core}

{{Term:self-join}}就是一张表和它自己连接。语法上没有任何新东西，关键是**把同一张表当成两张来用**：给它起两个不同的{{term:alias}}，每个别名代表一种角色。

```sql run
SELECT c.name AS customer, r.name AS referred_by
FROM customers AS c
JOIN customers AS r ON r.id = c.referred_by
ORDER BY c.id;
```

`c` 是“被推荐的顾客”，`r` 是“推荐人”。连接条件读作：推荐人的编号，等于这位顾客记下的推荐人编号。数据库把 `customers` 读两遍，像对待两张表一样配对。

8 行：12 位顾客里有 4 位的 `referred_by` 是 NULL，内连接配不上，就被丢掉了。

别名在这里是必需的。两边都叫 `customers`，数据库分不清 `customers.id` 指的是哪一边。

## 语法 {#syntax}

自连接没有新的关键字，用的就是前两课的格式。不同之处在于同一个 `table_name` 出现了两次，别名从“可以省略”变成了“必须写”：

```syntax
FROM table_name AS alias
    [ LEFT ] JOIN table_name AS other_alias ON condition
```

| 部分 | 填什么 | 规则 |
|---|---|---|
| 两个 `table_name` | 同一张表 | 两处写的是同一个表名 |
| `alias`、`other_alias` | 代表两种角色的别名，比如 `c`（顾客）和 `r`（推荐人） | 必须写，而且必须不同 |
| `condition` | 两个别名之间的关系 | 两边要来自不同的别名 |
| `LEFT` | 保留在另一边找不到对应行的记录 | 可以省略 |

对照格式读几条：

- `FROM customers AS c JOIN customers AS r ON r.id = c.referred_by`：两个别名，条件沿着自引用外键。
- `FROM customers AS c LEFT JOIN customers AS r ON …`：加了 `LEFT`，没有推荐人的顾客也保留。
- `FROM customers AS a JOIN customers AS b ON a.city = b.city AND a.id < b.id`：条件不是外键，而是两个比较的 `AND`。

## 示例 {#example}

问题：列出每一位顾客和推荐人的名字，没有推荐人的顾客也要列出。

1. **给两种角色起名字。** `c` 是顾客，`r` 是推荐人。
2. **写连接条件。** `c.referred_by` 指向推荐人的 `id`：`r.id = c.referred_by`。条件的方向决定了谁是谁，写反了意思就完全不同。
3. **决定保留谁。** 每位顾客都要出现，所以用上一篇的 `LEFT JOIN`。
4. **区分同名的列。** 两边都有 `name`，起别名 `customer` 和 `referred_by`。

```sql run
SELECT c.name AS customer, r.name AS referred_by
FROM customers AS c
LEFT JOIN customers AS r ON r.id = c.referred_by
ORDER BY c.id;
```

12 行，Lin Wei、Ava Thompson、Priya Nair 和 Lucas Silva 的推荐人是 NULL。

## 变体 {#variants}

**反过来看：每位推荐人推荐了几位顾客。** 方向不变，按推荐人分组计数，用的是第 3 章的 `GROUP BY`：

```sql run
SELECT r.name AS referrer, count(*) AS referrals
FROM customers AS c
JOIN customers AS r ON r.id = c.referred_by
GROUP BY r.id, r.name
ORDER BY referrals DESC, r.name;
```

**沿着关系再走一步。** 推荐人的推荐人：再连一次 `customers`，起第三个别名：

```sql run
SELECT c.name AS customer, r.name AS referrer, rr.name AS referrers_referrer
FROM customers AS c
JOIN customers AS r ON r.id = c.referred_by
JOIN customers AS rr ON rr.id = r.referred_by;
```

想一直往上追到源头，层数不固定，就需要第 6 章的递归 CTE。

**同一张表里两两配对。** 自连接不一定沿着外键。住在同一座城市的顾客有哪几对？

```sql run
SELECT a.name, b.name, a.city
FROM customers AS a
JOIN customers AS b ON a.city = b.city AND a.id < b.id
ORDER BY a.city;
```

3 对。`a.id < b.id` 有两个作用：去掉“自己和自己”的配对，也让每一对只出现一次。

## 深入 {#deeper}

**为什么要 `a.id < b.id`？** 只写 `a.city = b.city`，每位顾客都会和自己配对，同一对顾客还会以 (A, B) 和 (B, A) 出现两次：

```sql run
SELECT count(*) AS pairs
FROM customers AS a
JOIN customers AS b ON a.city = b.city;
```

16 行：10 位城市已知的顾客各和自己配对一次，再加上 3 对顾客各出现两次。改成 `a.id <> b.id`，会去掉自己和自己，但每对仍有两行，共 6 行；`a.id < b.id` 才是 3 行。城市为 NULL 的两位顾客不会配对，连和自己都不会，因为 `NULL = NULL` 不是 true。

**在同一张表里比较两行。** 把条件写进 `WHERE`，就能比较配对的两行。和推荐人住在同一个国家的顾客：

```sql run
SELECT c.name AS customer, r.name AS referrer, c.country
FROM customers AS c
JOIN customers AS r ON r.id = c.referred_by
WHERE c.country = r.country;
```

**自连接到处都有。** 员工和经理、分类和父分类、航班的起点和终点城市，凡是一张表的某列指向同一张表，或者需要把同一张表的两行放在一起比较，都会用到它。

## 常见错误 {#mistakes}

**1. 不起别名。**

```sql run error
SELECT name
FROM customers
JOIN customers ON customers.id = customers.referred_by;
```

PostgreSQL 报 `table name "customers" specified more than once`。同一张表出现两次，必须用两个不同的别名区分。

**2. 两边用了同一个别名。** `ON c.id = c.referred_by` 语法正确，却是在问“哪位顾客推荐了自己”。结果是 0 行，也没有报错。连接条件的两边必须来自不同的别名。

**3. 方向写反。** `ON r.referred_by = c.id` 也能运行，但现在 `r` 成了被 `c` 推荐的人，`SELECT c.name, r.name` 列出的是“推荐人 → 被推荐人”。写之前先用一句话说清楚每个别名代表谁，再检查条件是否符合这句话。

**4. 配对重复或者包含自己。** 两两配对时忘了 `a.id < b.id`，结果会有自己和自己的配对，每对还会出现两次。

**5. 用内连接时忘了没有推荐人的顾客。** `JOIN` 会丢掉 `referred_by` 为 NULL 的行。题目要“每一位顾客”时，用 `LEFT JOIN`。

## 小结 {#summary}

- 自连接是一张表和自己连接，给同一张表起两个别名，每个别名代表一种角色。
- 沿自引用外键连接时，条件的方向决定了谁是谁：`r.id = c.referred_by` 表示 `r` 推荐了 `c`。
- 要保留没有对应行的记录，用 `LEFT JOIN`；要继续往上走一层，再连一次表。
- 两两配对时用 `a.id < b.id`，去掉自己和自己的配对，也让每对只出现一次。
- 不起别名会报错；同一个别名用在条件两边，不会报错，但意思错了。
