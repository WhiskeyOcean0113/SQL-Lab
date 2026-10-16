## Why you need it {#why}

A new customer, Olivia Brown, signed up in Sydney today. Every statement in this course so far has only read data; none of them can put this customer into `customers`.

From this chapter on, we change data. As before, SQL Lab undoes every change when a run ends, so you can insert, update and delete freely: the next run starts from the original data.

## Core idea {#core}

### A row is a list of values

`INSERT` adds new rows to a table. You list the columns to fill, then give the matching values:

```sql run
INSERT INTO categories (id, name)
VALUES (6, 'Garden');
SELECT * FROM categories ORDER BY id;
```

Values match columns **by position**: the first value goes into the first column, the second into the second, whatever their names. Each value's type must suit its column.

### Columns you leave out

A column missing from the list gets its {{term:default-value}}. A column created without one defaults to NULL. None of shop's columns has a default, so every column you leave out is NULL.

### Constraints check first, then the row is written

Before a row is written, it must pass every constraint on the table: the {{term:primary-key}} must not repeat, a {{term:foreign-key}} must point at an existing row, a {{term:not-null-constraint}} needs a value, and a {{term:check-constraint}} needs a value that meets its condition. If any row fails, **the whole statement has no effect**, and not one row is written.

### It returns no rows

`INSERT` returns no {{term:result-set}}, only how many rows it affected. To see the rows it inserted, either run a `SELECT` afterwards or add `RETURNING` at the end of the statement.

## Syntax {#syntax}

```syntax
INSERT INTO table_name [ ( column_name [, …] ) ]
{ VALUES ( { expression | DEFAULT } [, …] ) [, …] | select_statement }
[ RETURNING { * | expression [ [ AS ] output_name ] } [, …] ]
```

| Part | What goes there | Rule |
|---|---|---|
| `table_name` | The table to insert into | One table per `INSERT` |
| `( column_name [, …] )` | The columns to fill | Optional, but without it you must give every column's value in the table's own column order; this course always writes it |
| `VALUES ( … )` | One row's values | As many as the listed columns, matched by position |
| `[, …]` (after the brackets) | More rows | One pair of brackets per row, separated by commas |
| `DEFAULT` | Use the default for this cell | NULL when no default was set |
| `select_statement` | A query instead of `VALUES` | Each row it returns is inserted; its column count matches the list |
| `RETURNING` | The columns to see after inserting | Optional; written like a select list |

The shape has two `[, …]`s repeating different things: the one inside the brackets repeats values within a row, the one after the brackets repeats whole rows.

Some statements, read against the shape:

- `INSERT INTO categories (id, name) VALUES (6, 'Garden')`: two columns, one row, two values.
- `INSERT INTO categories (id, name) VALUES (6, 'Garden'), (7, 'Toys')`: the same two columns, two rows.
- `INSERT INTO order_items (…) SELECT … FROM …`: a query instead of `VALUES`; as many rows are inserted as it returns.

## Example {#example}

The task: add the new customer Olivia Brown to `customers`, with id 13, email olivia.b@example.com, living in Sydney, Australia, joined on 1 July 2024, referred by nobody.

1. **Check which columns the table has and which must have a value.** Chapter 0 showed that `id`, `name`, `country` and `joined_on` cannot be NULL, while `email`, `city` and `referred_by` can.
2. **Decide which columns to write.** Nobody referred the customer, so leave out `referred_by` and it will be NULL.
3. **Write the values in the order of the list.** Text and dates go in single quotes.
4. **Confirm what was written with `RETURNING`.**

```sql run
INSERT INTO customers (id, name, email, city, country, joined_on)
VALUES (13, 'Olivia Brown', 'olivia.b@example.com', 'Sydney', 'Australia', '2024-07-01')
RETURNING *;
```

`RETURNING *` returns the whole new row, with `referred_by` NULL as expected. `'2024-07-01'` is text; because it is going into a `date` column, PostgreSQL converts it to a date.

## Variations {#variants}

**Several rows at once.** Separate the bracketed rows with commas. One statement with several rows is faster than several `INSERT`s:

```sql run
INSERT INTO categories (id, name)
VALUES (6, 'Garden'),
       (7, 'Toys')
RETURNING id, name;
```

**Only the required columns.** The unwritten `email` and `city` are both NULL:

```sql run
INSERT INTO customers (id, name, country, joined_on)
VALUES (13, 'Olivia Brown', 'Australia', '2024-07-01')
RETURNING id, name, email, city;
```

**Inserting a query's result.** Lin Wei wants to buy order 1 again exactly. Create a new order 25, then copy order 1's items into it at today's prices:

```sql run
INSERT INTO orders (id, customer_id, ordered_at, status)
VALUES (25, 1, '2024-07-01 10:00', 'pending');

INSERT INTO order_items (order_id, product_id, quantity, unit_price)
SELECT 25, i.product_id, i.quantity, p.price
FROM order_items AS i
JOIN products AS p ON p.id = i.product_id
WHERE i.order_id = 1
RETURNING *;
```

The `SELECT` part runs on its own, so check first that it returns exactly the rows you mean to insert, then put `INSERT INTO` in front. That is a good habit whenever you change data.

## Going deeper {#deeper}

**A statement succeeds or fails as a whole.** If one of two rows breaks a constraint, neither is written:

```sql run error
INSERT INTO categories (id, name)
VALUES (6, 'Garden'),
       (6, 'Toys');
```

The second row repeats the first one's primary key, so the whole statement is refused and `Garden` is not kept either. Separate statements, on the other hand, succeed or fail one by one; lesson 4, on {{term:transaction|transactions}}, shows how to bind several together.

**Numbers are rounded silently.** `price` is `numeric(8, 2)`, so inserting `12.345` raises no error and stores `12.35`. Think about precision before inserting, or check with `RETURNING`.

**Where do new ids come from?** shop's ids are written by hand. Computing the next one with `SELECT max(id) + 1` seems to work, but two people inserting at the same moment get the same number, and the second fails on the primary key. Real tables usually let the database generate ids, as Chapter 8 shows.

**`COPY` for bulk loads.** For thousands of rows, PostgreSQL's `COPY` command, which reads files such as CSV directly, is far faster than `INSERT`. SQL Lab has no use for it.

**`RETURNING` is a PostgreSQL extension.** SQLite supports it since 3.35; MySQL does not; SQL Server does the same job with an `OUTPUT` clause.

## Common mistakes {#mistakes}

**1. No column list, and values in the wrong order.**

```sql run error
INSERT INTO categories VALUES ('Garden', 6);
```

`invalid input syntax for type integer: "Garden"`: without a column list, the first value goes into the first column, `id`. Here the types clash, so it fails; had both columns the same type, the values would quietly land in the wrong columns. Always write the column names.

**2. Different numbers of values and columns.** `VALUES (6)` for two columns fails with `INSERT has more target columns than expressions`; three values for two columns with `INSERT has more expressions than target columns`.

**3. Double quotes around text.**

```sql run error
INSERT INTO categories (id, name) VALUES (6, "Garden");
```

`column "Garden" does not exist`: double quotes wrap names, so the database looks for a column called Garden. Text goes in single quotes.

**4. Leaving out a column that cannot be NULL.**

```sql run error
INSERT INTO customers (id, name, joined_on)
VALUES (13, 'Olivia Brown', '2024-07-01');
```

`null value in column "country" … violates not-null constraint`. The DETAIL line `Failing row contains (…)` shows every column's value for the row, so the null cell is easy to spot.

**5. A value that breaks a check constraint.**

```sql run error
INSERT INTO orders (id, customer_id, ordered_at, status)
VALUES (25, 1, '2024-07-01 10:00', 'new');
```

`violates check constraint "orders_status_check"`: `status` must be one of pending, paid, shipped, delivered or cancelled. The constraint's name tells you which table and column it guards.

## Summary {#summary}

- `INSERT INTO table (column, …) VALUES (value, …)`: values match columns by position; always write the column names.
- One `INSERT` can add several rows, or take its rows from a `SELECT` instead of `VALUES`.
- Columns left out get their default, which is NULL unless one was set.
- Every row must pass every constraint; if one fails, the whole statement has no effect.
- `INSERT` reports only how many rows it affected; add `RETURNING` to see the rows.
