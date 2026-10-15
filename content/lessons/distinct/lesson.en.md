## Why you need it {#why}

"Which countries do shop's customers come from?" Querying `country` directly gives 12 rows, with China three times and Canada and Japan twice each:

```sql run
SELECT country
FROM customers;
```

What you want is a list of countries without repeats. That is what `DISTINCT` does.

## Core idea {#core}

`SELECT DISTINCT` removes each {{term:duplicate-row}} from the result, keeping one copy of every distinct row:

```sql run
SELECT DISTINCT country
FROM customers;
```

8 countries.

The key point: **`DISTINCT` compares whole rows, every column of the select list together.** Two rows are duplicates only if all their columns are the same.

In the logical order, `DISTINCT` comes after `SELECT` and before `ORDER BY`: first compute the output columns, then remove duplicates, then sort.

## Syntax {#syntax}

```syntax
SELECT [ ALL | DISTINCT [ ON ( expression [, …] ) ] ] select_list
FROM table_name
[ WHERE condition ]
[ ORDER BY expression [, …] ]
```

| Part | Meaning | Optional? |
|---|---|---|
| `ALL` | Keep every row, duplicates included | Yes; writing nothing means `ALL` |
| `DISTINCT` | Remove rows that duplicate a whole row | Yes |
| `ON ( expression [, …] )` | Deduplicate on the expressions in parentheses only, keeping one row per group (a PostgreSQL extension; see Going deeper) | Yes; only after `DISTINCT` |
| `select_list` | The output columns, in the same shape as Chapter 1's first lesson | No |

What matters most is the position: `DISTINCT` sits between `SELECT` and `select_list` and belongs to none of the columns. That is why it applies to the whole select list rather than the column right after it. Nor can it go between columns: `SELECT country, DISTINCT city` is a syntax error.

Some queries, read against the shape:

- `SELECT DISTINCT country`: one column in the list, deduplicated on that column.
- `SELECT DISTINCT country, city`: two columns, deduplicated on their combination.
- `SELECT DISTINCT ON (country) country, name, joined_on`: with `ON`, deduplicated on `country` alone, while the list still has three columns.

## Example {#example}

Task: which combinations of country and city do customers live in?

1. **Decide which columns to compare.** Country and city, together.
2. **Put both in the select list.** `DISTINCT` removes duplicate combinations of the two.
3. **Think about NULL.** How do customers with an unknown city count?

```sql run
SELECT DISTINCT country, city
FROM customers;
```

9 rows, one more than the 8 distinct countries: China has two combinations, China + Shanghai and China + Beijing. Ireland + NULL and Brazil + NULL count as one row each.

Compare with distinct cities alone:

```sql run
SELECT DISTINCT city
FROM customers;
```

Also 8 rows, one of them NULL. The two customers with an unknown city merged into a single row.

## Variations {#variants}

**`DISTINCT` with sorting.** Sorting after removing duplicates makes the list easier to read:

```sql run
SELECT DISTINCT status
FROM orders
ORDER BY status;
```

**Finding which values occur.** Which customers have placed an order? Every order carries a `customer_id`, so the distinct values are the customers who have ordered:

```sql run
SELECT DISTINCT customer_id
FROM orders
ORDER BY customer_id;
```

10 customers, missing exactly 11 and 12, who have never ordered.

**Deduplicating computed columns.** Duplicates are removed after `SELECT` computes the output, so expressions in the list deduplicate too. Does the shop have products of 100 dollars or more, and cheaper ones as well?

```sql run
SELECT DISTINCT price >= 100 AS premium
FROM products;
```

The 16 products shrink to two rows: true and false.

**Filter first, then deduplicate.** `WHERE` runs before `DISTINCT`. Which customers have had an order cancelled?

```sql run
SELECT DISTINCT customer_id
FROM orders
WHERE status = 'cancelled'
ORDER BY customer_id;
```

The cancelled orders are kept first, then their `customer_id`s are deduplicated. A customer with more than one cancelled order still appears once.

**`ALL` is the default.** `SELECT ALL country` is the same as `SELECT country` and keeps every row. Hardly anyone writes `ALL`, but it is a useful reminder: keeping duplicates is the normal case, and `DISTINCT` is an extra step you ask for.

## Going deeper {#deeper}

**`DISTINCT` treats NULLs as the same value.** The NULL lesson showed that `NULL = NULL` is unknown. For removing duplicates, though, SQL treats all NULLs as one value, so `SELECT DISTINCT city` has a single NULL row. The rules look inconsistent, but this one is practical: you usually want "unknown" to appear once in a list.

**Sort columns must appear in the select list.** This query fails:

```sql run error
SELECT DISTINCT status
FROM orders
ORDER BY ordered_at;
```

The reason lies in the logical order. After duplicates are removed each `status` has one row, but one `status` stands for many different `ordered_at` values, so the database cannot know which to sort by. PostgreSQL therefore requires the `ORDER BY` of a `SELECT DISTINCT` to use only expressions from the select list.

**`DISTINCT ON`.** PostgreSQL extends the idea: `DISTINCT ON (column)` removes duplicates of the given column only, keeping the first row of each group. For example, the earliest customer to join from each country:

```sql run
SELECT DISTINCT ON (country) country, name, joined_on
FROM customers
ORDER BY country, joined_on;
```

The `DISTINCT ON` columns must match the leftmost `ORDER BY` columns, and the keys after them decide which row is "first". It is not standard SQL; the window functions of chapter 6 do the same thing in a standard way.

**`DISTINCT` has a cost.** Removing duplicates means sorting or hashing every row, which is not cheap when there are many. Adding `DISTINCT` where duplicates cannot occur only slows the query down. `SELECT DISTINCT id FROM customers` is an example: `id` is the primary key and never repeats anyway.

**`DISTINCT` and `GROUP BY`.** Chapter 3 shows that `SELECT DISTINCT country` gives the same result as `SELECT country ... GROUP BY country`. `DISTINCT` only removes duplicates; `GROUP BY` can also compute statistics for each group.

**`DISTINCT` is not a universal fix.** In chapter 4 you will see that a wrong join can repeat rows. Hiding those repeats with `DISTINCT` often hides the real mistake. When unexpected duplicates appear, find out where they come from first.

## Common mistakes {#mistakes}

**1. Thinking `DISTINCT` applies only to the column right after it.** Even with parentheses:

```sql run
SELECT DISTINCT (country), city
FROM customers;
```

Still 9 rows. `(country)` is just one column in parentheses, and `DISTINCT` still compares the combination of `country` and `city`. `DISTINCT` always applies to the whole select list.

**2. One column too many.** You want the list of countries but also select `name`: `SELECT DISTINCT country, name` returns 12 rows, because every customer's name differs and no two rows are entirely the same. Put only the columns you want to deduplicate in the select list.

**3. `ORDER BY` on a column that is not selected.** See Going deeper above: with `SELECT DISTINCT`, you can only sort by selected columns.

**4. Using `DISTINCT` to cover up duplicates.** When a result has repeats it should not have, `DISTINCT` can make it look right while the cause remains. Find out why the rows repeat first.

**5. `DISTINCT` between columns.**

```sql run error
SELECT country, DISTINCT city
FROM customers;
```

That fails with `syntax error at or near "DISTINCT"`. In the shape, `DISTINCT` can only come straight after `SELECT`. If what you really want is each country with its cities, no city repeated, that is deduplicating two columns together: `SELECT DISTINCT country, city`.

## Summary {#summary}

- `SELECT DISTINCT` removes duplicate rows, keeping one copy of each.
- "Duplicate" means every column of the select list is the same; `DISTINCT` always applies to the whole row.
- When removing duplicates, all NULLs count as one value.
- The `ORDER BY` of a `SELECT DISTINCT` may only use expressions from the select list.
- PostgreSQL's `DISTINCT ON (column)` deduplicates on chosen columns and keeps the first row after sorting.
