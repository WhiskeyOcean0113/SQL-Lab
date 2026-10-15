## Why you need it {#why}

"How many products does shop sell? What is the average price? What do the cheapest and the most expensive cost?"

Every query so far has been one row in, one row out: `products` has 16 rows, so the result has at most 16, each describing one product. These questions are not about any one product, though, but about **all of them together**. Each answer is a single row.

## Core idea {#core}

An {{term:aggregate-function}} summarises the values of many rows as one value. The five you will use most:

| Function | Does |
|---|---|
| `count(*)` | counts the rows |
| `sum(x)` | adds up |
| `avg(x)` | averages |
| `min(x)` / `max(x)` | smallest / largest value |

```sql run
SELECT count(*) AS products, sum(stock) AS units,
       avg(price) AS avg_price, min(price) AS cheapest, max(price) AS dearest
FROM products;
```

Sixteen rows in, one row out. This is {{term:aggregation}}: no longer one result per row, but one result per group of rows. Without `GROUP BY` (the next lesson), the whole table is one group.

In the {{term:logical-order}}, `FROM` produces rows, `WHERE` removes the ones you do not want, only the remaining rows reach the aggregate functions, and `SELECT` outputs the totals. So `WHERE` decides which rows get summarised.

## Example {#example}

Task: how many orders came in during June 2024, and when were the first and the last placed?

1. **Mark out the rows to summarise.** June's orders, with chapter 1's half-open range: `ordered_at >= '2024-06-01' AND ordered_at < '2024-07-01'`.
2. **Pick a function for each question.** "How many" is `count(*)`; "the first" is the earliest time, `min(ordered_at)`; "the last" is `max(ordered_at)`.
3. **Name each result.** An aggregate's column is named after the function by default; an alias reads better.

```sql run
SELECT count(*) AS orders,
       min(ordered_at) AS first_order,
       max(ordered_at) AS last_order
FROM orders
WHERE ordered_at >= '2024-06-01' AND ordered_at < '2024-07-01';
```

Seven orders, the first on 4 June and the last on 28 June. `min` and `max` are not limited to numbers: times, dates and text all have an order.

## Variations {#variants}

**Summarising an expression.** An aggregate's argument can be any expression. Each row of `order_items` is worth quantity times unit price, and adding them all gives total sales:

```sql run
SELECT sum(quantity * unit_price) AS revenue,
       count(*) AS order_lines,
       sum(quantity) AS units
FROM order_items;
```

Note the difference between `count(*)` and `sum(quantity)`: 42 is the number of order lines, 69 the number of items sold. One line can buy several.

**Counting distinct values: `count(DISTINCT x)`.** How many customers have ordered?

```sql run
SELECT count(*) AS orders, count(DISTINCT customer_id) AS customers
FROM orders;
```

Twenty-four orders, from 10 different customers.

**Smallest and largest text and dates.** Text compares alphabetically, dates chronologically:

```sql run
SELECT min(name) AS first_name, max(name) AS last_name,
       min(joined_on) AS earliest, max(joined_on) AS latest
FROM customers;
```

## Going deeper {#deeper}

**Result types.** `count` returns `bigint`; `sum` of integers also returns `bigint`, so the total cannot overflow; `avg` returns an exact `numeric` with many decimal places, usually worth a `round`:

```sql run
SELECT avg(stock) AS raw_avg, round(avg(stock), 1) AS rounded
FROM products;
```

Unlike chapter 2's integer division, `avg` keeps the fraction.

**No rows to summarise still gives one row.** No product costs more than 1000 dollars, yet this query still returns a row, with a `count` of 0:

```sql run
SELECT count(*) AS products
FROM products
WHERE price > 1000;
```

With an aggregate and no `GROUP BY`, the result is **always exactly one row**. In that case `sum`, `avg`, `min` and `max` return NULL, which the last lesson of this chapter covers.

**Aggregates do not nest.** `max(avg(price))` is an error: one aggregate turns many rows into one value, and then there are no "many rows" left to aggregate again. Questions like that need chapter 5's subqueries.

**SQLite and MySQL differ.** The first common mistake below is an error in PostgreSQL, but SQLite runs it: next to `max` it happens to take the row holding the maximum, and with other aggregates any row at all. MySQL with `ONLY_FULL_GROUP_BY` switched off runs it too and takes a value from any row. PostgreSQL's strictness is protecting you.

## Common mistakes {#mistakes}

**1. Wanting the name of the most expensive product, and writing `name` next to `max(price)`.**

```sql run error
SELECT name, max(price)
FROM products;
```

`max(price)` turns 16 rows into one value, but there are still 16 values of `name`, and the database cannot fit them into one row. After aggregating, only totals can be selected. To find the most expensive product, you do not need an aggregate at all; sort and take the first row:

```sql run
SELECT name, price
FROM products
ORDER BY price DESC
LIMIT 1;
```

**2. Putting an aggregate in `WHERE`.**

```sql run error
SELECT name, price
FROM products
WHERE price > avg(price);
```

`WHERE` runs row by row before aggregation, when no average exists yet. Conditions on totals go in `HAVING` (the third lesson of this chapter); "products dearer than the average" needs a subquery from chapter 5.

**3. `count` where `sum` was meant.** "How many items were sold" is `sum(quantity)`; `count(quantity)` only counts order lines. When a question says "how many", decide first whether it counts rows or quantities inside rows.

**4. Expecting no result when nothing matches.** If `WHERE` removes every row, the result is still one row: `count` is 0 and the other functions are NULL.

## Summary {#summary}

- An {{term:aggregate-function}} summarises many rows as one value: `count(*)`, `sum`, `avg`, `min`, `max`.
- `WHERE` filters rows first; only the rows left are summarised.
- With an aggregate and no `GROUP BY`, the result is always one row, even when there is nothing to summarise.
- After aggregating you cannot select plain columns; `count(DISTINCT x)` counts distinct values only.
- Aggregates cannot appear in `WHERE`, and cannot be nested.
