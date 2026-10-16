## 为什么需要它 {#why}

Lin Wei 是 shop 最早的顾客之一。ta 推荐了几位朋友，朋友又推荐了朋友。市场部想知道：Lin Wei 直接或间接带来了哪些顾客？

第 4 章的{{term:self-join}}一次只能走一层：连接一次找到 Lin Wei 推荐的人，再连接一次找到这些人推荐的人。推荐链有几层，就得连接几次，而层数事先不知道，以后还会变长。这种“一层套一层、深度不定”的数据叫{{term:hierarchy}}，需要一种能自己一直走下去、走到头就停的查询。

## 核心概念 {#core}

### 两部分：起点和下一步

{{Term:recursive-cte}}由 `UNION ALL` 连起来的两条查询组成：

- **{{term:non-recursive-term}}**：起点，只执行一次。比如“Lin Wei 本人”。
- **{{term:recursive-term}}**：从上一步得到的行出发，找出下一步的行。它在 `FROM` 里引用 CTE 自己的名字，比如“被上一步那些人推荐的顾客”。

先看一个最简单的例子，从 1 数到 5：

```sql run
WITH RECURSIVE n AS (
  SELECT 1 AS i
  UNION ALL
  SELECT i + 1 FROM n WHERE i < 5
)
SELECT i FROM n;
```

### 一轮一轮地执行

数据库不是真的“自己调用自己”，而是一轮一轮地循环。它把上一轮新得到的行放在一张{{term:working-table}}里：

| 轮次 | 工作表里的行 | 递归项这一轮产生 |
|---|---|---|
| 起点 | | `1`（非递归项） |
| 第 1 轮 | `1` | `2` |
| 第 2 轮 | `2` | `3` |
| 第 3 轮 | `3` | `4` |
| 第 4 轮 | `4` | `5` |
| 第 5 轮 | `5` | 没有行：`5 < 5` 不成立 |

每一轮，递归项里的 `n` 指的只是**上一轮新产生的那些行**，不是到目前为止的全部结果。某一轮一行都没产生，循环就停止。最终结果是所有轮次产生的行合在一起：1 到 5。

所以递归项里必须有一个总会让它停下来的条件。这里是 `WHERE i < 5`；在推荐链里，是“走到没有人再推荐别人的时候”。

## 语法 {#syntax}

```syntax
WITH RECURSIVE cte_name [ ( column_name [, …] ) ] AS (
    select_statement
    UNION [ ALL ]
    select_statement
)
select_statement
```

| 部分 | 填什么 | 规则 |
|---|---|---|
| `RECURSIVE` | 固定的关键字 | 只要 `WITH` 里有一个 CTE 引用了自己，就必须写；写在 `WITH` 后面，整个列表只写一次 |
| 第一个 `select_statement` | 非递归项：起点 | 不能引用 `cte_name`；它的列决定了整个 CTE 的列名和类型 |
| `UNION [ ALL ]` | 把两部分连起来 | 通常用 `UNION ALL`；用 `UNION` 会去掉和已有结果重复的行 |
| 第二个 `select_statement` | 递归项：下一步 | 在 `FROM` 里引用 `cte_name` 一次；不能用聚合函数；列数和类型要和起点一致 |
| 最后的 `select_statement` | 主查询 | 和普通 CTE 一样，从 `cte_name` 里取结果 |

对照格式读核心概念里的查询：`cte_name` 是 `n`；起点是 `SELECT 1 AS i`，它决定了唯一的列叫 `i`、类型是整数；递归项 `SELECT i + 1 FROM n WHERE i < 5` 引用了 `n`，`WHERE` 负责让它停下来；主查询是 `SELECT i FROM n`。

## 示例 {#example}

问题：Lin Wei（顾客 1）直接或间接推荐来的所有顾客，以及每个人离 Lin Wei 隔了几层。

1. **起点：Lin Wei 本人，层数 0。** 非递归项选出顾客 1，再加一列常量 `0 AS depth`。
2. **下一步：被上一轮的人推荐的顾客。** 把 `customers` 和 CTE 自己连接，条件是 `c.referred_by = r.id`：顾客 `c` 的推荐人就是上一轮的某个人 `r`。层数加 1。
3. **什么时候停？** 走到一轮里没有人再推荐别人时，连接找不到任何行，循环自动结束。这里不需要额外的 `WHERE`。
4. **主查询按层数排序。**

```sql run
WITH RECURSIVE referrals AS (
  SELECT id, name, referred_by, 0 AS depth
  FROM customers
  WHERE id = 1
  UNION ALL
  SELECT c.id, c.name, c.referred_by, r.depth + 1
  FROM customers AS c
  JOIN referrals AS r ON c.referred_by = r.id
)
SELECT id, name, referred_by, depth
FROM referrals
ORDER BY depth, id;
```

第 1 轮找到 Kenji Sato 和 Chen Yu，第 2 轮找到 Zhang Min 和 Mei Tanaka，第 3 轮没人了。推荐链以后再长出第 3 层、第 4 层，这条查询一个字都不用改。

## 变体 {#variants}

**往上走：一个人的推荐链。** 把连接条件反过来，就是从某个人出发，一路找推荐人的推荐人。Mei Tanaka（顾客 12）是怎么来的：

```sql run
WITH RECURSIVE chain AS (
  SELECT id, name, referred_by, 0 AS steps
  FROM customers
  WHERE id = 12
  UNION ALL
  SELECT c.id, c.name, c.referred_by, ch.steps + 1
  FROM customers AS c
  JOIN chain AS ch ON c.id = ch.referred_by
)
SELECT id, name, steps FROM chain ORDER BY steps;
```

往下走是 `c.referred_by = r.id`（“c 的推荐人是 r”），往上走是 `c.id = ch.referred_by`（“c 就是 ch 的推荐人”）。走到 Lin Wei 时，`referred_by` 是 NULL，连接找不到行，循环停止。

**从所有起点出发，记下路径。** 起点不一定只有一行。从所有没有推荐人的顾客出发，用字符串拼出一路走来的路径：

```sql run
WITH RECURSIVE tree AS (
  SELECT id, name, name AS path
  FROM customers
  WHERE referred_by IS NULL
  UNION ALL
  SELECT c.id, c.name, t.path || ' > ' || c.name
  FROM customers AS c
  JOIN tree AS t ON c.referred_by = t.id
)
SELECT path FROM tree ORDER BY path;
```

按 `path` 排序，正好把整棵推荐树按层次排好，每个人都紧跟在推荐人的下面。

**生成一串连续的值。** 递归 CTE 不一定要读表。从 2024 年 1 月开始，每轮加一个月，生成一份月历，再用 `LEFT JOIN` 接上订单，没有订单的月份显示 0：

```sql run
WITH RECURSIVE months AS (
  SELECT DATE '2024-01-01' AS month
  UNION ALL
  SELECT (month + INTERVAL '1 month')::date
  FROM months
  WHERE month < DATE '2024-08-01'
)
SELECT m.month, count(o.id) AS orders
FROM months AS m
LEFT JOIN orders AS o ON date_trunc('month', o.ordered_at) = m.month
GROUP BY m.month
ORDER BY m.month;
```

在 PostgreSQL 里，第 4 章的 `generate_series` 做同样的事更简单；但其他数据库不一定有这个函数，递归 CTE 是通用的写法。

## 深入 {#deeper}

**列的类型由起点决定。** 递归项算出的值必须能放进起点定义的类型里：

```sql run error
WITH RECURSIVE p AS (
  SELECT id, price FROM products WHERE id = 3
  UNION ALL
  SELECT id, price * 2 FROM p WHERE price < 100
)
SELECT * FROM p;
```

`price` 在表里是 `numeric(8, 2)`，`price * 2` 的类型却是不限位数的 `numeric`，于是报错 `column 2 has type numeric(8,2) in non-recursive term but type numeric overall`。HINT 给出了解法：在起点里转换类型，写成 `price::numeric`。

**遇到{{term:cycle}}会怎样？** shop 的推荐关系不会绕回去。但如果 A 推荐 B、B 推荐 C、C 又“推荐”了 A，`UNION ALL` 会永远走下去。两种防法：

- 用 `UNION` 代替 `UNION ALL`。新的一轮如果只产生已经出现过的行，这些行会被去掉，循环停止。前提是每一行的所有列都会重复；带着 `depth` 这种一直增加的列，行永远不重复，`UNION` 也挡不住。
- PostgreSQL 14 起，可以在 CTE 后面写 `CYCLE id SET is_cycle USING path`，让数据库记录走过的路径，发现回到走过的 `id` 就停下，并把那一行的 `is_cycle` 标成 true。

**深度上限。** 不确定数据里有没有环时，在递归项里加一个层数上限，比如 `WHERE r.depth < 20`，是最简单的保险。

**其他数据库。** `WITH RECURSIVE` 是标准 SQL，MySQL 8.0 和 SQLite 也这样写。SQL Server 不写 `RECURSIVE`，直接用 `WITH`；Oracle 另有一套 `CONNECT BY` 语法。

## 常见错误 {#mistakes}

**1. 忘了写 `RECURSIVE`。**

```sql run error
WITH referrals AS (
  SELECT id, name FROM customers WHERE id = 1
  UNION ALL
  SELECT c.id, c.name
  FROM customers AS c
  JOIN referrals AS r ON c.referred_by = r.id
)
SELECT * FROM referrals;
```

`relation "referrals" does not exist`，HINT 直接提示 `Use WITH RECURSIVE`。没有 `RECURSIVE`，CTE 在定义自己的时候还看不到自己的名字。

**2. 没有停止条件。** 下面这条会一直数下去：

```sql
WITH RECURSIVE n AS (
  SELECT 1 AS i
  UNION ALL
  SELECT i + 1 FROM n
)
SELECT i FROM n;
```

每一轮都会产生一行新的，循环永远不会结束。在 SQL Lab 里，8 秒后查询会被强制停止；在真正的数据库里，它会一直运行，直到耗尽内存或被人取消。写递归项时，先问自己：哪一轮会一行都不产生？

**3. 连接方向写反。** 想找 Lin Wei 推荐的人，却写成了 `c.id = r.referred_by`，结果找的是 Lin Wei 的推荐人。Lin Wei 没有推荐人，结果只有 ta 自己一行，不会报错。写之前读一遍条件：“顾客 c 的推荐人是上一轮的 r”是 `c.referred_by = r.id`。

**4. 起点和递归项的列数不同。** 起点选了 2 列、递归项选了 3 列，会报 `each UNION query must have the same number of columns`。两部分的选择列表要逐列对齐，就像第 5 章的集合运算。

**5. 在递归项里用聚合函数。** 想在递归项里写 `count(*)`，会报 `aggregate functions are not allowed in a recursive query's recursive term`。递归项每一轮只处理上一轮的行，汇总要放到主查询里做：先把所有行走出来，再 `count`、`max`。

## 小结 {#summary}

- 递归 CTE 由非递归项（起点）和递归项（下一步）组成，用 `UNION ALL` 连起来，`WITH` 后面要写 `RECURSIVE`。
- 数据库一轮一轮地执行：递归项每次只看上一轮新产生的行，某一轮没有新行时停止。
- 往下走和往上走的区别只在连接条件的方向。
- 列的名字和类型由起点决定；递归项不能用聚合函数，汇总放到主查询里。
- 每个递归项都要有让它停下来的条件；担心有环时，用 `UNION`、`CYCLE` 或层数上限。
