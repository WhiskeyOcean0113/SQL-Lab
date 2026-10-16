## Why you need it {#why}

Every order in shop records who placed it, but as a number, not a name:

```sql run
SELECT id, customer_id, status
FROM orders
WHERE id <= 5;
```

Who is customer 1? The answer lives in another {{term:table}}, `customers`:

```sql run
SELECT id, name, city
FROM customers
WHERE id <= 5;
```

Put the two results side by side and you can match them by eye: orders 1 and 4 were both placed by Lin Wei. This lesson is about getting the database to do that matching for you, for every order at once.

> Why not store the customer's name in `orders` directly? Because one customer places many orders. Keeping the name in one place means a change of name is a single edit, and the same person can never be spelled two ways in two orders. The price is that queries have to put the tables back together, which is what a join is for.

## Core idea {#core}

An {{term:inner-join}} pairs up the {{term:row|rows}} of two tables and keeps only the pairs that satisfy the {{term:join-condition}}.

```sql
FROM orders
JOIN customers ON customers.id = orders.customer_id
```

Read it as: for each row of `orders`, find the rows in `customers` whose `id` equals that order's `customer_id`. Each match becomes one row of the result, carrying every {{term:column}} from both tables.

The essentials:

- The join condition follows `ON`. It is the same kind of test you write in `WHERE`, and only pairs for which it is true survive.
- `orders.customer_id` is a {{term:foreign-key}}: its values point at the {{term:primary-key}} `id` of `customers`. Most joins follow exactly this line, foreign key = primary key.
- A row that finds no partner on the other side is left out. Two shop customers have never ordered, so the 24 rows you get from joining `orders` and `customers` include neither Lucas Silva nor Mei Tanaka.
- `JOIN` and `INNER JOIN` mean the same thing; `INNER` is optional.

In the {{term:logical-order}}, `FROM` and `JOIN` come first. The database builds one wide, combined table, `WHERE` filters it, and `SELECT` picks columns from it last. That is why both `WHERE` and `SELECT` can use columns from either table.

Formally, an inner join is the {{term:cartesian-product}} of the two tables (every possible pairing: 24 orders × 12 customers = 288 pairs) with the `ON` condition applied as a filter. The database never actually builds those 288 rows, but its answer always matches this definition. Whenever a join gives you more or fewer rows than you expected, come back to it.

## Syntax {#syntax}

A join is written inside the `FROM` clause; it is part of `FROM`:

```syntax
SELECT select_list
FROM table_name [ [ AS ] alias ]
    [ INNER ] JOIN table_name [ [ AS ] alias ] ON condition
    [ [ INNER ] JOIN … ]
[ WHERE condition ]
```

The `[ [ INNER ] JOIN … ]` line means any number of further `JOIN … ON …` lines of the same shape.

| Part | What goes there | Optional? |
|---|---|---|
| `table_name` | The table being joined | No |
| `alias` | A table {{term:alias}}, usually a letter or two, such as `o` or `c` | Yes; `AS` can also be left out |
| `INNER` | Says this is an inner join | Yes; `JOIN` is an inner join by default |
| `ON condition` | The {{term:join-condition}}: any condition, usually "foreign key = primary key" | Not in an inner join |

Once a table has an alias, the query calls it by that alias everywhere: in `SELECT`, `ON` and `WHERE` alike. Columns are written "alias.column", which is called qualifying them: `o.id` is the order number, `c.id` the customer number.

When the linking columns have the same name in both tables, `USING` can replace `ON`:

```syntax
[ INNER ] JOIN table_name [ [ AS ] alias ] USING ( column_name [, …] )
```

`USING (k)` means `ON left.k = right.k`, and the result keeps a single `k` column. In shop the foreign and primary keys are named differently (`customer_id` against `id`), so this lesson cannot use it; see Going deeper.

The example's query, read against the shape:

- `FROM orders AS o`: the first table, aliased `o`.
- `JOIN customers AS c ON c.id = o.customer_id`: `INNER` left out, the join condition following the foreign key.
- `WHERE o.id <= 5`: filtering after the join; it belongs to the `WHERE` clause, not to the `JOIN`.

## Example {#example}

Task: list the first 5 orders with their id, the name of the customer who placed each one, and the order status.

Work through it in steps:

1. **Find which table holds each column.** Order id and status are in `orders`; the name is in `customers`.
2. **Find the column that links the tables.** `orders.customer_id` points at `customers.id`.
3. **Write `FROM` and `JOIN`.** Give each table a short {{term:alias|table alias}}, `o` and `c`, and join on `c.id = o.customer_id`.
4. **Write `SELECT` with alias.column.** Both tables have an `id`, so say which one you mean: `o.id`.
5. **Filter last.** `WHERE o.id <= 5`.

```sql run
SELECT o.id, c.name, o.status
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
WHERE o.id <= 5;
```

Here is how each row finds its partner:

| `o.id` | `o.customer_id` | matching `customers` row | `c.name` |
|---|---|---|---|
| 1 | 1 | `id = 1` | Lin Wei |
| 2 | 2 | `id = 2` | Ava Thompson |
| 3 | 3 | `id = 3` | Kenji Sato |
| 4 | 1 | `id = 1` | Lin Wei |
| 5 | 4 | `id = 4` | Sofia Rossi |

Lin Wei appears twice because Lin Wei placed two of these orders, so the same `customers` row was paired twice. That is normal for a {{term:one-to-many}}: an inner join does not remove duplicates, and rows on the "one" side repeat once for each partner on the "many" side.

## Variations {#variants}

**The tables can swap places.** `FROM customers AS c JOIN orders AS o ON ...` returns exactly the same rows; only the column order of `SELECT *` changes. For an inner join, which table comes first makes no difference to the result.

**Join conditions go in `ON`, filters go in `WHERE`.** For an inner join, putting `c.country = 'Canada'` in `ON` or in `WHERE` gives the same answer. Still, keep `ON` for how the tables line up and `WHERE` for which rows you want. With the outer joins in the next lesson, the two places behave differently.

```sql run
SELECT o.id, c.name, o.status
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
WHERE c.country = 'Canada';
```

**`alias.*` expands one table's columns.** Every column of the order, plus the customer's name:

```sql run
SELECT o.*, c.name
FROM orders AS o
JOIN customers AS c ON c.id = o.customer_id
WHERE o.id <= 3;
```

`o.*` expands to the 5 columns of `orders`, and `c.name` adds one more. A bare `*` would list every column of both tables, including two called `id`, which are hard to tell apart.

**Joining more than two tables.** Each extra table adds another `JOIN ... ON`. Joins run top to bottom: the first two tables are combined, that result is joined to the third, and so on, so each `ON` can refer to any table above it. This query walks from products all the way to customers to find who bought a Ceramic Mug:

```sql run
SELECT o.id, c.name
FROM products AS p
JOIN order_items AS i ON i.product_id = p.id
JOIN orders AS o ON o.id = i.order_id
JOIN customers AS c ON c.id = o.customer_id
WHERE p.name = 'Ceramic Mug';
```

`order_items` contributes no columns to the output, but it is the only bridge between products and orders. Without it there is nothing to join on.

## Going deeper {#deeper}

**{{Term:null}} never matches.** Gift Card has a NULL `category_id`. `NULL = 1` is not true but unknown, and so is `NULL = NULL`. The gift card therefore matches no category, and 16 products come back as 15 rows:

```sql run
SELECT p.name, c.name AS category
FROM products AS p
JOIN categories AS c ON c.id = p.category_id;
```

Keeping products without a category takes a {{term:left-join}}, the subject of the next lesson.

**USING and NATURAL JOIN.** When both tables name the linking column the same way, `JOIN t2 USING (k)` is shorthand for `ON t1.k = t2.k`, and the result keeps a single `k` column. In shop the foreign key is `customer_id` and the primary key is `id`, so the names differ and only `ON` works.

A {{term:natural-join}} goes further and joins on every column name the two tables share. It knows nothing about foreign keys; it only compares names. In shop that goes wrong quietly:

```sql run
SELECT o.id, c.name
FROM orders AS o
NATURAL JOIN customers AS c;
```

The only shared column name is `id`, so order 5 is paired with customer 5. No error, 12 plausible-looking rows, most of them wrong. The PostgreSQL manual warns that a natural join also changes meaning whenever either table gains a column. Always write `ON`.

**The old comma style.** You will see `FROM orders, customers WHERE customers.id = orders.customer_id` elsewhere. It returns the same rows as an inner join, but the join condition hides among the filters, and forgetting it gives you all 288 pairs. Avoid mixing commas with `JOIN` too: `JOIN` binds more tightly than a comma, which leads to surprising errors.

**How table aliases are written.** `FROM orders AS o` is the same as `FROM orders o`; `AS` is optional. Oracle, however, does not allow `AS` before a table alias, so some teams leave it out by habit. This course always writes `AS`, to match column aliases.

**Other databases.** Standard SQL requires an inner join to have `ON` or `USING`, and PostgreSQL enforces it with a syntax error. MySQL and SQLite accept a bare `JOIN` and treat it as a {{term:cross-join}}, silently returning every pairing. There, a forgotten `ON` raises no error at all.

## Common mistakes {#mistakes}

**1. Leaving out the join condition.** It is tempting to think the database will "match the ids automatically". It will not. List two tables with a comma and no condition, and every order pairs with every customer:

```sql
SELECT o.id, c.name
FROM orders AS o, customers AS c;
```

That is 288 rows, twelve times the number of orders. When a result has far more rows than you expect, check the join condition first.

**2. Joining on the wrong column.** `ON c.id = o.id` is valid SQL and returns data, but it compares a customer number with an order number, which have nothing to do with each other. The danger is that it looks right: the first three rows happen to be correct, and the names only go wrong from row 4. Follow the foreign key instead: `ON c.id = o.customer_id`.

**3. Comparing columns that can never be equal.** `ON c.id = o.status` compares a customer number with a status word. PostgreSQL stops with `operator does not exist: integer = text`; a database that does not check types would quietly return nothing. Before writing `ON`, ask whether the two columns hold the same kind of thing.

**4. Ambiguous column names.** Both tables have an `id`, so a bare `id` fails with `column reference "id" is ambiguous`. Qualify it with an alias: `o.id` or `c.id`.

**5. Using the table name after giving it an alias.** Once you write `FROM orders AS o`, the table is called `o` for the rest of the query. Writing `orders.id` fails with `invalid reference to FROM-clause entry for table "orders"`.

**6. `JOIN` after `WHERE`.**

```sql run error
SELECT o.id, c.name
FROM orders AS o
WHERE o.id <= 3
JOIN customers AS c ON c.id = o.customer_id;
```

That fails with `syntax error at or near "JOIN"`. In the shape, `JOIN` belongs to the `FROM` clause: every join is written before `WHERE` begins.

**7. Joining a table you do not need.** To list the products in the Outdoor category, someone also joins `order_items`:

```sql run
SELECT p.name, c.name AS category
FROM products AS p
JOIN categories AS c ON c.id = p.category_id
JOIN order_items AS i ON i.product_id = p.id
WHERE c.name = 'Outdoor';
```

Each product now repeats once per sale, and the Folding Chair, which has never sold, disappears. An extra join does not just bring along extra information; it changes which rows you get. Join only the tables the question needs.

## Summary {#summary}

- `JOIN ... ON` pairs rows from two tables and keeps the pairs where `ON` is true; `INNER` is optional.
- The condition is usually foreign key = primary key, such as `c.id = o.customer_id`.
- Rows without a partner are dropped, including rows whose join column is NULL.
- In a one-to-many relationship the "one" side repeats; when the row count looks wrong, check the join condition and any extra tables.
- Qualify every column with a table alias, and always write `ON` explicitly.
