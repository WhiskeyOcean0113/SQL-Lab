## Why you need it {#why}

The `reviews` table from the last lesson accepts anything: a rating of 99, a product that does not exist, ten reviews of the same product by the same customer, a review with no rating at all.

The website's code could check these rules, of course. But more than one program writes to a database: back-office scripts, data imports, hand-written SQL. Whichever one skips a check lets bad data in, and it is hard to clean out afterwards. Write the rules into the table, and the database enforces them on **every** write, wherever it comes from.

## Core idea {#core}

### Five constraints

A {{term:constraint}} is a rule attached to a table. An `INSERT` or `UPDATE` that breaks one is refused as a whole:

| Constraint | Rule | SQLSTATE when broken |
|---|---|---|
| `NOT NULL` | The column must have a value | 23502 |
| `UNIQUE` | The column, or combination of columns, never repeats | 23505 |
| `PRIMARY KEY` | Unique and not null; at most one per table | 23505 or 23502 |
| `REFERENCES` (foreign key) | The value must exist in another table's primary key or unique column | 23503 |
| `CHECK (condition)` | Every row must satisfy the condition | 23514 |

Chapter 0 showed shop's primary keys, foreign keys and unique constraints, and Chapter 7 ran into them while inserting. This lesson writes them yourself.

### After a column, or at the end of the table

A constraint about one column can follow that column's definition directly; it is a column constraint: `rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5)`.

A constraint about several columns goes after all of them; it is a table constraint. `UNIQUE (product_id, customer_id)` means "one review per customer per product", although each column on its own may repeat.

### `CHECK` rejects only "false"

When a `CHECK` condition is false, the row is refused; when it is true **or NULL**, the row passes. So `CHECK (rating BETWEEN 1 AND 5)` does not stop a NULL:

```sql run
CREATE TABLE reviews (
  id     integer PRIMARY KEY,
  rating smallint CHECK (rating BETWEEN 1 AND 5)
);
INSERT INTO reviews VALUES (1, NULL)
RETURNING *;
```

To require a rating, add `NOT NULL` as well. It is the opposite of `WHERE`: `WHERE` keeps only true, `CHECK` refuses only false.

## Syntax {#syntax}

```syntax
CREATE TABLE table_name (
    column_name data_type [ column_constraint [ … ] ] [, …]
    [, table_constraint [, …] ]
)
```

where `column_constraint` is:

```syntax
[ CONSTRAINT constraint_name ]
{ NOT NULL | UNIQUE | PRIMARY KEY | CHECK ( condition )
| REFERENCES ref_table [ ( ref_column ) ] [ ON DELETE { NO ACTION | CASCADE | SET NULL } ] }
```

and `table_constraint` is:

```syntax
[ CONSTRAINT constraint_name ]
{ UNIQUE ( column_name [, …] ) | PRIMARY KEY ( column_name [, …] ) | CHECK ( condition )
| FOREIGN KEY ( column_name [, …] ) REFERENCES ref_table [ ( ref_column [, …] ) ] }
```

Adding a constraint to an existing table:

```syntax
ALTER TABLE table_name ADD [ CONSTRAINT constraint_name ] table_constraint
ALTER TABLE table_name DROP CONSTRAINT constraint_name
```

| Part | What goes there | Rule |
|---|---|---|
| `column_constraint [ … ]` | Constraints after a column | Several may follow, separated by spaces, not commas |
| `table_constraint` | A constraint on one or more columns | After all the columns, preceded by a comma |
| `CONSTRAINT constraint_name` | The constraint's name | Optional; without it the database makes one such as `table_column_check` |
| `CHECK ( condition )` | A condition every row must meet | The brackets are required; the condition may use any column of the row |
| `REFERENCES ref_table ( ref_column )` | The table and column the foreign key points at | Without `ref_column`, the table's primary key; it must be a primary key or unique column |
| `ON DELETE …` | What happens when the referenced row is deleted | Optional; the default, `NO ACTION`, refuses the delete |

The difference between `[ … ]` and `[, …]` matters here: several constraints on one column follow each other with spaces, and only columns and table constraints are separated by commas.

Some definitions, read against the shapes:

- `rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5)`: one column with two column constraints, separated only by a space.
- `product_id integer NOT NULL REFERENCES products (id)`: not null, plus a foreign key.
- `UNIQUE (product_id, customer_id)`: a table constraint; the pair of columns may not repeat.

## Example {#example}

The task: redesign `reviews` so that the database guarantees all of these rules:

- the id is generated and is the primary key;
- a review must name a product and a customer, and both must exist;
- the rating is required and lies between 1 and 5;
- a customer reviews a given product at most once.

1. **Primary key:** `id` numbered automatically, with `PRIMARY KEY`.
2. **Foreign keys plus not null:** `product_id` and `customer_id` each `NOT NULL REFERENCES …`. A foreign key alone is not enough, because it allows NULL.
3. **Rating:** `NOT NULL` plus `CHECK`.
4. **One review per customer and product:** the rule involves two columns, so it is the table constraint `UNIQUE (product_id, customer_id)`.
5. **Insert a valid review, then try one that breaks a rule.**

```sql run
CREATE TABLE reviews (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  integer NOT NULL REFERENCES products (id),
  customer_id integer NOT NULL REFERENCES customers (id),
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  UNIQUE (product_id, customer_id)
);

INSERT INTO reviews (product_id, customer_id, rating)
VALUES (3, 1, 5)
RETURNING *;
```

```sql run error
CREATE TABLE reviews (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  product_id  integer NOT NULL REFERENCES products (id),
  customer_id integer NOT NULL REFERENCES customers (id),
  rating      smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment     text,
  UNIQUE (product_id, customer_id)
);

INSERT INTO reviews (product_id, customer_id, rating)
VALUES (3, 1, 5), (3, 1, 4);
```

The second fails with `duplicate key value violates unique constraint "reviews_product_id_customer_id_key"`: Lin Wei is trying to review SQL Pocket Guide twice. Change `(3, 1, 4)` to `(3, 1, 6)` or `(99, 1, 5)` and run it again to hit the check constraint and the foreign key instead.

## Variations {#variants}

**A `CHECK` comparing two columns.** A promotion must end after it starts. The condition involves two columns, so it is a table constraint:

```sql run error
CREATE TABLE promotions (
  id        integer PRIMARY KEY,
  starts_on date NOT NULL,
  ends_on   date NOT NULL,
  CHECK (ends_on > starts_on)
);
INSERT INTO promotions VALUES (1, '2024-07-10', '2024-07-01');
```

**Naming a constraint.** A default name such as `promotions_check` says nothing about what is checked. Name it yourself and the error explains itself:

```sql run error
CREATE TABLE reviews (
  id     integer PRIMARY KEY,
  rating smallint CONSTRAINT rating_between_1_and_5 CHECK (rating BETWEEN 1 AND 5)
);
INSERT INTO reviews VALUES (1, 0);
```

**When a referenced row is deleted: `ON DELETE`.** By default, a product that still has reviews cannot be deleted. `ON DELETE CASCADE` deletes the reviews along with the product; `ON DELETE SET NULL` sets their `product_id` to NULL instead:

```sql run
CREATE TABLE reviews (
  id         integer PRIMARY KEY,
  product_id integer REFERENCES products (id) ON DELETE CASCADE
);
INSERT INTO reviews VALUES (1, 16), (2, 16), (3, 3);

DELETE FROM products WHERE id = 16;
SELECT * FROM reviews;
```

Deleting the Folding Chair took its two reviews with it.

**Adding a constraint to an existing table.** `ALTER TABLE … ADD CONSTRAINT` first checks every row already in the table:

```sql run error
ALTER TABLE customers
ADD CONSTRAINT customers_city_required CHECK (city IS NOT NULL);
```

`is violated by some row`: two customers have no city. To add this constraint, fix those rows first.

## Going deeper {#deeper}

**NULL gets past `UNIQUE` and `CHECK`.** Two NULLs do not count as duplicates (as with Chapter 0's `email`), and a `CHECK` condition that meets NULL evaluates to NULL, which passes. To allow at most one NULL, PostgreSQL 15 and later accept `UNIQUE NULLS NOT DISTINCT`.

**A primary key is unique plus not null.** `PRIMARY KEY` makes its columns `NOT NULL` automatically, so no column of a composite key may be empty. A table may have several unique constraints but only one primary key.

**A foreign key must point at a primary key or unique column.** `REFERENCES customers (name)` fails with `there is no unique constraint matching given keys`: names can repeat, so the key would not know which row it means.

**Constraints and checks in application code.** Checks in a web form give users immediate feedback; database constraints guarantee the data itself is clean. You want both: the first for the experience, the second as the last line of defence.

**Foreign keys are not indexed automatically.** Primary keys and unique constraints get an {{term:index}} automatically, but a foreign key column does not. Joining on it, or deleting referenced rows, can be slow without one; Chapter 9 covers this.

**Other databases.** MySQL before 8.0.16 parsed `CHECK` but never enforced it; SQLite does not check foreign keys unless you first run `PRAGMA foreign_keys = ON`.

## Common mistakes {#mistakes}

**1. A `CHECK` condition without brackets.**

```sql run error
CREATE TABLE t (n integer CHECK n > 0);
```

`syntax error at or near "n"`. `CHECK` must be followed by brackets: `CHECK (n > 0)`.

**2. A composite key written as two `PRIMARY KEY`s.**

```sql run error
CREATE TABLE wishlist (
  customer_id integer PRIMARY KEY,
  product_id  integer PRIMARY KEY
);
```

`multiple primary keys for table "wishlist" are not allowed`. Two column constraints make two primary keys, and a table may have only one. A key of several columns is a table constraint: `PRIMARY KEY (customer_id, product_id)`.

**3. A foreign key pointing at a column that can repeat.** `REFERENCES customers (name)` fails with `there is no unique constraint matching given keys for referenced table "customers"`. Point foreign keys at the primary key, usually `id`.

**4. Expecting `CHECK` to stop NULL.** See Core idea: `CHECK (rating BETWEEN 1 AND 5)` lets NULL through. A column that must have a value also needs `NOT NULL`.

**5. A foreign key without `NOT NULL`.** `product_id integer REFERENCES products (id)` allows NULL, meaning a review that belongs to no product. If every review must belong to a product, write `NOT NULL REFERENCES …`.

**6. Adding `ON DELETE CASCADE` out of habit.** It is convenient, but a single `DELETE` can then remove large amounts of data across several tables, without a word. Use it only where child rows mean nothing without their parent, such as order items and their order; for records with value of their own, like reviews or orders, a failing delete is the safer default.

## Summary {#summary}

- Constraints write rules into a table; the database checks every `INSERT` and `UPDATE` and refuses the whole statement when one is broken.
- The five constraints: `NOT NULL`, `UNIQUE`, `PRIMARY KEY`, foreign keys with `REFERENCES`, and `CHECK`.
- Constraints on one column follow it, separated by spaces; constraints on several columns are table constraints.
- `CHECK` refuses only false, so NULL passes; required columns need `NOT NULL`.
- Foreign keys point at primary keys or unique columns; `ON DELETE` decides what happens when the referenced row goes, and by default the delete is refused.
