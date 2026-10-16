## Why you need it {#why}

Purchasing wants the two most expensive products in each category, with names and prices.

Chapter 3's `GROUP BY category_id` finds each category's highest price, but grouping leaves one row per category: the product name is gone, and the second most expensive product is out of reach altogether. What we need is to **keep every row** while knowing where it ranks within its own category.

## Core idea {#core}

### Compute without collapsing

A {{term:window-function}} computes over a set of rows related to the current row and writes the result back onto the current row. Unlike aggregation, rows are not merged: 16 products go in, 16 rows come out.

```sql run
SELECT name, category_id, price,
       avg(price) OVER (PARTITION BY category_id) AS category_avg
FROM products
ORDER BY category_id, price DESC;
```

With `OVER (…)` after it, `avg(price)` is no longer an aggregate but a window function: every row stays, with its own category's average price beside it.

### Two things inside OVER

- **`PARTITION BY`** splits the rows into {{term:partition|partitions}}, and the function is computed separately in each. It is like `GROUP BY` without the merging. Leave it out and the whole table is one partition.
- **`ORDER BY`** sets the order of the rows within each partition. Ranking needs it: you cannot tell who is first until the queue is formed.

### Three {{term:ranking-function|ranking functions}}

There are three ways to number the rows of a partition in order. They differ only on ties:

| Function | On a tie | Ranking 4, 3, 3, 2 gives |
|---|---|---|
| `row_number()` | Keeps numbering one by one; which of the tied rows comes first is up to the database | 1, 2, 3, 4 |
| `rank()` | Tied rows share a rank, and the ranks they used up are skipped | 1, 2, 2, 4 |
| `dense_rank()` | Tied rows share a rank, and nothing is skipped | 1, 2, 2, 3 |

### Where it sits in the logical order

Window functions are computed in the `SELECT` step: after `WHERE`, `GROUP BY` and `HAVING`, before `DISTINCT`, `ORDER BY` and `LIMIT`. Two consequences follow:

- They see rows that have already been filtered and grouped, so they can rank grouped results.
- **They cannot appear in `WHERE`**, because `WHERE` runs before they are computed. To filter by a rank, compute the rank first in a CTE or derived table, then filter in the outer query.

## Syntax {#syntax}

```syntax
function_name ( [ expression [, …] ] ) OVER (
    [ PARTITION BY expression [, …] ]
    [ ORDER BY expression [ ASC | DESC ] [, …] ]
)
```

| Part | What goes there | Rule |
|---|---|---|
| `function_name` | A ranking function, `row_number`, `rank`, `dense_rank` or `ntile`, or any aggregate such as `sum`, `avg` or `count` | Ranking functions usually take empty brackets; `ntile` takes an integer |
| `OVER ( … )` | The window definition | Required; it is what makes a window function, and its brackets may be empty |
| `PARTITION BY expression` | What to partition by | Optional; without it, the whole result is one partition |
| `ORDER BY expression` | The order within a partition | Needed for ranking; it can be left out, but then the numbering means nothing |

A window function as a whole is an `expression`. It goes in the select list, and may also go in `ORDER BY`, but not in `WHERE`, `GROUP BY` or `HAVING`.

Some window functions, read against the shape:

- `avg(price) OVER (PARTITION BY category_id)`: `function_name` is the aggregate `avg`, partitioned by category, with no `ORDER BY`, so each partition gets one average.
- `row_number() OVER (PARTITION BY category_id ORDER BY price DESC)`: within each category, numbers from 1 upwards, dearest first.
- `count(*) OVER ()`: empty brackets after `OVER`, so the whole result is one partition and every row gets the total row count.

## Example {#example}

The question: the two most expensive products in each category.

1. **Number each product within its category.** `PARTITION BY category_id` makes each category count separately, and `ORDER BY price DESC` puts the most expensive first.
2. **Put the ranking in a CTE.** The rank cannot be used in `WHERE` at the same level, so compute it in a CTE and call it `rn`.
3. **Filter `rn <= 2` outside.** By now `rn` is a column of the CTE and can be filtered like any column.
4. **Sort.**

```sql run
WITH ranked AS (
  SELECT name, category_id, price,
         row_number() OVER (PARTITION BY category_id ORDER BY price DESC) AS rn
  FROM products
)
SELECT category_id, name, price
FROM ranked
WHERE rn <= 2
ORDER BY category_id, price DESC;
```

11 rows: 2 for each of the 5 categories, plus Gift Card. Its `category_id` is NULL; all NULLs go into one partition, where it is the only product and ranks first. Any "top N per group" question follows this template: partition, order, number, then filter outside.

## Variations {#variants}

**The three rankings side by side.** Rank customers by how many orders they placed. Customers 2 and 3 placed 3 orders each, a tie:

```sql run
SELECT customer_id, count(*) AS orders,
       row_number() OVER (ORDER BY count(*) DESC) AS row_number,
       rank()       OVER (ORDER BY count(*) DESC) AS rank,
       dense_rank() OVER (ORDER BY count(*) DESC) AS dense_rank
FROM orders
GROUP BY customer_id
ORDER BY orders DESC, customer_id;
```

After the tied 2s, `rank` jumps to 4 while `dense_rank` goes on with 3, and `row_number` gives the tied pair 2 and 3, with no telling who gets 2. The query shows one more thing: window functions run after `GROUP BY`, so `ORDER BY count(*)` can go inside `OVER` to rank grouped results.

**Each customer's latest order.** Partition by customer, number from the newest down, keep number 1:

```sql run
WITH ranked AS (
  SELECT customer_id, id, ordered_at,
         row_number() OVER (PARTITION BY customer_id ORDER BY ordered_at DESC) AS rn
  FROM orders
)
SELECT customer_id, id AS order_id, ordered_at
FROM ranked
WHERE rn = 1
ORDER BY customer_id;
```

Chapter 5 answered the same question with a {{term:correlated-subquery}}. The window version reads the table once, is usually faster, and is easier to change into "the latest two".

**Splitting into bands: `ntile`.** `ntile(4)` splits the rows, in order, into 4 bands as evenly as it can. The 16 products by price make 4 bands of 4:

```sql run
SELECT name, price, ntile(4) OVER (ORDER BY price DESC) AS quartile
FROM products
ORDER BY price DESC;
```

**One window over the whole table.** With empty brackets, `OVER ()` puts every row in one partition. Use it for each product's share of the sum of all prices:

```sql run
SELECT name, price,
       round(100.0 * price / sum(price) OVER (), 1) AS pct
FROM products
ORDER BY price DESC
LIMIT 5;
```

Without window functions, that denominator would be the scalar subquery `(SELECT sum(price) FROM products)`.

**Naming a window.** When the same window is used several times, a `WINDOW` clause before `ORDER BY` can name it, and `OVER` is followed by just the name:

```sql run
SELECT name, price,
       rank()       OVER w AS rank,
       dense_rank() OVER w AS dense_rank
FROM products
WINDOW w AS (ORDER BY price DESC)
ORDER BY price DESC
LIMIT 4;
```

## Going deeper {#deeper}

**`row_number` is not deterministic on ties.** Whether customer 2 or 3 came second above was 3 this time; different data or a different plan could change it. For stable numbers, add a column to `ORDER BY` that tells the rows apart, such as `ORDER BY count(*) DESC, customer_id`.

**Descending puts NULL first.** `ORDER BY` inside a window follows the usual rules: NULLs come last ascending and first descending. Rank orders by shipping time, newest first, and the unshipped orders (`shipped_at` is NULL) tie for first place:

```sql run
SELECT id, shipped_at,
       rank() OVER (ORDER BY shipped_at DESC) AS r
FROM orders
WHERE customer_id IN (1, 2)
ORDER BY r;
```

To push them to the end, write `ORDER BY shipped_at DESC NULLS LAST`.

**NULL forms its own partition.** Like `GROUP BY`, `PARTITION BY` treats all NULLs as one value. That is why Gift Card ranked first, alone in the NULL partition, in the example.

**Two distribution functions.** `percent_rank()` and `cume_dist()` give each row's relative position in its partition as a fraction between 0 and 1, useful for questions like "this product is dearer than what percentage of products?"

**Other databases.** Window functions are standard SQL, supported since MySQL 8.0 and SQLite 3.25. Snowflake, BigQuery and DuckDB have a `QUALIFY` clause that filters on a window function directly, without an outer query; PostgreSQL does not, so a CTE or subquery is still needed.

## Common mistakes {#mistakes}

**1. A window function in `WHERE`.**

```sql run error
SELECT name, price
FROM products
WHERE row_number() OVER (ORDER BY price DESC) <= 3;
```

`window functions are not allowed in WHERE`. `WHERE` runs first, before any rank exists. Compute the rank in a CTE and filter outside.

**2. The rank's alias in `WHERE`.** An alias does not help either:

```sql run error
SELECT name, price,
       row_number() OVER (ORDER BY price DESC) AS rn
FROM products
WHERE rn <= 3;
```

`column "rn" does not exist`, the same error as in Chapter 0's lesson on the logical order: names given in `SELECT` are invisible to `WHERE`.

**3. Forgetting `PARTITION BY`.** You want the top two of each category but write only `OVER (ORDER BY price DESC)`, and get the two most expensive products in the whole shop. Read the question again: "each …" is the signal to partition.

**4. `row_number` where `rank` was needed.** If two products tie for third in "the three most expensive products", `row_number() <= 3` keeps one of them and drops the other at random. When the task wants all tied rows, use `rank()` or `dense_rank()`.

**5. Trying to fetch each group's top row with `GROUP BY`.**

```sql run error
SELECT category_id, name, price
FROM products
GROUP BY category_id
HAVING price = max(price);
```

`column "products.name" must appear in the GROUP BY clause`. After grouping, each group is one row and `name` has no single value to show. This is exactly the problem window functions solve: rank first, filter afterwards.

## Summary {#summary}

- A window function is written `function(…) OVER (…)` and computes a value for every row without merging rows.
- `PARTITION BY` groups without merging; `ORDER BY` sets the order inside each partition.
- On ties, `row_number` numbers arbitrarily, `rank` skips ranks afterwards and `dense_rank` does not.
- Window functions are computed in the `SELECT` step and cannot go in `WHERE`; to filter by rank, compute it in a CTE first.
- The "top N per group" template: partition, order, number, then filter outside.
