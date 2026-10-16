## 为什么需要它 {#why}

如果 shop 一开始是用一张电子表格记账的，它大概会长成这样：每一行是一件售出的商品，旁边写着订单号、下单时间、顾客名字、顾客邮箱、商品名、分类名、件数和单价。所有信息都在一张表里，查什么都不用连接。

```sql run
CREATE TABLE order_lines AS
SELECT o.id AS order_id, c.name AS customer_name, c.email AS customer_email,
       p.name AS product_name, i.quantity
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
JOIN order_items AS i ON i.order_id = o.id
JOIN products AS p ON p.id = i.product_id;

SELECT order_id, customer_name, customer_email, product_name
FROM order_lines
WHERE customer_name = 'Lin Wei'
ORDER BY order_id;
```

Lin Wei 的邮箱在这张表里写了 10 遍。看起来只是浪费一点空间，问题却在后面：ta 换了邮箱，要改几行？漏改一行会怎样？shop 为什么要拆成五张表，答案就在这里。

## 核心概念 {#core}

### 重复带来三种异常

同一个事实存了好几份，叫{{term:redundancy}}。它会造成三种问题：

- **{{Term:update-anomaly}}**：改一个事实要改很多行，漏改一行，数据就互相矛盾。
- **插入异常**：有些事实没法单独记下来。一个还没卖出过任何商品的新分类，在 `order_lines` 里没有地方放。
- **删除异常**：删掉一行，顺带丢掉了别的事实。4K Monitor 只在取消的订单 5 里出现过，删掉这笔订单，“店里有 4K Monitor 这件商品”这个事实也跟着没了。

### 函数依赖：谁决定谁

如果知道了 A 的值，就一定能确定 B 的值，就说 B {{term:functional-dependency}}于 A。在 shop 里：

- 知道顾客编号，就知道顾客的名字、邮箱、城市。
- 知道商品编号，就知道商品名、价格、分类。
- 知道订单编号，就知道下单时间、是哪位顾客。
- 要知道件数，必须同时知道是哪笔订单、哪种商品。

{{Term:normalization}}就是按这些依赖关系拆表，让每个事实只存在它真正依赖的那张表里。

### 三个{{term:normal-form}}

| 范式 | 要求 | 违反的例子 |
|---|---|---|
| 第一范式（1NF） | 每个格子只有一个值，没有重复的列组 | `tags` 列里写 `'books,sale'`；`phone1`、`phone2`、`phone3` 三列 |
| 第二范式（2NF） | 满足 1NF，并且每一列都依赖**整个**主键，不能只依赖主键的一部分 | 主键是 `(order_id, product_id)`，却放了只依赖 `product_id` 的 `product_name`：{{term:partial-dependency}} |
| 第三范式（3NF） | 满足 2NF，并且非主键列只依赖主键，不依赖别的非主键列 | `orders` 里放 `customer_city`：它依赖 `customer_id`，再间接依赖订单编号：{{term:transitive-dependency}} |

一句好记的话：每一列都依赖于键，整个键，并且只依赖于键。

shop 的五张表已经满足第三范式，所以前面的每一章都在连接表：拆开的信息，查询时再用连接拼回来。

## 语法 {#syntax}

范式化本身没有新的语法，它是一种设计方法。拆表时，最常用的是用一条查询直接建表，把已有的数据搬过去：

```syntax
CREATE TABLE table_name [ ( column_name [, …] ) ] AS select_statement
```

| 部分 | 填什么 | 规则 |
|---|---|---|
| `table_name` | 新表的名字 | 不能和已有的表重名 |
| `( column_name [, …] )` | 新表的列名 | 可以省略；省略时用查询结果的列名 |
| `select_statement` | 任意查询 | 查询结果的每一行变成新表的一行，列的类型也照搬 |

新表只复制了数据和类型，**不会复制任何约束**：没有主键，没有外键，没有 `NOT NULL`。建好之后，用上一篇的 `ALTER TABLE … ADD` 补上。

对照格式读几条：

- “为什么需要它”里的 `CREATE TABLE order_lines AS SELECT … FROM orders JOIN …`：用一个连接查询建出一张宽表。
- `CREATE TABLE line_customers AS SELECT DISTINCT customer_name, customer_email FROM order_lines`：从宽表里拆出顾客，`DISTINCT` 让每位顾客只留一行。

## 示例 {#example}

问题：亲眼看一次更新异常，再按依赖关系把顾客信息拆出去。

1. **建宽表。** 同“为什么需要它”。
2. **只改一行。** Lin Wei 换了邮箱，但只改了订单 22 的那几行。
3. **查 Lin Wei 现在的邮箱。** 应该只有一个答案，结果却有两个。
4. **拆表。** 名字决定邮箱，所以邮箱应该和名字一起存在顾客表里，每位顾客一行。

```sql run
CREATE TABLE order_lines AS
SELECT o.id AS order_id, c.name AS customer_name, c.email AS customer_email,
       p.name AS product_name, i.quantity
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
JOIN order_items AS i ON i.order_id = o.id
JOIN products AS p ON p.id = i.product_id;

UPDATE order_lines
SET customer_email = 'lin.wei@new.example.com'
WHERE order_id = 22;

SELECT DISTINCT customer_email
FROM order_lines
WHERE customer_name = 'Lin Wei';
```

两个邮箱，哪个才对？数据库已经无法回答。拆开之后，邮箱只存一份：

```sql run
CREATE TABLE order_lines AS
SELECT o.id AS order_id, c.name AS customer_name, c.email AS customer_email
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
JOIN order_items AS i ON i.order_id = o.id;

CREATE TABLE line_customers AS
SELECT DISTINCT customer_name, customer_email
FROM order_lines;

SELECT * FROM line_customers ORDER BY customer_name;
```

10 位顾客，每人一行。现在改邮箱只需要改一行，不可能改出矛盾。真正的设计里，顾客还要有一个不会变的编号作主键，名字可能重复，不适合作键。shop 的 `customers` 表就是这样做的。

## 变体 {#variants}

**违反第一范式：一个格子里放一串值。** 把每笔订单的商品编号写成用逗号隔开的文字，想找“买过商品 1 的订单”：

```sql run
CREATE TABLE order_products_flat (order_id integer, product_ids text);
INSERT INTO order_products_flat
VALUES (1, '1,8'), (2, '4'), (3, '3,12,11');

SELECT order_id
FROM order_products_flat
WHERE product_ids LIKE '%1%';
```

订单 3 也被找了出来，因为“12”和“11”里都有“1”。这样的列既不能建外键，也没法可靠地查询。正确的做法是一个值一行，也就是 shop 的 `order_items`。

**一行一个值：标签表。** 商品可以有多个标签，每个标签单独一行，主键是“商品 + 标签”：

```sql run
CREATE TABLE product_tags (
  product_id integer NOT NULL REFERENCES products (id),
  tag        text    NOT NULL,
  PRIMARY KEY (product_id, tag)
);
INSERT INTO product_tags
VALUES (1, 'books'), (1, 'bestseller'), (3, 'books'),
       (3, 'sale'), (12, 'stationery'), (12, 'sale');

SELECT p.name
FROM product_tags AS t
JOIN products AS p ON p.id = t.product_id
WHERE t.tag = 'sale'
ORDER BY p.name;
```

**违反第二范式：只依赖主键的一部分。** 如果 `order_items` 里还存了商品名：

```sql run
CREATE TABLE items_wide AS
SELECT i.order_id, i.product_id, i.quantity, p.name AS product_name
FROM order_items AS i
JOIN products AS p ON p.id = i.product_id;

SELECT * FROM items_wide WHERE product_id = 8 ORDER BY order_id;
```

主键是 `(order_id, product_id)`，`quantity` 依赖整个主键，`product_name` 却只依赖 `product_id`。Ceramic Mug 这个名字因此重复了 4 次。它应该回到 `products` 里。

**违反第三范式：通过别的列间接依赖。** 如果 `orders` 里存了顾客的城市：

```sql run
CREATE TABLE orders_wide AS
SELECT o.id AS order_id, o.customer_id, c.city AS customer_city
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id;

SELECT * FROM orders_wide WHERE customer_id = 1 ORDER BY order_id;
```

`customer_city` 由 `customer_id` 决定，而 `customer_id` 又由订单编号决定。Lin Wei 搬家时，要改的是 4 笔订单，而不是 1 位顾客。

## 深入 {#deeper}

**`unit_price` 不是冗余。** `order_items.unit_price` 和 `products.price` 看起来存了同一件事，其实不是：一个是下单那一刻的成交价，一个是现在的标价。订单 11 的耳机成交价是 239.00，现在标价是 249.00。判断是不是冗余，要问的是“这是不是同一个事实”，而不是“值是不是一样”。

**存算出来的值，要付出同步的代价。** 在 `orders` 里存一个 `total` 列，读起来省事，但每次改明细都得记得同步更新它，忘了一次，数据就自相矛盾。需要这样的值时，优先在查询或下一篇的{{term:view}}里现算。

**{{Term:denormalization}}。** 报表、数据仓库这类只读、追求查询速度的场景，有时会故意把数据合并成宽表，用冗余换取少做连接。这是在清楚代价之后的有意选择，前提是有办法保证这些副本保持一致。日常业务的表，先范式化。

**更高的范式。** 3NF 之后还有 BCNF、第四范式、第五范式，处理的是更少见的依赖关系。大多数表做到 3NF，问题就解决得差不多了。

## 常见错误 {#mistakes}

**1. 在一个格子里存一串值。** `'1,8'` 这样的列查起来要靠 `LIKE`，会误中 `'12'`，也没法建外键。见“变体”的第一个例子。拆成一行一个值的表。

**2. 用一组编号的列代替一张表。** `phone1`、`phone2`、`phone3` 这样的列，第四个电话放不下，查“这个号码是谁的”要写三遍条件。拆成 `customer_phones (customer_id, phone)`。

**3. 存可以算出来的值。** 订单的总金额可以从明细算出来。存一份 `total`，明细一改就对不上：

```sql run
ALTER TABLE orders ADD COLUMN total numeric(10, 2);
UPDATE orders AS o
SET total = (SELECT sum(quantity * unit_price) FROM order_items WHERE order_id = o.id);

UPDATE order_items SET quantity = 5 WHERE order_id = 1 AND product_id = 8;

SELECT o.id, o.total AS stored_total, sum(i.quantity * i.unit_price) AS real_total
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
WHERE o.id = 1
GROUP BY o.id, o.total;
```

存下的 67.00 和实际的 104.50 已经不一样了。

**4. 拆表时用名字作键。** 拆出顾客表后，用 `customer_name` 作主键，两位同名的顾客就会撞在一起。拆出来的实体，给它一个编号作主键，其他表用外键引用这个编号。

**5. 以为 `CREATE TABLE … AS` 会带上约束。** 建出来的表没有主键、外键和 `NOT NULL`，什么数据都能插进去。拆完表，记得补上约束。

## 小结 {#summary}

- 同一个事实存好几份会带来更新、插入、删除三种异常。
- 范式化按函数依赖拆表，让每个事实只存一次。
- 1NF：一个格子一个值；2NF：依赖整个主键；3NF：只依赖主键，不经过别的列。
- 拆开的表，查询时用连接拼回来；`CREATE TABLE … AS` 可以把已有数据搬进新表，但约束要自己补。
- 成交价这类“看起来重复、其实是另一个事实”的列不是冗余；能算出来的值尽量现算。
