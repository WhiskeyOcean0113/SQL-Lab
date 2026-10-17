## Why you need it {#why}

shop might one day have two customers called Chen Yu, and people change their names and email addresses. So how should `orders` record who placed an order, in a way that always points at exactly one person?

The answer is to give every row an identifier that never repeats and is never missing, and to let other tables refer to rows through it. Those are the {{term:primary-key}} and the {{term:foreign-key}}. Once you understand them, you can read how the five shop tables relate, and those relations are exactly what joins follow later on.

## Core idea {#core}

A **primary key** is a column (or a few columns) whose value identifies each row of the table. The database guarantees two things:

- **Unique**: no two rows have the same primary key.
- **Not null**: a primary key is never {{term:null}}.

A table has at most one primary key. In shop, `customers`, `products`, `orders` and `categories` all use their `id` column.

A **foreign key** is a column whose values must already exist in another table's primary key. `orders.customer_id` is one; it references `customers.id`:

```sql run
SELECT id, customer_id, status FROM orders;
```

Every `customer_id` has a matching customer in `customers`, and the database enforces that. This is called {{term:referential-integrity}}: you cannot record an order for "customer 99", because shop has no such customer.

Primary and foreign keys are not just conventions; the database itself guards them. To watch it do so, you need to add a row to a table, which is the next section.

## Syntax {#syntax}

A row is added with an `INSERT` {{term:statement}}. Chapter 7 covers its other forms; this lesson uses only the basic one:

```syntax
INSERT INTO table_name ( column_name [, …] )
VALUES ( expression [, …] )
```

| Placeholder | What goes there | Can it be left out? |
|---|---|---|
| `table_name` | The table that gets the row | No |
| `column_name [, …]` | The columns to fill, separated by commas | No; this lesson always lists them |
| `expression [, …]` | A value for each column, such as `25` or `'pending'`, matching the columns in number and order | No |

Read one statement against the shape. Customer 11 places a new order:

```sql run
INSERT INTO orders (id, customer_id, ordered_at, status)
VALUES (25, 11, '2024-07-01 10:00', 'pending');
SELECT * FROM orders WHERE id = 25;
```

`table_name` is `orders`, and the four column names pair up with four values: id 25, customer 11, the time of the order, and the status pending. The time is a date plus a time of day, written in single quotes like a date. A semicolon separates the two statements, which run in turn; the `SELECT` shows you the new row.

The practice database undoes every change after each run, so experiment freely: shop's data never changes.

Now read a second one, with customer 11 changed to 99:

```sql run error
INSERT INTO orders (id, customer_id, ordered_at, status)
VALUES (25, 99, '2024-07-01 10:00', 'pending');
```

The database refuses, and the DETAIL line says exactly why: `Key (customer_id)=(99) is not present in table "customers"`. That is the foreign key on guard.

## Example {#example}

Task: what is the primary key of each shop table, and which foreign keys connect them?

To read the keys of a table, step by step:

1. **Find the primary key: which column (or columns) identifies a row?** Usually it is called `id`.
2. **Find the foreign keys: which columns end in `_id` or clearly point at something else?** They usually are foreign keys.
3. **Check the direction: the table holding the foreign key is the one whose rows belong to, or point at, rows of the other table.**

| Table | Primary key | Foreign key → referenced table |
|---|---|---|
| `categories` | `id` | none |
| `customers` | `id` | `referred_by` → `customers.id` |
| `products` | `id` | `category_id` → `categories.id` |
| `orders` | `id` | `customer_id` → `customers.id` |
| `order_items` | `(order_id, product_id)` | `order_id` → `orders.id`, `product_id` → `products.id` |

A foreign key always sits on the "many" side. One customer has many orders, so `customer_id` lives in `orders`; `customers` does not hold a list of order numbers. That is the standard shape of a {{term:one-to-many}}.

## Variations {#variants}

**A key made of several columns.** `order_items` has no `id` of its own. Its primary key is the pair `order_id` and `product_id`, a {{term:composite-key}}. Either column alone repeats, but the pair "which order + which product" never does:

```sql run
SELECT * FROM order_items WHERE order_id = 3;
```

Order 3 appears three times, each time with a different product.

**Many-to-many relationships.** An order can contain many products, and a product can appear in many orders. A single foreign key cannot express such a {{term:many-to-many}}; it takes a {{term:junction-table}} in between, and `order_items` is exactly that, with one foreign key pointing at each side.

**Unique constraints.** `customers.email` never repeats either, thanks to a {{term:unique-constraint}}, but it is not the primary key: an email can be missing, and it can change. Why use a meaningless number (a {{term:surrogate-key}}) instead of a meaningful value such as an email or a name (a {{term:natural-key}})? Because meaningful values change, and once other tables reference a primary key it should never change.

**A table that refers to itself.** `customers.referred_by` references `customers` itself, recording who referred each customer. This is a {{term:self-reference}}:

```sql run
SELECT id, name, referred_by FROM customers;
```

Kenji Sato's `referred_by` is 1, meaning Kenji Sato was referred by customer 1, Lin Wei.

**Key names.** Every key has a name, given by a fixed rule: a primary key is `table_pkey`, a foreign key `table_column_fkey` and a unique constraint `table_column_key`. The rule is worth knowing, because a violated constraint is reported by this name. The refused statement in Syntax fails with `violates foreign key constraint "orders_customer_id_fkey"` on its first line, and you know at once that the foreign key on `orders.customer_id` failed.

## Going deeper {#deeper}

**A foreign key may be NULL.** A foreign key only checks that a value, when present, exists. No value is allowed: Gift Card's `category_id` is NULL because it belongs to no category, and Lin Wei's `referred_by` is NULL because nobody referred Lin Wei. To forbid that, add `NOT NULL`, as `orders.customer_id` does.

**A unique constraint allows several NULLs.** Noah Martin and Mei Tanaka both have a NULL `email`, and the unique constraint does not mind. By PostgreSQL's default rule two NULLs are not equal, because whether two unknown values are the same is itself unknown.

**Referenced rows cannot simply be deleted.** A foreign key guards the other direction too: while any row points at customer 1, the database refuses to delete that customer. Kenji Sato and Chen Yu both have `referred_by` 1, and Lin Wei still has orders. Statements that delete rows come in Chapter 7, where you will see this rule in action. A foreign key can instead be declared to delete the referencing rows along with it (Chapter 8), but that is a design choice to make with great care.

**A composite key checks the whole combination.** `order_items` already has the row "order 3 + product 3", so inserting it again is refused:

```sql run error
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (3, 3, 1, 19.99);
```

The DETAIL reads `Key (order_id, product_id)=(3, 3) already exists`, naming both columns together. "Order 3 + product 4" would go in, because that pair has not appeared yet, even though 3 and 4 each exist on their own.

**Primary key values mean nothing.** An `id` is a label. It does not encode order or quantity, and it need not be continuous: deleting a row leaves a gap, which is perfectly normal. Do not calculate with ids, and do not infer who signed up first from their size.

## Common mistakes {#mistakes}

**1. Treating a name as something that identifies a row.** Names repeat and change. To point at one particular customer, use the `id`.

**2. Expecting a foreign key to share its name with the key it references.** `orders.customer_id` references `customers.id`; the names differ. The relationship is defined in the schema, not guessed from column names.

**3. Putting the foreign key on the wrong side.** Beginners sometimes want a column in `customers` holding all of a customer's order numbers. A cell holds one value, so that cannot work. In a one-to-many relationship the foreign key belongs on the "many" side.

**4. A duplicate primary key.** Adding a category with the number 1 is refused:

```sql run error
INSERT INTO categories (id, name) VALUES (1, 'Garden');
```

`duplicate key value violates unique constraint "categories_pkey"`: number 1 already belongs to Books.

**5. Mistaking a unique constraint for a primary key.** `email` is unique too, but it allows NULL, and a table can have several unique constraints. There is exactly one primary key, and it is never NULL.

**6. Writing the referencing row before the row it references.** Recording the items of a new order fails if the order itself is not there yet:

```sql run error
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (25, 3, 1, 19.99);
```

`Key (order_id)=(25) is not present in table "orders"`: the item points at an order 25 that does not exist. Reverse the order of the statements, the order first and its items second:

```sql run
INSERT INTO orders (id, customer_id, ordered_at, status)
VALUES (25, 11, '2024-07-01 10:00', 'pending');
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (25, 3, 1, 19.99);
SELECT * FROM order_items WHERE order_id = 25;
```

Deleting works the other way round: the items first, then the order.

## Summary {#summary}

- A primary key identifies each row: no duplicates, no NULLs, at most one per table, possibly spanning several columns.
- A foreign key's values must exist in another table's primary key; the database enforces this referential integrity. A foreign key can be NULL, meaning "refers to nothing".
- In a one-to-many relationship the foreign key sits on the "many" side; a many-to-many relationship needs a junction table such as `order_items`.
- `INSERT INTO table_name (columns, …) VALUES (values, …)` adds a row; a statement that breaks a primary or foreign key is refused, and the error names the key.
- Meaningless numbers that never change make the safest primary keys.
