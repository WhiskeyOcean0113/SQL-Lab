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

Every `customer_id` has a matching customer in `customers`, and the database enforces that. This is called {{term:referential-integrity}}: you cannot record an order for "customer 99", because shop has no such customer. Try it:

```sql run error
INSERT INTO orders (id, customer_id, ordered_at, status)
VALUES (25, 99, '2024-07-01 10:00', 'pending');
```

The database refuses, and the DETAIL line says exactly why: `Key (customer_id)=(99) is not present in table "customers"`. (The practice database undoes every change after each run, so experiment freely.)

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

## Going deeper {#deeper}

**A foreign key may be NULL.** A foreign key only checks that a value, when present, exists. No value is allowed: Gift Card's `category_id` is NULL because it belongs to no category, and Lin Wei's `referred_by` is NULL because nobody referred Lin Wei. To forbid that, add `NOT NULL`, as `orders.customer_id` does.

**A unique constraint allows several NULLs.** Noah Martin and Mei Tanaka both have a NULL `email`, and the unique constraint does not mind. By PostgreSQL's default rule two NULLs are not equal, because whether two unknown values are the same is itself unknown.

**Referenced rows cannot simply be deleted.** Deleting customer 1 fails because other rows still point at that customer:

```sql run error
DELETE FROM customers WHERE id = 1;
```

The error names the constraint `customers_referred_by_fkey`: the `referred_by` of both Kenji Sato and Chen Yu is 1. Even without that, Lin Wei's orders would block the delete. This is the default behaviour of a foreign key. A foreign key can instead be declared `ON DELETE CASCADE`, which deletes the referencing rows too, but that is a design choice to make with great care.

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

## Summary {#summary}

- A primary key identifies each row: no duplicates, no NULLs, at most one per table.
- A foreign key's values must exist in another table's primary key; the database enforces this referential integrity.
- In a one-to-many relationship the foreign key sits on the "many" side; a many-to-many relationship needs a junction table such as `order_items`.
- A primary key can span several columns; a foreign key can be NULL, meaning "refers to nothing".
- Meaningless numbers that never change make the safest primary keys.
