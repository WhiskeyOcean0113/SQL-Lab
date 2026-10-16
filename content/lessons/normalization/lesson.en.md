## Why you need it {#why}

Had shop started out keeping its books in a spreadsheet, it would probably look like this: one row per product sold, with the order number, order time, customer name, customer email, product name, category name, quantity and unit price alongside. Everything sits in one table, and nothing needs a join.

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

Lin Wei's email is written 10 times in this table. It looks like a little wasted space, but the real trouble comes later: when the email changes, how many rows must change, and what if one is missed? That is why shop is split into five tables.

## Core idea {#core}

### Repetition causes three anomalies

Storing the same fact several times is {{term:redundancy}}, and it causes three kinds of trouble:

- **An {{term:update-anomaly}}**: changing one fact means changing many rows, and missing one leaves the data contradicting itself.
- **An insert anomaly**: some facts cannot be recorded on their own. A new category with no products sold yet has nowhere to go in `order_lines`.
- **A delete anomaly**: deleting a row takes other facts with it. The 4K Monitor appears only in cancelled order 5; delete that order and the fact that the shop stocks a 4K Monitor goes too.

### Functional dependency: what determines what

If knowing A always tells you B, then B has a {{term:functional-dependency}} on A. In shop:

- A customer id tells you the customer's name, email and city.
- A product id tells you the product's name, price and category.
- An order id tells you when it was placed and by which customer.
- A quantity needs both the order and the product to be known.

{{Term:normalization}} splits tables along these dependencies, so that each fact lives only in the table it truly depends on.

### Three {{term:normal-form|normal forms}}

| Normal form | Requires | Broken by |
|---|---|---|
| First (1NF) | One value per cell, no repeating groups of columns | `'books,sale'` in a `tags` column; three columns `phone1`, `phone2`, `phone3` |
| Second (2NF) | 1NF, and every column depends on the **whole** primary key, not part of it | A key of `(order_id, product_id)` with a `product_name` that depends on `product_id` alone: a {{term:partial-dependency}} |
| Third (3NF) | 2NF, and non-key columns depend only on the key, not on other non-key columns | `customer_city` in `orders`, which depends on `customer_id` and only through it on the order: a {{term:transitive-dependency}} |

A handy summary: every column depends on the key, the whole key, and nothing but the key.

shop's five tables are already in third normal form, which is why every chapter so far has been joining tables: information split apart is joined back together when you query.

## Syntax {#syntax}

Normalization has no syntax of its own; it is a design method. When splitting tables, the most useful statement creates a table straight from a query, carrying the existing data across:

```syntax
CREATE TABLE table_name [ ( column_name [, …] ) ] AS select_statement
```

| Part | What goes there | Rule |
|---|---|---|
| `table_name` | The new table's name | Must not match an existing table |
| `( column_name [, …] )` | The new table's column names | Optional; without it, the query's column names are used |
| `select_statement` | Any query | Each row it returns becomes a row of the new table, with the same column types |

The new table copies only data and types. **No constraints come with it**: no primary key, no foreign keys, no `NOT NULL`. Add them afterwards with the previous lesson's `ALTER TABLE … ADD`.

Some statements, read against the shape:

- `CREATE TABLE order_lines AS SELECT … FROM orders JOIN …` in Why you need it: a join query builds a wide table.
- `CREATE TABLE line_customers AS SELECT DISTINCT customer_name, customer_email FROM order_lines`: the customers split out of the wide table, with `DISTINCT` keeping one row each.

## Example {#example}

The task: watch an update anomaly happen, then split the customer information out along its dependency.

1. **Build the wide table,** as in Why you need it.
2. **Change just some rows.** Lin Wei changes email, but only order 22's rows are updated.
3. **Ask for Lin Wei's email.** There should be one answer; there are two.
4. **Split the table.** The name determines the email, so the email belongs with the name in a customer table, one row per customer.

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

Two emails, and the database can no longer say which is right. Split apart, the email is stored once:

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

Ten customers, one row each. Changing an email now means changing one row, and no contradiction is possible. A real design would also give customers an unchanging id as primary key, because names can repeat and make poor keys. shop's `customers` table does exactly that.

## Variations {#variants}

**Breaking first normal form: a list in one cell.** Store each order's product ids as comma-separated text, then look for "orders containing product 1":

```sql run
CREATE TABLE order_products_flat (order_id integer, product_ids text);
INSERT INTO order_products_flat
VALUES (1, '1,8'), (2, '4'), (3, '3,12,11');

SELECT order_id
FROM order_products_flat
WHERE product_ids LIKE '%1%';
```

Order 3 turns up as well, because "12" and "11" both contain "1". A column like this can have no foreign key and cannot be queried reliably. The right design is one value per row, which is shop's `order_items`.

**One value per row: a tag table.** A product can have several tags, each on its own row, with "product + tag" as the primary key:

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

**Breaking second normal form: depending on part of the key.** Suppose `order_items` also stored the product name:

```sql run
CREATE TABLE items_wide AS
SELECT i.order_id, i.product_id, i.quantity, p.name AS product_name
FROM order_items AS i
JOIN products AS p ON p.id = i.product_id;

SELECT * FROM items_wide WHERE product_id = 8 ORDER BY order_id;
```

The key is `(order_id, product_id)`. `quantity` depends on the whole key, but `product_name` on `product_id` alone, so the name Ceramic Mug is repeated 4 times. It belongs back in `products`.

**Breaking third normal form: depending through another column.** Suppose `orders` stored the customer's city:

```sql run
CREATE TABLE orders_wide AS
SELECT o.id AS order_id, o.customer_id, c.city AS customer_city
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id;

SELECT * FROM orders_wide WHERE customer_id = 1 ORDER BY order_id;
```

`customer_city` is determined by `customer_id`, which in turn is determined by the order id. When Lin Wei moves, four orders need changing instead of one customer.

## Going deeper {#deeper}

**`unit_price` is not redundancy.** `order_items.unit_price` and `products.price` look like the same fact, but they are not: one is the price paid when the order was placed, the other is today's price. Order 11's headphones sold for 239.00 and now list at 249.00. To judge redundancy, ask whether it is the same fact, not whether the values match.

**Storing computed values means keeping them in sync.** A `total` column on `orders` is convenient to read, but every change to the items must remember to update it, and a single lapse leaves the data contradicting itself. When you need such a value, compute it in a query, or in the next lesson's {{term:view}}, first.

**{{Term:denormalization}}.** Reporting and data warehouses, which are read-only and chase query speed, sometimes merge data into wide tables on purpose, trading redundancy for fewer joins. That is a deliberate choice made knowing the cost, and it needs a way to keep the copies consistent. For everyday business tables, normalize first.

**Higher normal forms.** Beyond 3NF come BCNF and the fourth and fifth normal forms, which deal with rarer kinds of dependency. Most tables have most of their problems solved at 3NF.

## Common mistakes {#mistakes}

**1. A list of values in one cell.** A column like `'1,8'` can only be searched with `LIKE`, which wrongly matches `'12'`, and it cannot have a foreign key. See the first variation. Split it into a table with one value per row.

**2. Numbered columns instead of a table.** With `phone1`, `phone2` and `phone3`, a fourth phone has nowhere to go, and "whose number is this?" needs the condition three times. Split them into `customer_phones (customer_id, phone)`.

**3. Storing values that can be computed.** An order's total can be computed from its items. Store a copy in `total`, and it falls out of step as soon as an item changes:

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

The stored 67.00 no longer matches the real 104.50.

**4. Using names as keys after a split.** Make `customer_name` the primary key of a split-out customer table, and two customers with the same name collide. Give each split-out entity an id as primary key, and have other tables reference that id with foreign keys.

**5. Expecting `CREATE TABLE … AS` to bring constraints.** The new table has no primary key, foreign keys or `NOT NULL`, and accepts anything. After splitting, add the constraints.

## Summary {#summary}

- Storing one fact several times causes update, insert and delete anomalies.
- Normalization splits tables along functional dependencies so that each fact is stored once.
- 1NF: one value per cell; 2NF: depend on the whole key; 3NF: depend only on the key, not through another column.
- Split tables are joined back together in queries; `CREATE TABLE … AS` carries existing data into a new table, but constraints must be added by hand.
- A column like the price paid only looks repeated; it is a different fact. Values that can be computed are best computed when needed.
