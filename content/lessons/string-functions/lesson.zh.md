## 为什么需要它 {#why}

客服想要一份通讯录，每行写成“Lin Wei (China)”这样；市场部想知道顾客的邮箱都来自哪个域名；还有人要找国家是 china 的顾客，却不确定数据里存的是大写还是小写。

这些都是对{{term:string}}的加工。SQL 提供了一套字符串函数来做这些事。

## 核心概念 {#core}

**拼接用 `||`。** 把几段文字连成一段，叫{{term:concatenation}}：

```sql run
SELECT name || ' (' || country || ')' AS label
FROM customers;
```

**函数对每一行计算一次。** 最常用的几个：

| 函数 | 作用 | 例子 → 结果 |
|---|---|---|
| `upper(s)` / `lower(s)` | 转大写 / 小写 | `lower('China')` → `china` |
| `length(s)` | 字符个数 | `length('Lin Wei')` → 7 |
| `left(s, n)` / `right(s, n)` | 取左边 / 右边 n 个字符 | `left('SQL Pocket Guide', 3)` → `SQL` |
| `substring(s from i for n)` | 从第 i 个字符起取 n 个 | → `Pocket` |
| `position(t in s)` | t 第一次出现的位置 | `position('@' in 'ava.t@example.com')` → 6 |
| `split_part(s, 分隔符, k)` | 按分隔符切开，取第 k 段 | → `example.com` |
| `replace(s, 旧, 新)` | 替换所有出现的旧文字 | |
| `trim(s)` | 去掉两端的空格 | |

位置从 1 开始数，不是从 0。

**NULL 遇上 `||`，结果是 NULL。** 和算术一样：任何一段是 NULL，整段拼接结果就是 NULL。

## 语法 {#syntax}

拼接运算符和这一课的字符串函数：

```syntax
string || string
upper(string)
lower(string)
length(string)
left(string, n)
right(string, n)
substring(string FROM start [ FOR count ])
position(search IN string)
split_part(string, delimiter, field)
replace(string, from_text, to_text)
trim([ LEADING | TRAILING | BOTH ] [ characters FROM ] string)
concat(value [, …])
concat_ws(separator, value [, …])
```

| 占位符 | 填什么 |
|---|---|
| `string` | 一段文字：文字列、字面量，或者另一个返回文字的函数 |
| `n`、`start`、`count`、`field` | 整数。位置从 1 开始数 |
| `search` | 要找的文字 |
| `delimiter` | 分隔符，比如 `'@'` |
| `from_text`、`to_text` | 被替换的文字和替换成的文字 |
| `characters` | 要去掉的字符；不写就是空格 |
| `value` | 任何值，数字也行，会被转成文字 |
| `separator` | 放在各段之间的分隔符 |

注意 `substring`、`position` 和 `trim` 的格式：括号里用的不是逗号，而是关键字 `FROM`、`FOR`、`IN`、`LEADING` 等。这是 SQL 标准为这几个函数规定的特殊写法，读起来像英语句子：`position('@' in email)` 就是“`@` 在 email 里的位置”。其他函数都是普通的“名字(参数, 参数)”。

格式里的 `string` 可以是另一个函数，所以函数可以嵌套。从里往外读：

- `upper(left(name, 3))`：先取名字的前 3 个字符，再转成大写。
- `substring(email FROM position('@' IN email) + 1)`：先找到 `@` 的位置，加 1，从那里截到结尾，得到域名。

## 示例 {#example}

问题：列出每位顾客邮箱的用户名部分（`@` 之前）和域名部分（`@` 之后）。

1. **找到分界。** `@` 把邮箱分成两段。
2. **选函数。** 按分隔符切成几段，正好是 `split_part` 的用途。
3. **分别取第 1 段和第 2 段**，并起名。
4. **排除没有邮箱的顾客。** 这些顾客的结果会是 NULL。

```sql run
SELECT name,
       split_part(email, '@', 1) AS username,
       split_part(email, '@', 2) AS domain
FROM customers
WHERE email IS NOT NULL;
```

shop 的所有邮箱都在 example.com 下。如果要找 `@` 的位置本身，用 `position('@' in email)`。

## 变体 {#variants}

**不区分大小写的比较。** 把两边都转成同一种大小写再比：

```sql run
SELECT name, country
FROM customers
WHERE lower(country) = 'china';
```

这是在任何数据库里都能用的写法；PostgreSQL 的 `ILIKE` 只适用于 `LIKE` 那样的模式匹配。

**截取与替换。**

```sql run
SELECT substring('SQL Pocket Guide' from 5 for 6) AS middle,
       left('SQL Pocket Guide', 3) AS first_three,
       right('SQL Pocket Guide', 5) AS last_five,
       replace('SQL Pocket Guide', 'Pocket', 'Field') AS replaced;
```

**去掉两端的字符：`trim` 的完整写法。** 默认去掉两端的空格；`LEADING` 只去开头，`TRAILING` 只去结尾；还可以指定要去掉的字符：

```sql run
SELECT '[' || trim('  a  ') || ']' AS both_ends,
       '[' || trim(LEADING '  a  ') || ']' AS leading_only,
       trim(BOTH '-' FROM '--a--') AS dashes;
```

方括号是拼上去的，用来看清空格还剩在哪里。

**标准写法和逗号写法。** PostgreSQL 也接受普通的逗号写法：`substring('SQL Pocket Guide', 5, 6)` 和 `substring('SQL Pocket Guide' FROM 5 FOR 6)` 相同；`strpos(string, search)` 和 `position(search IN string)` 相同，只是参数顺序相反。只写 `FROM` 不写 `FOR`，就一直截到结尾：

```sql run
SELECT email,
       substring(email FROM position('@' IN email) + 1) AS domain,
       strpos(email, '@') AS at_sign
FROM customers;
```

**把数字拼进文字。** `||` 也能连接数字，结果是文字：

```sql run
SELECT name || ' ($' || price || ')' AS label
FROM products;
```

## 深入 {#deeper}

**`concat` 和 `concat_ws` 会跳过 NULL。** `||` 遇到 NULL 整段变成 NULL，`concat()` 则把 NULL 当作空字符串；`concat_ws(分隔符, …)` 用分隔符连接，并跳过 NULL：

```sql run
SELECT name, city,
       name || ', ' || city AS with_bars,
       concat(name, ', ', city) AS with_concat,
       concat_ws(', ', name, city) AS with_concat_ws
FROM customers;
```

Liam O'Brien 的城市是 NULL：`||` 的结果是 NULL，`concat` 留下了一个多余的逗号，`concat_ws` 干净地只剩名字。

**空字符串不是 NULL。** 第 1 章讲 NULL 时说过：`''` 是一个长度为 0 的字符串，`'' IS NULL` 是 false，只有 Oracle 把两者当成一回事。所以 `length('')` 是 0，`length(NULL)` 是 NULL。

**长度按字符算。** `length('数据库')` 是 3；如果要按字节数算，用 `octet_length`，同样三个汉字是 9 个字节。

**`+` 不能拼接文字。** SQL Server 用 `+` 连接字符串，但标准 SQL 和 PostgreSQL 都用 `||`。

## 常见错误 {#mistakes}

**1. 用 `+` 拼接。**

```sql run error
SELECT name + ' (' + country + ')' AS label
FROM customers;
```

`operator does not exist: text + unknown`。PostgreSQL 的拼接运算符是 `||`。

**2. 忘了 NULL 会让拼接结果消失。** 用 `||` 生成标签时，城市为 NULL 的顾客整个标签变成了 NULL。需要保留其余部分时，用 `concat_ws` 或者本章第 4 篇会讲的 `COALESCE`。

**3. 位置从 0 开始数。** `substring(s from 0 for 3)` 只会得到 2 个字符。SQL 的字符串位置从 1 开始。

**4. 把标准写法里的关键字换成了逗号。** `position('@', email)` 报 `syntax error at or near ","`。`position` 的格式是 `position(search IN string)`；想用逗号，就换成 `strpos(email, '@')`，注意参数顺序也反过来了。

**5. 只把一边转成小写。** `lower(country) = 'China'` 永远找不到任何行，因为左边已经全是小写。两边要一致。

## 小结 {#summary}

- 用 `||` 拼接文字，也可以把数字拼进去；`+` 不行。
- 常用函数：`upper`、`lower`、`length`、`left`、`right`、`substring`、`position`、`split_part`、`replace`、`trim`。
- 字符串位置从 1 开始数。
- 任何一段是 NULL，`||` 的结果就是 NULL；`concat_ws` 会跳过 NULL。
- 不区分大小写的比较：两边都用 `lower()`。
