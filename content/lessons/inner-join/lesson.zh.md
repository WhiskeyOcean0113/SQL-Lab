## 为什么需要它 {#why}

shop 里的每一笔订单都记着是谁下的，但记的不是名字，而是一个编号：

```sql run
SELECT id, customer_id, status
FROM orders
WHERE id <= 5;
```

`customer_id` 为 1 的顾客叫什么？答案在另一张{{term:table}} `customers` 里：

```sql run
SELECT id, name, city
FROM customers
WHERE id <= 5;
```

把两次的结果摆在一起，你能用眼睛对出来：订单 1 和订单 4 都是 Lin Wei 下的。这一篇要学的，就是让数据库替你完成这项"对号"的工作，并且一次处理全部订单。

> 为什么不把顾客名字直接存进 `orders`？因为同一位顾客会下很多笔订单。名字只存一份，改名时只需要改一处，也不会出现同一个人在不同订单里拼法不一样的情况。代价是查询时要把表重新拼起来，这正是 join 的用处。

## 核心概念 {#core}

{{Term:inner-join}}把两张表的{{term:row}}两两配对，只保留满足{{term:join-condition}}的那些配对。

```sql
FROM orders
JOIN customers ON customers.id = orders.customer_id
```

可以这样读：对 `orders` 的每一行，到 `customers` 里找 `id` 等于它的 `customer_id` 的行。找到几行，结果里就有几行配对后的新行，每一行同时带着两张表的所有{{term:column}}。

几个要点：

- 连接条件写在 `ON` 后面，和 `WHERE` 里的条件是同一种判断。只有判断结果为 true 的配对会留下。
- `orders.customer_id` 是一个{{term:foreign-key}}：它的值指向 `customers` 的{{term:primary-key}} `id`。绝大多数 join 都沿着"外键 = 主键"这条线连接。
- 任何一边找不到配对的行，都不会出现在结果里。shop 有两位顾客从没下过单，所以连接 `orders` 和 `customers` 得到的 24 行里，找不到 Lucas Silva 和 Mei Tanaka。
- `JOIN` 和 `INNER JOIN` 完全相同，`INNER` 可以省略。

在{{term:logical-order}}里，`FROM` 和 `JOIN` 最先执行：数据库先得到一张拼好的宽表，`WHERE` 再去筛选它，最后由 `SELECT` 从中挑出列。所以 `WHERE` 和 `SELECT` 都能同时使用两张表的列。

从定义上说，内连接等于先求两张表的{{term:cartesian-product}}，也就是所有可能的配对（24 笔订单 × 12 位顾客 = 288 对），再用 `ON` 的条件筛掉不成立的配对。数据库实际执行时不会真的生成 288 行，但结果一定和这个定义一致。后面遇到行数"变多"或"变少"的问题，都可以回到这个定义来想。

## 示例 {#example}

问题：列出前 5 笔订单的编号、下单顾客的名字和订单状态。

按下面的步骤来写：

1. **找出需要的列分别在哪张表。** 订单编号和状态在 `orders`，名字在 `customers`。
2. **找出连接两张表的列。** `orders.customer_id` 指向 `customers.id`。
3. **写出 `FROM` 和 `JOIN`。** 给两张表起短的{{term:alias|表别名}} `o` 和 `c`，连接条件是 `c.id = o.customer_id`。
4. **用"别名.列名"写 `SELECT`。** 两张表都有 `id` 列，必须写明要的是 `o.id`。
5. **最后加上筛选。** `WHERE o.id <= 5`。

```sql run
SELECT o.id, c.name, o.status
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
WHERE o.id <= 5;
```

逐行看配对是怎么发生的：

| `o.id` | `o.customer_id` | 配对到的 `customers` 行 | `c.name` |
|---|---|---|---|
| 1 | 1 | `id = 1` | Lin Wei |
| 2 | 2 | `id = 2` | Ava Thompson |
| 3 | 3 | `id = 3` | Kenji Sato |
| 4 | 1 | `id = 1` | Lin Wei |
| 5 | 4 | `id = 4` | Sofia Rossi |

Lin Wei 出现了两次，因为 Lin Wei 下了两笔订单，`customers` 里的同一行被配对了两次。这是{{term:one-to-many}}的正常结果：内连接不会去重，"一"这一边的行会随着"多"那一边重复出现。

## 变体 {#variants}

**表的先后可以交换。** 写成 `FROM customers AS c JOIN orders AS o ON ...`，得到的行完全相同，只是 `SELECT *` 时列的先后不同。对内连接来说，哪张表写在前面不影响结果。

**连接条件写在 `ON`，筛选条件写在 `WHERE`。** 对内连接，把 `c.country = 'Canada'` 放进 `ON` 还是 `WHERE`，结果都一样。但请养成习惯：`ON` 只写"两张表怎么对上"，`WHERE` 写"要哪些行"。下一篇的外连接里，这两个位置的效果会不同。

```sql run
SELECT o.id, c.name, o.status
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
WHERE c.country = 'Canada';
```

**连接两张以上的表。** 每多一张表，就多写一组 `JOIN ... ON`。`JOIN` 从上到下依次执行：前两张表连好的结果，再去连第三张表，以此类推，每个 `ON` 都可以引用前面出现过的任何表。下面这条查询从商品一路连到顾客，找出谁买过 Ceramic Mug：

```sql run
SELECT o.id, c.name
FROM products AS p
JOIN order_items AS i ON i.product_id = p.id
JOIN orders AS o ON o.id = i.order_id
JOIN customers AS c ON c.id = o.customer_id
WHERE p.name = 'Ceramic Mug';
```

`order_items` 自己不提供任何要显示的列，但它是商品和订单之间唯一的桥梁，少了它就连不起来。

## 深入 {#deeper}

**{{term:null}} 永远配不上。** Gift Card 的 `category_id` 是 NULL。`NULL = 1` 的结果不是 true，而是 unknown，连 `NULL = NULL` 也一样。所以这件商品和任何分类都配不上：16 件商品，结果只有 15 行。

```sql run
SELECT p.name, c.name AS category
FROM products AS p
JOIN categories AS c ON c.id = p.category_id;
```

想保留没有分类的商品，需要下一篇的{{term:left-join}}。

**USING 与 NATURAL JOIN。** 如果两张表用同名的列连接，可以写 `JOIN t2 USING (k)`，它等价于 `ON t1.k = t2.k`，而且结果里只保留一列 `k`。shop 的外键叫 `customer_id`，主键叫 `id`，名字不同，所以这里只能用 `ON`。

{{Term:natural-join}}更进一步：它自动用两张表所有同名的列来连接。它不认识外键，只看列名。在 shop 里，这个错误非常隐蔽：

```sql run
SELECT o.id, c.name
FROM orders AS o
NATURAL JOIN customers AS c;
```

两张表唯一同名的列是 `id`，于是"订单 5"被配给了"顾客 5"。没有报错，返回 12 行看起来很正常的数据，但大部分都是错的。PostgreSQL 文档也提醒：表结构一变，NATURAL JOIN 的含义就会跟着变。请始终显式地写 `ON`。

**旧式写法：用逗号连接。** 你会在别处见到 `FROM orders, customers WHERE customers.id = orders.customer_id`。它和内连接的结果相同，但连接条件混在 `WHERE` 里，一旦漏写，得到的就是 288 行的笛卡尔积。也不要把逗号和 `JOIN` 混在一起用：`JOIN` 比逗号结合得更紧，容易得到意料之外的错误。

**和其他数据库的差别。** 标准 SQL 规定内连接必须带 `ON` 或 `USING`，PostgreSQL 也这样要求，漏写会直接报语法错误。MySQL 和 SQLite 则允许不带条件的 `JOIN`，并把它当作{{term:cross-join}}，悄悄返回所有配对。换到这些数据库时，漏写 `ON` 不会有任何提示。

## 常见错误 {#mistakes}

**1. 漏写连接条件。** 有人以为数据库会"自动按编号对上"。它不会。用逗号列出两张表却没写条件，每笔订单都会和每位顾客配对：

```sql
SELECT o.id, c.name
FROM orders AS o, customers AS c;
```

结果是 288 行，是订单数的 12 倍。看到行数远超预期时，第一件事就是检查连接条件。

**2. 连错了列。** `ON c.id = o.id` 语法完全正确，也能返回数据，但它比较的是顾客编号和订单编号，两者毫无关系。危险在于结果看起来像对的：前 3 行碰巧正确，从第 4 行开始名字就对不上了。正确的写法要沿着外键：`ON c.id = o.customer_id`。

**3. 比较了不可能相等的两列。** 例如 `ON c.id = o.status`，把顾客编号和状态文字放在一起比。PostgreSQL 会报 `operator does not exist: integer = text`；在不检查类型的数据库里，它会安静地返回空结果。写 `ON` 之前先问自己：这两列存的是同一种东西吗？

**4. 列名有歧义。** 两张表都有 `id`，只写 `id` 时 PostgreSQL 会报 `column reference "id" is ambiguous`。在列名前加上别名，写成 `o.id` 或 `c.id`。

**5. 起了别名，又用回原名。** 写了 `FROM orders AS o` 之后，这条查询里就只能叫它 `o`。再写 `orders.id` 会报 `invalid reference to FROM-clause entry for table "orders"`。

**6. 连了不需要的表。** 只想看 Outdoor 分类有哪些商品，却顺手连上了 `order_items`：

```sql run
SELECT p.name, c.name AS category
FROM products AS p
JOIN categories AS c ON c.id = p.category_id
JOIN order_items AS i ON i.product_id = p.id
WHERE c.name = 'Outdoor';
```

每件商品按它被买过的次数重复出现，从没卖出过的 Folding Chair 则消失了。多连一张表不是"多带一些信息"，它会改变结果有哪些行。只连回答问题必需的表。

## 小结 {#summary}

- `JOIN ... ON` 把两张表的行配对，只保留 `ON` 条件为 true 的配对；`INNER` 可以省略。
- 连接条件通常是"外键 = 主键"，例如 `c.id = o.customer_id`。
- 找不到配对的行会被丢掉，连接列为 NULL 的行也是如此。
- 一对多关系中，"一"这边的行会重复出现；行数异常时，先检查连接条件和多连的表。
- 用表别名限定每一列，并且始终显式地写 `ON`。
