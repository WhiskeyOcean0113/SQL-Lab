## 为什么需要它 {#why}

上一篇里，“来自 China 或 Japan 的顾客”要写成 `country = 'China' OR country = 'Japan'`。如果是五个国家呢？再比如“价格在 20 到 40 美元之间的商品”，或者“名字以 D 开头的商品”，用 `=` 和 `<` 都能凑出来，但写起来又长又容易出错。

SQL 为这三种常见的条件提供了专门的写法：`IN`、`BETWEEN` 和 `LIKE`。

## 核心概念 {#core}

**`IN`：属于列表中的某一个值。**

```sql run
SELECT name, country
FROM customers
WHERE country IN ('Canada', 'France', 'Italy');
```

`x IN (a, b, c)` 就是 `x = a OR x = b OR x = c` 的简写。`NOT IN` 则表示“不是列表中的任何一个”。

**`BETWEEN`：落在一个范围里，两端都包含。**

```sql run
SELECT name, price
FROM products
WHERE price BETWEEN 22 AND 42;
```

`x BETWEEN a AND b` 等于 `x >= a AND x <= b`。22.00 和 42.00 本身都在结果里。

**`LIKE`：文字符合某种样子。** 这叫{{term:pattern-matching}}，样子里可以使用两个{{term:wildcard}}：

- `%` 匹配任意多个字符，包括零个。
- `_` 恰好匹配一个字符。

```sql run
SELECT name
FROM products
WHERE name LIKE 'D%';
```

`'D%'` 的意思是“以 D 开头，后面是什么都行”。注意 `LIKE` 要匹配整段文字：`'D'` 只能匹配正好是 D 的文字，想在中间任何位置找某个词，要两头都加 `%`。

## 语法 {#syntax}

三种写法都是 `condition`，可以直接放进 `WHERE`，也可以用 `AND`、`OR` 和别的条件组合：

```syntax
expression [ NOT ] IN ( value [, …] )
expression [ NOT ] BETWEEN [ SYMMETRIC ] low AND high
string [ NOT ] { LIKE | ILIKE } pattern [ ESCAPE escape_character ]
```

| 部分 | 填什么 | 能省略吗 |
|---|---|---|
| `expression` | 要检查的值，通常是列名 | 不能 |
| `value [, …]` | 一个或多个值，用逗号隔开，整个列表放在括号里 | 至少写一个 |
| `low`、`high` | 范围的下界和上界，两端都包含 | 不能 |
| `string` | 要检查的文字，通常是文字类型的列 | 不能 |
| `pattern` | 带通配符的文字，写在单引号里 | 不能 |
| `NOT` | 把整个条件取反 | 可以 |
| `SYMMETRIC` | 让 `BETWEEN` 自动交换上下界（见“深入”） | 可以 |
| `ESCAPE escape_character` | 指定转义字符（见“深入”） | 可以，默认是反斜杠 |

注意 `BETWEEN low AND high` 里的 `AND` 是 `BETWEEN` 写法的一部分，不是上一课的逻辑运算符 `AND`。数据库能分清两者：`price BETWEEN 22 AND 42 AND stock > 20` 的意思是“价格在 22 到 42 之间，并且库存多于 20”。

对照格式读几个条件：

- `country IN ('Canada', 'France', 'Italy')`：`value` 写了三个。
- `country NOT IN ('China', 'Japan')`：用了可选的 `NOT`。
- `name ILIKE '%pen%'`：从 `{ LIKE | ILIKE }` 里选了 `ILIKE`，没有写 `ESCAPE`。

## 示例 {#example}

问题：哪些顾客的邮箱地址里，`@` 前面一个字符是字母 d？

1. **用文字描述这个样子。** 开头是什么都行，然后是 `d`，紧接着是 `@`，后面是什么都行。
2. **把描述翻译成通配符。** “什么都行”是 `%`。
3. **写出完整的样子。** `'%d@%'`。

```sql run
SELECT name, email
FROM customers
WHERE email LIKE '%d@%';
```

只有 Emma Dubois 的 `emma.d@example.com` 符合。如果要求 `@` 前面是 `.d`，样子就写成 `'%.d@%'`。

## 变体 {#variants}

**`_` 匹配一个字符。** 第二个字母是 e 的商品名：

```sql run
SELECT name
FROM products
WHERE name LIKE '_e%';
```

**不区分大小写：`ILIKE`。** `LIKE` 区分大小写，`'%pen%'` 找不到 Fountain Pen。PostgreSQL 提供了 `ILIKE`，它忽略大小写：

```sql run
SELECT name
FROM products
WHERE name ILIKE '%pen%';
```

`ILIKE` 不是 SQL 标准的一部分，是 PostgreSQL 的扩展。在别的数据库里，常见的做法是把两边都转成小写再比较，第 2 章会学到 `lower()`。

**`IN` 的列表可以是数字。** 上一课的示例用 `IN` 改写，不再需要括号来管优先级：

```sql run
SELECT name, category_id, price
FROM products
WHERE category_id IN (1, 2) AND price < 50;
```

结果和上一课加了括号的版本一样，还是那 3 行。`IN` 本身是一个完整的条件，和 `AND` 组合时不会被拆开。

**`BETWEEN` 用于日期。** 2023 年上半年加入的顾客：

```sql run
SELECT name, joined_on
FROM customers
WHERE joined_on BETWEEN '2023-01-01' AND '2023-06-30';
```

`joined_on` 是日期类型，没有时分秒，所以两端都包含正好合适：6 月 30 日加入的顾客也会算进来。带时间的时间戳就不一样了，见“深入”。

**`NOT IN`、`NOT BETWEEN`、`NOT LIKE`。** 在前面加 `NOT` 就是取反：

```sql run
SELECT name, country
FROM customers
WHERE country NOT IN ('China', 'Japan');
```

## 深入 {#deeper}

**`BETWEEN` 和时间戳。** `BETWEEN` 两端都包含，这在处理带时间的数据时会出意外。`'2024-06-28'` 作为时间戳的意思是 6 月 28 日的零点整，所以下面这条查询会漏掉 6 月 28 日上午下的订单 24：

```sql run
SELECT id, ordered_at
FROM orders
WHERE ordered_at BETWEEN '2024-06-01' AND '2024-06-28';
```

更可靠的写法是“大于等于起点，小于终点的第二天”：

```sql run
SELECT id, ordered_at
FROM orders
WHERE ordered_at >= '2024-06-01' AND ordered_at < '2024-06-29';
```

这种“左闭右开”的写法对日期、时间戳都适用，不用操心一天里最后一秒是几点。

**`BETWEEN` 的两端有先后。** `price BETWEEN 42 AND 22` 一行都找不到，因为它要求 `price >= 42 AND price <= 22`。小的值写在前面。（PostgreSQL 也支持 `BETWEEN SYMMETRIC`，会自动交换两端。）

**匹配 `%` 和 `_` 本身。** 如果要找的文字里本来就有 `%` 或 `_`，在它前面加一个反斜杠：`LIKE '%\_%'` 找包含下划线的文字。

**正则表达式。** `LIKE` 只有两个通配符，表达能力有限。PostgreSQL 还提供 `~` 运算符，用{{term:regular-expression}}匹配文字，比如 `name ~ '^[A-D]'` 找以 A 到 D 开头的名字。标准 SQL 另有一个 `SIMILAR TO`，介于两者之间，很少用到。正则表达式超出了本课程的范围，知道有这个工具就够了。

**`NOT IN` 和 NULL。** 如果列表里有 NULL，`NOT IN` 会一行都不返回。原因要等下一篇讲完 NULL 才能说清楚，先记住：不要把 NULL 放进 `NOT IN` 的列表。

## 常见错误 {#mistakes}

**1. `LIKE` 忘了写通配符。** `name LIKE 'Pen'` 只能匹配正好是 Pen 的名字。想找“包含 Pen”，要写 `'%Pen%'`。

**2. 以为 `LIKE` 不区分大小写。** 在 MySQL 和 SQLite 里，`LIKE` 默认对英文字母不区分大小写，但在 PostgreSQL 里区分：

```sql run
SELECT name
FROM products
WHERE name LIKE '%pen%';
```

0 行。需要忽略大小写时，用 `ILIKE`。

**3. 用 `BETWEEN` 处理时间戳的终点。** 见“深入”：`BETWEEN '2024-06-01' AND '2024-06-28'` 不包含 28 日零点以后的时间。

**4. 用 `=` 搭配通配符。** `name = 'D%'` 找的是名字正好叫 `D%` 的商品；通配符只在 `LIKE` 和 `ILIKE` 里起作用。

**5. `IN` 的列表忘了括号或引号。** `country IN 'China', 'Japan'` 是语法错误；文字值要逐个加单引号，整个列表放在括号里：`IN ('China', 'Japan')`。

**6. 在 `IN` 的列表里写通配符。** `name IN ('D%')` 找的是名字正好叫 `D%` 的商品，结果是 0 行。和第 4 条一样，通配符只在 `LIKE` 和 `ILIKE` 里起作用。

**7. 把 `BETWEEN` 的 `AND` 换成别的词。** `price BETWEEN 22 OR 42` 是语法错误。`BETWEEN` 的格式固定是 `BETWEEN low AND high`，这里的 `AND` 不能换成 `OR` 或逗号。

## 小结 {#summary}

- `x IN (a, b, c)` 是一串 `OR` 的简写；`NOT IN` 表示不在列表中。
- `x BETWEEN a AND b` 包含两端，小的值写在前面。
- `LIKE` 用 `%`（任意多个字符）和 `_`（一个字符）匹配整段文字；它在 PostgreSQL 里区分大小写，`ILIKE` 不区分。
- 处理时间戳的范围时，用 `>= 起点 AND < 终点的第二天`，而不是 `BETWEEN`。
