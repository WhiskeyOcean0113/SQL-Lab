## 为什么需要它 {#why}

真实的问题很少只有一个条件：“Books 或 Electronics 分类里，50 美元以下的商品有哪些？”这里有三个条件：属于 Books、属于 Electronics、价格低于 50，而且它们之间的关系并不都一样。

把条件组合起来用的是 `AND`、`OR` 和 `NOT`。难点不在写法，而在顺序：没有括号时，数据库先算哪一个？

## 核心概念 {#core}

三个逻辑运算符各自把条件组合成一个新的条件，结果仍然是一个{{term:boolean}}：

- **`A AND B`**：两个条件都为 true，结果才为 true。
- **`A OR B`**：至少一个条件为 true，结果就为 true。
- **`NOT A`**：把 true 变成 false，false 变成 true。

```sql run
SELECT name, country
FROM customers
WHERE country = 'China' OR country = 'Japan';
```

**{{Term:operator-precedence}}**：没有括号时，`NOT` 最先算，其次是 `AND`，最后是 `OR`。就像算术里先乘除后加减一样，`AND` 比 `OR` 结合得更紧。所以

```sql
WHERE a OR b AND c
```

的意思是 `a OR (b AND c)`，而不是 `(a OR b) AND c`。

比较运算（`=`、`<` 等）比这三个都优先，所以 `price < 50 AND stock > 10` 不需要括号，它本来就是 `(price < 50) AND (stock > 10)`。

## 示例 {#example}

问题：Books（分类 1）或 Electronics（分类 2）里，单价低于 50 美元的商品有哪些？

1. **找出所有单独的条件。** `category_id = 1`、`category_id = 2`、`price < 50`。
2. **弄清它们之间的关系。** 分类是“二选一”，用 `OR`；价格是额外的要求，必须同时满足，用 `AND`。
3. **用括号把 `OR` 的部分包起来**，让它作为一个整体再和价格条件 `AND`。

```sql run
SELECT name, category_id, price
FROM products
WHERE (category_id = 1 OR category_id = 2) AND price < 50;
```

结果 3 行：The Pragmatic Programmer、SQL Pocket Guide 和 USB-C Hub。

现在去掉括号再运行一次：

```sql run
SELECT name, category_id, price
FROM products
WHERE category_id = 1 OR category_id = 2 AND price < 50;
```

多出了一行 Designing Data Apps（55.50）。因为 `AND` 先算，这条查询的真正含义是“所有 Books，再加上 50 美元以下的 Electronics”，Books 里的商品不管多贵都会留下来。

## 变体 {#variants}

**用 `NOT` 取反。** `NOT (stock > 10)` 和 `stock <= 10` 等价：

```sql run
SELECT name, stock
FROM products
WHERE NOT (stock > 10);
```

能用一个比较运算直接表达时，通常写 `stock <= 10` 更清楚。`NOT` 更适合放在整组条件前面，后面几篇的 `NOT IN`、`NOT LIKE`、`IS NOT NULL` 也是同样的思路。

**多个 `AND`。** 条件越多，`AND` 留下的行越少：

```sql run
SELECT id, customer_id, status
FROM orders
WHERE customer_id = 1 AND status = 'delivered' AND ordered_at < '2024-03-01';
```

**混合使用时总加括号。** 即使你记得优先级，读代码的人未必记得。只要同一个条件里同时出现 `AND` 和 `OR`，就加上括号写明意图。

## 深入 {#deeper}

**德摩根定律。** 对一组条件取反时，`AND` 和 `OR` 会互换：

- `NOT (A AND B)` 等于 `NOT A OR NOT B`
- `NOT (A OR B)` 等于 `NOT A AND NOT B`

“不是 China 也不是 Japan”的顾客可以写成 `NOT (country = 'China' OR country = 'Japan')`，也可以写成 `country <> 'China' AND country <> 'Japan'`。常见的错误写法是 `country <> 'China' OR country <> 'Japan'`：任何一位顾客至少满足其中一个，所以它会返回全部 12 位顾客。

**遇到 NULL 时，逻辑不只是真和假。** 如果某个条件因为 NULL 而无法判断，它的结果既不是 true 也不是 false，而是 unknown。`AND`、`OR`、`NOT` 对 unknown 有一套专门的规则，这是下下篇的主题。

## 常见错误 {#mistakes}

**1. 把日常语言里的“和”直接翻译成 `AND`。** “列出来自 China 和 Japan 的顾客”，意思是两国的顾客都要。但写成 `AND`：

```sql run
SELECT name
FROM customers
WHERE country = 'China' AND country = 'Japan';
```

结果是 0 行，因为没有哪一位顾客的国家能同时等于两个值。研究者把这类错误归为“源于自然语言”的误解：日常说“和”的地方，SQL 里往往要用 `OR`。判断的方法是问自己：同一行需要同时满足这两个条件吗？

**2. `OR` 后面省掉了列名。** 口语里说“国家是 China 或 Japan”，写成 SQL 却不能省：

```sql run error
SELECT name
FROM customers
WHERE country = 'China' OR 'Japan';
```

`OR` 的两边都必须是完整的条件。`'Japan'` 本身不是条件，PostgreSQL 试图把它当成布尔值，于是报错 `invalid input syntax for type boolean`。正确写法是 `country = 'China' OR country = 'Japan'`，下一篇的 `IN` 会让它更简洁。

**3. 混用 `AND` 和 `OR` 却不加括号。** 见上面的示例：少了括号，查询照样运行，只是多出几行。这类错误不报错，只能靠你检查结果。

**4. 对“不是 A 也不是 B”用了 `OR`。** 见“深入”里的德摩根定律：`<> A OR <> B` 永远为 true。

## 小结 {#summary}

- `AND` 要求两边都为 true，`OR` 只要求一边为 true，`NOT` 取反。
- 优先级是 `NOT` > `AND` > `OR`；比较运算比它们都优先。
- 同一个条件里同时有 `AND` 和 `OR` 时，一定加括号。
- 日常语言的“和”常常对应 SQL 的 `OR`；`OR` 两边都要写成完整的条件。
- 对一组条件取反时，`AND` 和 `OR` 互换。
