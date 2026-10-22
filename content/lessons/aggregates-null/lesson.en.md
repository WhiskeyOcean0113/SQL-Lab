## Why you need it {#why}

How long does shop take to ship an order? Each order's shipping time in days is its shipping date minus its order date:

```sql run
SELECT id, status, shipped_at::date - ordered_at::date AS days
FROM orders
ORDER BY id;
```

Fourteen orders have a number. The other ten have not shipped, so their `shipped_at` is NULL, and so is `days`. Now take the average of that column. Should the ten count as 0 days? Should they be left out? Or should one unknown make the whole answer unknown, the way `1 + NULL` is NULL? Each rule is defensible, each gives a different answer, and nothing in the query says which one you will get. Until you know the rule, no total over a column with gaps can be trusted.

## Core idea {#core}

An aggregate does not look at rows. It looks at the values of its argument, one per row, and before it computes anything it drops every value that is NULL. `sum`, `avg`, `min`, `max` and `count(x)` all work on what is left.

The reason is what NULL means. NULL is a value nobody knows, and arithmetic with an unknown gives unknown: `1 + NULL` is NULL. If `sum` kept the NULLs, a single order without a shipping date would make the total for the whole table unknown, and almost every real column has a gap somewhere. So SQL summarises the values it knows and says nothing about the ones it does not.

Follow the shipping times through the aggregates:

```steps
- sql: |
    SELECT id, shipped_at::date - ordered_at::date AS days,
           shipped_at IS NOT NULL AS has_days
    FROM orders
    ORDER BY id;
  say: >-
    The 24 values an aggregate of `days` is handed. In the ten rows where
    `has_days` is false the value is NULL, and the aggregate drops it before it starts.
  group: has_days
- sql: |
    SELECT count(*) AS orders,
           count(shipped_at::date - ordered_at::date) AS with_days
    FROM orders;
  say: >-
    `count(*)` has no argument, so there is nothing to drop: it counts all 24 rows.
    `count` of the days counts the values that survive: 14.
- sql: |
    SELECT sum(shipped_at::date - ordered_at::date) AS total_days,
           round(avg(shipped_at::date - ordered_at::date), 2) AS avg_days
    FROM orders;
  say: >-
    `sum` adds the 14 values and gets 24. `avg` divides by the number of values it
    added, not by the number of rows: 24 / 14 = 1.71. The NULLs count in neither
    the total nor the divisor.
- sql: |
    SELECT count(*) AS lines, count(quantity) AS with_quantity,
           sum(quantity) AS units, max(quantity) AS largest
    FROM order_items
    WHERE order_id = 24;
  say: >-
    Order 24 has no lines, so nothing reaches the aggregates. Both counts answer 0;
    `sum` and `max` have no value to work with and answer NULL.
```

That is the whole difference between `count(*)` and `count(x)`. `count(*)` asks how many rows there are; `count(x)` asks how many rows have a known `x`. Neither is the more correct one. They answer different questions, and the question decides which to write.

The last step shows the second rule. When nothing is left to summarise, because `WHERE` kept no rows or every value was NULL, `count` returns 0 and every other aggregate returns NULL. "How many?" has an answer even for nothing: none. "Which is the largest?" has no answer at all, and SQL treats the sum the same way: no values, no sum. The PostgreSQL manual singles this case out: the sum of no rows is NULL, not the zero you might expect.

| What reaches the aggregate | `count(*)` | `count(x)` | `sum(x)`, `avg(x)`, `min(x)`, `max(x)` |
|---|---|---|---|
| Rows, some `x` NULL | every row | the non-NULL `x` | worked out from the non-NULL `x` |
| Rows, every `x` NULL | every row | 0 | NULL |
| No rows | 0 | 0 | NULL |

```check
query: |
  SELECT count(*) AS lines, sum(quantity) AS units
  FROM order_items
  WHERE product_id = 16;
question: Folding Chair (product 16) has never been ordered. What does this query return?
choices:
  - "One row: `lines` is 0 and `units` is 0"
  - "One row: `lines` is 0 and `units` is NULL"
  - "One row: both are NULL"
  - "No row at all"
answer: 1
explain: >-
  An aggregate without `GROUP BY` always returns one row. No line matches, so
  `count(*)` answers 0, while `sum` has no value to add and answers NULL.
verify: { rows: 1 }
```

## Syntax {#syntax}

The rules so far decide which values an aggregate sees. Often you also want to decide which rows it sees: all orders and the cancelled ones, side by side in one result row. `WHERE` cannot do that, because the rows it removes are gone for every aggregate in the query. `FILTER` attaches a condition to one aggregate only:

```syntax
count(*) [ FILTER ( WHERE condition ) ]
aggregate_name ( [ DISTINCT ] expression ) [ FILTER ( WHERE condition ) ]
```

| Part | What goes there | Can it be left out? |
|---|---|---|
| `aggregate_name` | `count`, `sum`, `avg`, `min`, `max` or another aggregate | No |
| `DISTINCT` | Drops repeated values before summarising | Yes |
| `expression` | The value to summarise; rows where it is NULL are dropped | No |
| `FILTER ( WHERE condition )` | Only the rows where `condition` is true reach this aggregate | Yes |

The `condition` is an ordinary row condition, as in a `WHERE` clause, and it follows the same {{term:three-valued-logic}}: a row gets in only when the condition is true, so false and unknown both stay out. `FILTER` comes after the aggregate's closing parenthesis and before `AS`, and the parentheses and the word `WHERE` belong to it.

Some expressions, read against the shape:

- `count(*) FILTER (WHERE status = 'cancelled')`: the first line; it counts only the cancelled orders.
- `sum(quantity) FILTER (WHERE unit_price >= 100)`: the second line without `DISTINCT`; it adds up the quantities of the lines priced at 100 dollars or more.
- `count(DISTINCT customer_id) FILTER (WHERE status = 'paid')`: both optional parts at once; how many different customers have a paid order.

## Example {#example}

Task: a monthly shipping report. For each month, how many orders were placed, how many have shipped, how many were cancelled, and how many days shipping took on average.

1. **One row per month.** Group by `date_trunc('month', ordered_at)`.
2. **Rows or values?** "Orders placed" counts rows: `count(*)`. "Shipped" counts the orders that have a shipping time: `count(shipped_at)`, and the NULLs drop out by themselves.
3. **A count of some rows only.** "Cancelled" is `count(*) FILTER (WHERE status = 'cancelled')`. A `WHERE` would remove the other orders from every column.
4. **An average of the known values.** `avg` of the shipping days skips the orders that have not shipped, which is exactly what "how long shipping took" means. `round` keeps one decimal.

```sql run
SELECT date_trunc('month', ordered_at) AS month,
       count(*) AS orders,
       count(shipped_at) AS shipped,
       count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
       round(avg(shipped_at::date - ordered_at::date), 1) AS avg_days
FROM orders
GROUP BY date_trunc('month', ordered_at)
ORDER BY month;
```

5. **Read the NULL.** None of June's seven orders has shipped yet. Within that group `count(shipped_at)` meets only NULLs and answers 0; `avg` meets only NULLs and answers NULL. The NULL is the honest answer: June has no shipping times yet. Turning it into 0 would claim that June's orders went out on the day they were placed.

```check
query: |
  SELECT count(*) AS orders,
         count(*) FILTER (WHERE status = 'delivered') AS delivered
  FROM orders
  WHERE shipped_at IS NOT NULL;
question: Of the 24 orders, 14 have a shipping time, and 11 of those are delivered. What do `orders` and `delivered` hold?
choices:
  - "`orders` 24, `delivered` 11"
  - "`orders` 14, `delivered` 11"
  - "`orders` 11, `delivered` 11"
  - "`orders` 14, `delivered` 14"
answer: 1
explain: >-
  `WHERE` runs first and keeps the 14 shipped orders, so every aggregate sees
  those 14 rows: `orders` is 14. `FILTER` then narrows `delivered` alone to the
  11 delivered ones; it does not touch `orders`.
```

## Variations {#variants}

**When none means zero: `COALESCE`.** The first check found that Folding Chair's `units` is NULL. For "units sold", no sales really is zero, so replace the NULL with Chapter 2's `COALESCE`:

```sql run
SELECT COALESCE(sum(quantity), 0) AS units
FROM order_items
WHERE product_id = 16;
```

Decide by meaning, not by habit. Units with nothing in them are 0 units; June's average shipping time above is not 0 days, it is not known yet.

**`count` with `CASE`: the NULL rule doing the filtering.** A `CASE` without `ELSE` gives NULL for every row no branch matches, and `count` drops NULLs. Together they count the matching rows:

```sql run
SELECT count(*) AS all_orders,
       count(CASE WHEN status = 'cancelled' THEN 1 END) AS cancelled,
       count(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS not_what_you_want
FROM orders;
```

2 and 24. With `ELSE 0` every row has a value, and `count` counts values, not ones. The first form does the same job as `FILTER`, and it works in databases that lack `FILTER`.

**Several `FILTER`s side by side: {{term:pivot}}.** One row per status, with the orders of each two-month period in a column of its own:

```sql run
SELECT status,
       count(*) FILTER (WHERE ordered_at < '2024-03-01') AS jan_feb,
       count(*) FILTER (WHERE ordered_at >= '2024-03-01' AND ordered_at < '2024-05-01') AS mar_apr,
       count(*) FILTER (WHERE ordered_at >= '2024-05-01') AS may_jun
FROM orders
GROUP BY status
ORDER BY status;
```

Every status keeps its row, even where a period has no orders: `FILTER` can leave a count empty, but it never removes a group. The values of one column, the period, have turned into column headings.

**`count(DISTINCT x)` drops NULL too.** In how many cities do customers live?

```sql run
SELECT count(DISTINCT city) AS cities
FROM customers;
```

7. Yet `GROUP BY city` makes 8 groups, and `SELECT DISTINCT city` returns 8 rows. Grouping and `DISTINCT` give all the NULLs one group of their own; `count(DISTINCT city)` counts values, and NULL is not one.

## Going deeper {#deeper}

**Counting NULL as zero on purpose.** `avg(COALESCE(x, 0))` replaces the NULLs before averaging, so every row counts in the divisor. For shipping days that gives exactly 1, as if every unshipped order had gone out the same day:

```sql run
SELECT round(avg(COALESCE(shipped_at::date - ordered_at::date, 0)), 2) AS avg_days
FROM orders;
```

Write it only where a NULL in the data really means zero. The query cannot know that; you have to.

**A grouped query over no rows returns no rows.** An aggregate always returns one row only when there is no `GROUP BY`. With it, no rows means no groups, and no groups means an empty result rather than a row of zeros:

```sql run
SELECT status, count(*) AS orders
FROM orders
WHERE ordered_at >= '2025-01-01'
GROUP BY status;
```

## Common mistakes {#mistakes}

**1. `count(column)` when you meant to count rows.** How many products does each category have?

```sql run
SELECT category_id, count(category_id) AS products
FROM products
GROUP BY category_id
ORDER BY category_id;
```

The last group, the products without a category, shows 0, yet Gift Card is in it. `GROUP BY` gave the NULL a group, and then `count(category_id)` dropped the very NULL it was meant to count. To count rows, write `count(*)`; write `count(column)` only when the question is "how many have a value".

**2. Averaging by hand with `sum(x) / count(*)`.**

```sql run
SELECT sum(shipped_at::date - ordered_at::date) / count(*) AS avg_days
FROM orders;
```

1, not 1.71. The two halves follow different rules: `sum` skipped the ten NULLs, `count(*)` counted their rows. (Chapter 2's integer division also cut off the fraction.) `avg(x)` uses the same values for both halves.

**3. Comparing an empty sum with 0.** Which orders contain no line priced at 100 dollars or more?

```sql run
SELECT order_id
FROM order_items
GROUP BY order_id
HAVING sum(quantity) FILTER (WHERE unit_price >= 100) = 0;
```

No rows, though most orders qualify. In those orders no line passes the `FILTER`, so the sum is NULL; `NULL = 0` is unknown, and `HAVING` drops the group. Count instead, since `count` of nothing is 0: `HAVING count(*) FILTER (WHERE unit_price >= 100) = 0`. Wrapping the sum in `COALESCE(…, 0)` works too.

**4. Counting a condition.** `count(status = 'cancelled')` reads like "count the cancelled orders", but it returns 24. The comparison gives true or false, never NULL, and `count` counts every value that is not NULL, false included. Put the condition in a `FILTER`: `count(*) FILTER (WHERE status = 'cancelled')`.

**5. `WHERE` where `FILTER` was meant.** Each category's products, and how many of them are sold out:

```sql run
SELECT category_id, count(*) AS products, count(*) AS sold_out
FROM products
WHERE stock = 0
GROUP BY category_id;
```

One row, Electronics, with 1 and 1. `WHERE` removed every product still in stock before grouping, so the other categories vanished and `products` counts only the sold-out one. Keep all the rows and put the condition on the one count that needs it: `count(*) FILTER (WHERE stock = 0) AS sold_out`.

**6. `FILTER` without `WHERE`.**

```sql run error
SELECT count(*) FILTER (stock = 0) AS sold_out
FROM products;
```

This fails with `syntax error at or near "stock"`. The shape needs the word: `FILTER (WHERE stock = 0)`.

## Summary {#summary}

- An aggregate drops NULL values before it computes: `sum`, `avg`, `min`, `max` and `count(x)` see only known values, while `count(*)` counts rows.
- `avg` divides by the number of known values, not by the number of rows.
- With nothing to summarise, `count` returns 0 and every other aggregate NULL; replace that NULL with `COALESCE` only where none means zero.
- `FILTER (WHERE …)` decides which rows reach one aggregate; `WHERE` decides for all of them, and can empty whole groups.

## Reference {#reference}

- `FILTER` is standard SQL (SQL:2003). PostgreSQL has had it since 9.4 and SQLite since 3.30. MySQL, MariaDB, SQL Server and Oracle do not support it; there `count(CASE WHEN … THEN 1 END)` or `sum(CASE WHEN … THEN x END)` does the same job.
- The standard asks for a warning whenever an aggregate drops NULLs, "null value eliminated in set function" (SQLSTATE 01003). SQL Server prints it; PostgreSQL lists the code but does not raise it, so the dropping is silent.
- Not every aggregate drops NULLs. PostgreSQL's `array_agg` and `json_agg` keep them; the aggregates of this chapter all drop them.
