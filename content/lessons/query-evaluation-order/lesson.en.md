## Why you need it {#why}

This query looks for products that cost less than 20 dollars after a 10% discount. It looks perfectly reasonable, and it fails:

```sql run error
SELECT name, price * 0.9 AS sale_price
FROM products
WHERE sale_price < 20;
```

`sale_price` is defined on the line right above, yet the database says it `does not exist`. Spelling is not the problem; order is. When the database handles `WHERE`, `SELECT` has not run yet, so the name `sale_price` does not exist.

This lesson gives you a map of a whole query. Every new {{term:clause}} you learn later has a place on it.

## Core idea {#core}

You write SQL in this order:

```sql
SELECT … FROM … WHERE … GROUP BY … HAVING … ORDER BY … LIMIT …
```

The database logically handles it in this order:

1. `FROM` (including `JOIN`): decide which tables the data comes from.
2. `WHERE`: filter row by row, keeping rows where the condition is true.
3. `GROUP BY`: put rows into groups (chapter 3).
4. `HAVING`: filter the groups (chapter 3).
5. `SELECT`: compute the output columns and give them names.
6. `DISTINCT`: remove duplicate rows.
7. `ORDER BY`: sort.
8. `LIMIT` / `OFFSET`: keep only part of the result.

This is the {{term:logical-order}}. Each step takes the {{term:intermediate-table}} produced by the step before and hands its own result to the next one. Picture an assembly line: data enters at `FROM`, is filtered, computed and sorted station by station, and leaves at `LIMIT`.

Two consequences come up again and again:

- **A name given in `SELECT` is visible only to the steps after it.** `ORDER BY` can use it; `WHERE` cannot.
- **`WHERE` can use any column, including ones you never select.** When `WHERE` runs, every column `FROM` produced is still there.

This is the logical order, not the work the database physically does. PostgreSQL chooses the fastest way to execute a query, for example using an index to find a few rows before reading anything else. However it executes, the result is exactly what working through these steps in order would give. So to reason about what a query returns, the logical order is all you need.

## Example {#example}

Task: which are the two most expensive products in the Electronics category (`category_id` 2)?

```sql run
SELECT name, price
FROM products
WHERE category_id = 2
ORDER BY price DESC
LIMIT 2;
```

Follow the logical order and write down each intermediate result:

1. **`FROM products`**: all 16 products, 6 columns.
2. **`WHERE category_id = 2`**: 4 rows remain: Noise-Cancelling Headphones, Mechanical Keyboard, USB-C Hub and 4K Monitor.
3. **`SELECT name, price`**: each row keeps two columns.
4. **`ORDER BY price DESC`**: highest price first: 4K Monitor 399.00, Noise-Cancelling Headphones 249.00, Mechanical Keyboard 129.00, USB-C Hub 35.00.
5. **`LIMIT 2`**: keep the first two rows.

You can stop a query at any step to see that step's intermediate result. Here it is cut off after `WHERE`:

```sql run
SELECT *
FROM products
WHERE category_id = 2;
```

After step 2, the order is whatever the database happens to produce; it only becomes definite at step 4. Without the `ORDER BY`, `LIMIT 2` would return any two rows, not the two most expensive.

## Variations {#variants}

**Using an alias in `ORDER BY`.** `ORDER BY` comes after `SELECT`, so it can use a name defined there:

```sql run
SELECT name, price * 0.9 AS sale_price
FROM products
ORDER BY sale_price
LIMIT 3;
```

**Filtering on a column you do not select.** This query outputs only names but filters on price, which is fine:

```sql run
SELECT name
FROM products
WHERE price > 100;
```

**`JOIN` is part of the `FROM` step.** As chapter 4 shows, `JOIN` combines tables into one, and that happens before `WHERE`. That is why `WHERE` can use columns from every joined table.

## Going deeper {#deeper}

**Aliases are limited in `ORDER BY` too.** An alias in `ORDER BY` must stand alone; it cannot be part of an expression. `ORDER BY sale_price` works, but `ORDER BY sale_price + 1` fails with the same `does not exist` error:

```sql run error
SELECT name, price * 0.9 AS sale_price
FROM products
ORDER BY sale_price + 1;
```

In the PostgreSQL manual's words, an output column name "has to stand alone". When you need it inside an expression, repeat the original expression: `ORDER BY price * 0.9 + 1`.

**Other databases.** The logical order comes from the SQL standard and most databases follow it, with some differences in detail. SQLite lets `WHERE` use aliases from `SELECT`, and MySQL lets `HAVING` use them. Those queries fail in PostgreSQL. Write to the standard logical order and your queries run everywhere.

**The full map has a few more stops.** `UNION`, `INTERSECT` and `EXCEPT` (chapter 5) come after `DISTINCT` and before `ORDER BY`, and the `WITH` clause (chapter 6) comes before everything. Add them to the map when you get there.

## Common mistakes {#mistakes}

**1. Using a `SELECT` alias in `WHERE`.** That is the example at the top. The fix is to write out the expression in `WHERE`:

```sql
SELECT name, price * 0.9 AS sale_price
FROM products
WHERE price * 0.9 < 20;
```

**2. Writing the clauses in the wrong order.** The written order is fixed, and putting `ORDER BY` before `WHERE` is a syntax error:

```sql run error
SELECT name, price
FROM products
ORDER BY price
WHERE price < 30;
```

The logical order differs from the written order, but the written order itself cannot be rearranged.

**3. Thinking `LIMIT` runs before `ORDER BY`.** Some people worry that the database takes 3 rows and then sorts them. It sorts first; `LIMIT` always takes from the sorted result. The more common mistake is the reverse: writing `LIMIT` without `ORDER BY` and expecting "the top few", when you actually get any few.

**4. Thinking you can only filter on selected columns.** Quite the opposite: `WHERE` sees every column that `FROM` produced. Any column in the table can be used to filter or sort, whether or not it appears in `SELECT`.

**5. Using an alias inside an `ORDER BY` expression.** See Going deeper above: aliases must stand alone.

## Summary {#summary}

- The logical order is `FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `DISTINCT` → `ORDER BY` → `LIMIT`.
- Each step takes the previous step's intermediate table and passes on its own.
- Aliases defined in `SELECT` work in `ORDER BY` but not in `WHERE`.
- `WHERE` can use any column of the table, selected or not.
- Row order is definite only after `ORDER BY`; always pair `LIMIT` with `ORDER BY`.
