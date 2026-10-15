## Why you need it {#why}

"How many customers does shop have?" and "How many customers gave an email address?" sound like two questions, and in SQL they differ only in what goes inside the parentheses:

```sql run
SELECT count(*) AS customers, count(email) AS with_email
FROM customers;
```

Twelve and 10. Two customers have a NULL `email`, and `count(email)` leaves them out. This lesson covers how aggregates treat NULL: most of the time the rules do exactly what you want, but if you do not know them, results go quietly wrong with no error to warn you.

## Core idea {#core}

**Every aggregate except `count(*)` ignores NULL.** They look only at non-NULL values:

| Written as | Counts or uses |
|---|---|
| `count(*)` | rows, whatever they contain |
| `count(x)` | rows where `x` is not NULL |
| `count(DISTINCT x)` | how many different non-NULL values there are |
| `sum(x)`, `avg(x)`, `min(x)`, `max(x)` | only the non-NULL values |

`avg(x)` is "the sum of the non-NULL values" divided by "how many non-NULL values there are"; NULL counts in neither the numerator nor the denominator.

This is consistent with the NULL lesson: NULL means "unknown", and aggregates do not add up or compare values nobody knows.

## Example {#example}

Task: how many cities do customers live in?

1. **Count the rows.** Twelve customers: `count(*)`.
2. **Count those with a city.** `count(city)` skips the two customers whose city is NULL.
3. **Count the different cities.** `count(DISTINCT city)`: Shanghai, Toronto and Osaka each have two customers, so how many remain after removing duplicates?

```sql run
SELECT count(*) AS customers,
       count(city) AS known_city,
       count(DISTINCT city) AS cities
FROM customers;
```

Twelve, 10 and 7. Compare the DISTINCT lesson: `SELECT DISTINCT city` returns 8 rows, because NULL gets a row of its own, while `count(DISTINCT city)` is 7, because `count` does not count NULL. Same data, two ways of asking, a difference of one.

## Variations {#variants}

**Ignoring NULL is exactly what you want.** How long do shipped orders take to go out, on average? Unshipped orders have a NULL `shipped_at`, so the difference is NULL too, and `avg` skips them:

```sql run
SELECT avg(shipped_at - ordered_at) AS avg_shipping,
       count(shipped_at) AS shipped,
       count(*) AS orders
FROM orders;
```

The average comes from the 14 shipped orders only, which is what the question asked.

**Conditional counts: `FILTER`.** Add `FILTER (WHERE condition)` after an aggregate and it only summarises the rows that pass:

```sql run
SELECT count(*) AS all_orders,
       count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
       count(*) FILTER (WHERE shipped_at IS NOT NULL) AS shipped
FROM orders;
```

One query gives the total and several partial counts at once. `FILTER` is standard SQL and PostgreSQL supports it; in databases that do not, chapter 2's `CASE` does the same job:

```sql run
SELECT count(*) AS all_orders,
       sum(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled
FROM orders;
```

**Showing "none" as 0: `COALESCE`.** Folding Chair (product 16) has never been sold:

```sql run
SELECT sum(quantity) AS units,
       COALESCE(sum(quantity), 0) AS units_or_zero
FROM order_items
WHERE product_id = 16;
```

`sum` has nothing to add and returns NULL; `COALESCE` replaces it with 0.

## Going deeper {#deeper}

**When there are no rows to summarise.** `count` returns 0 and every other aggregate returns NULL:

```sql run
SELECT count(*) AS products, sum(stock) AS stock,
       avg(price) AS avg_price, max(price) AS max_price
FROM products
WHERE price > 1000;
```

The sum of nothing is NULL rather than 0; that is the SQL standard's rule: no values, no sum. If you need 0, write `COALESCE(sum(x), 0)` yourself.

**With `GROUP BY`, no rows means no groups.** Filter out every row in a grouped query and you get zero rows, not one row of zeros:

```sql run
SELECT category_id, count(*) AS products
FROM products
WHERE price > 1000
GROUP BY category_id;
```

No groups, no output. Only an aggregate without grouping is guaranteed one row.

**Ignoring NULL is not the same as treating it as 0.** If NULL really means 0 (say, "left blank means bought none"), `avg(x)` comes out too high, because it divides only by the number of non-NULL values. Then write `avg(COALESCE(x, 0))`, replacing NULL with 0 before averaging. Whether NULL means "unknown" or "zero" depends on what the data means; the query cannot tell.

**NULL behaves differently in `GROUP BY` and in `count`.** `GROUP BY` and `DISTINCT` put all NULLs in one group, while `count(x)` and `count(DISTINCT x)` skip them.

## Common mistakes {#mistakes}

**1. `count(column)` when you meant to count rows.** This query tries to count the customers in each country:

```sql run
SELECT country, count(city) AS customers
FROM customers
GROUP BY country
ORDER BY country;
```

Brazil and Ireland both show 0, yet each has one customer whose city is NULL. To count rows, use `count(*)`; use `count(column)` only when you really mean "rows that have a value".

**2. Expecting `sum` of no rows to be 0.** It is NULL, and any arithmetic or comparison with it is NULL too. Use `COALESCE` when you need 0.

**3. Counting conditionally with `count(condition)`.** `count(status = 'cancelled')` looks like "count the cancelled orders" but returns 24: the comparison yields true or false, neither of which is NULL, so every row is counted. For conditional counts use `FILTER`, or `sum(CASE … THEN 1 ELSE 0 END)`.

**4. Comparing `count(DISTINCT x)` with the rows of `SELECT DISTINCT x` and suspecting a mistake.** The first does not count NULL; the second gives NULL a row.

## Summary {#summary}

- Every aggregate except `count(*)` ignores NULL; `count(x)` counts non-NULL values only.
- `avg` divides only by the number of non-NULL values; if NULL means 0, replace it with `COALESCE` first.
- With no rows, an ungrouped `count` returns 0 and other aggregates NULL; a grouped query returns zero rows.
- `FILTER (WHERE …)` makes an aggregate summarise only the rows that pass.
- Count rows with `count(*)`; `count(condition)` does not count conditionally.
