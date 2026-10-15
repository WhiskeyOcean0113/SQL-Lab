## 为什么需要它 {#why}

shop 里可能会有两位都叫 Chen Yu 的顾客，也可能有人改了名字、换了邮箱。那么 `orders` 表要怎样记录“这笔订单是谁下的”，才能永远指向唯一的那一个人？

答案是给每一行一个永远不会重复、也永远不会缺失的标识，再让别的表通过这个标识来引用它。这就是{{term:primary-key}}和{{term:foreign-key}}。理解了它们，你就能看懂 shop 五张表之间的关系，下一章的 join 也正是沿着这些关系连接的。

## 核心概念 {#core}

**主键**是一列（或几列），它的值能唯一地认出表里的每一行。数据库会保证两件事：

- **唯一**：任意两行的主键都不相同。
- **不为空**：主键不能是 {{term:null}}。

一张表最多只有一个主键。shop 的 `customers`、`products`、`orders`、`categories` 都用 `id` 列作主键。

**外键**是一列，它的值必须是另一张表主键里已经存在的值。`orders.customer_id` 就是外键，它引用 `customers.id`：

```sql run
SELECT id, customer_id, status FROM orders;
```

每个 `customer_id` 都能在 `customers` 里找到对应的顾客。数据库会强制保证这一点，这叫{{term:referential-integrity}}：你不可能写进一笔属于“顾客 99”的订单，因为 shop 里没有这位顾客。试试看：

```sql run error
INSERT INTO orders (id, customer_id, ordered_at, status)
VALUES (25, 99, '2024-07-01 10:00', 'pending');
```

数据库拒绝了这条语句，错误信息里的 DETAIL 写得很清楚：`Key (customer_id)=(99) is not present in table "customers"`。（这里的练习环境每次运行完都会自动撤销修改，所以你可以放心地试。）

## 示例 {#example}

问题：shop 的五张表分别用什么作主键，又通过哪些外键互相引用？

按步骤读出一张表的“键”：

1. **找主键：哪一列（或哪几列）能唯一认出一行？** 通常叫 `id`。
2. **找外键：哪些列的名字以 `_id` 结尾，或者明显指向别的东西？** 它们往往是外键。
3. **确认引用方向：外键在哪张表，就说明那张表的一行“属于”或“指向”另一张表的一行。**

| 表 | 主键 | 外键 → 引用的表 |
|---|---|---|
| `categories` | `id` | 无 |
| `customers` | `id` | `referred_by` → `customers.id` |
| `products` | `id` | `category_id` → `categories.id` |
| `orders` | `id` | `customer_id` → `customers.id` |
| `order_items` | `(order_id, product_id)` | `order_id` → `orders.id`，`product_id` → `products.id` |

外键总是放在“多”的那一边：一位顾客有很多笔订单，所以 `customer_id` 存在 `orders` 里，而不是在 `customers` 里存一串订单编号。这就是{{term:one-to-many}}的标准做法。

## 变体 {#variants}

**由几列组成的主键。** `order_items` 没有单独的 `id` 列，它的主键是 `order_id` 和 `product_id` 两列的组合，叫{{term:composite-key}}。单看任何一列都会重复，但“哪笔订单 + 哪种商品”这一对不会重复：

```sql run
SELECT * FROM order_items WHERE order_id = 3;
```

订单 3 出现了三次，但每次的商品都不同。

**多对多关系。** 一笔订单可以有多种商品，一种商品也会出现在多笔订单里。这种{{term:many-to-many}}没法只靠一个外键表示，需要一张中间的{{term:junction-table}}，`order_items` 就是。它有两个外键，分别指向两边。

**唯一约束。** `customers.email` 也不会重复，它有一个{{term:unique-constraint}}。但它不是主键：邮箱可以为空，也可能会改。为什么不用邮箱、名字这种本身有意义的值（{{term:natural-key}}）作主键，而是用一个没有任何含义的编号（{{term:surrogate-key}}）？因为有意义的值会变，而主键一旦被别的表引用，就最好永远不变。

**引用自己的表。** `customers.referred_by` 引用的还是 `customers` 自己，记录“这位顾客是被谁推荐来的”。这叫{{term:self-reference}}：

```sql run
SELECT id, name, referred_by FROM customers;
```

Kenji Sato 的 `referred_by` 是 1，表示 Kenji Sato 是被顾客 1（Lin Wei）推荐的。

## 深入 {#deeper}

**外键可以是 NULL。** 外键只检查“有值的时候，这个值必须存在”。没有值是允许的：Gift Card 的 `category_id` 是 NULL，表示它不属于任何分类；Lin Wei 的 `referred_by` 是 NULL，表示没有人推荐。如果不允许为空，需要另外加上 `NOT NULL`，比如 `orders.customer_id` 就是这样定义的。

**唯一约束允许多个 NULL。** Noah Martin 和 Mei Tanaka 的 `email` 都是 NULL，却没有违反唯一约束。在 PostgreSQL 默认的规则里，两个 NULL 不算相等，因为两个未知的值是否相同本身就是未知的。

**被引用的行不能随便删。** 删除顾客 1 会失败，因为别的行还在引用 ta：

```sql run error
DELETE FROM customers WHERE id = 1;
```

报错提到的约束是 `customers_referred_by_fkey`：Kenji Sato 和 Chen Yu 的 `referred_by` 都指向顾客 1。就算没有这一层，Lin Wei 的订单也会阻止删除。这是外键的默认行为；定义外键时也可以选择 `ON DELETE CASCADE`（连带删除引用它的行），但这类设计要非常谨慎。

**主键的值没有含义。** `id` 只是一个标签。它不代表顺序或数量，也不保证连续：删掉一行后，中间会留下空号，这完全正常。不要用 `id` 做计算，也不要根据 `id` 的大小推断谁先注册。

## 常见错误 {#mistakes}

**1. 把名字当成能唯一认出一行的东西。** 名字会重复，也会改。要指向某一位具体的顾客，用 `id`。

**2. 以为外键必须和它引用的主键同名。** `orders.customer_id` 引用的是 `customers.id`，名字并不相同。外键和主键之间的关系是表结构里定义好的，不是靠列名猜出来的。

**3. 搞反了外键在哪一边。** 新手有时会想在 `customers` 里加一列存这位顾客的所有订单编号。一个格子只能放一个值，这条路走不通。一对多的关系里，外键总在“多”的那一边。

**4. 主键重复。** 新增一个分类时随手用了编号 1，数据库会拒绝：

```sql run error
INSERT INTO categories (id, name) VALUES (1, 'Garden');
```

`duplicate key value violates unique constraint "categories_pkey"`：编号 1 已经属于 Books 了。

**5. 把唯一约束当成主键。** `email` 也是唯一的，但它允许为空，一张表也可以有好几个唯一约束；主键只有一个，而且永远不为空。

## 小结 {#summary}

- 主键唯一地认出每一行：值不重复、不为空，每张表最多一个。
- 外键的值必须是另一张表主键里已经存在的值，数据库会强制保证参照完整性。
- 一对多关系中，外键放在“多”的那一边；多对多关系需要一张关联表，比如 `order_items`。
- 主键可以由几列组成；外键可以为 NULL，表示“没有引用”。
- 主键用没有含义、不会改变的编号最稳妥。
