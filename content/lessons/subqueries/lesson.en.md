## Why you need it {#why}

Chapter 3 left two problems unsolved.

One: "Which products cost more than the average?" Aggregates cannot go in `WHERE`:

```sql run error
SELECT name, price
FROM products
WHERE price > avg(price);
```

Two: "What is the average order worth?" That needs each order's total first and then the average of those totals: two levels of aggregation, and aggregates cannot be nested.

Both have the same solution: **compute an intermediate result with one query, then use it inside another.**

## Core idea {#core}

A {{term:subquery}} is a `SELECT` in parentheses, written inside another query. The query around it is the {{term:outer-query}}.

The shape of what a subquery returns decides where it can go:

| The subquery returns | Called | Where it can go |
|---|---|---|
| one row, one column: a single value | {{term:scalar-subquery}} | anywhere a value fits: `WHERE`, `SELECT`, inside expressions |
| many rows and columns: a table | {{term:derived-table}} | in `FROM`, used like a table |
| one column, many rows | a set of values | `IN`, `EXISTS` and the like (next lesson) |

The first problem takes a scalar subquery:

```sql run
SELECT name, price
FROM products
WHERE price > (SELECT avg(price) FROM products)
ORDER BY price DESC;
```

The database runs the query in parentheses first, gets the average price, 78.84, and puts that value back into `WHERE`. The outer query effectively sees `WHERE price > 78.84`.

## Example {#example}

Task: what is the average value of an order?

1. **First answer "what is each order worth".** An ordinary grouped summary: group by `order_id` and add up `quantity * unit_price`. One row per order.
2. **Treat that result as a table.** Put it in the outer query's `FROM`, in parentheses, with an alias `t`.
3. **Summarise again over that table.** Average `t.total`.

```sql run
SELECT round(avg(t.total), 2) AS avg_order
FROM (
  SELECT order_id, sum(quantity * unit_price) AS total
  FROM order_items
  GROUP BY order_id
) AS t;
```

139.82. The inner query turns 42 lines into 23 order totals, and the outer query turns 23 rows into one average. This is the way round "aggregates cannot nest": each level of aggregation gets its own level of query.

Note it is 23 rows, not 24: order 24 has no lines and does not appear in `order_items` at all.

## Variations {#variants}

**A scalar subquery in `SELECT`.** Each product's share of total stock, as a percentage:

```sql run
SELECT name, stock,
       round(100.0 * stock / (SELECT sum(stock) FROM products), 1) AS pct
FROM products
ORDER BY stock DESC
LIMIT 5;
```

Every row is divided by the same total, 1534.

**Filtering a derived table.** A derived table's columns work like any table's in the outer `WHERE`. This gives the same result as `HAVING count(*) >= 4`, written another way:

```sql run
SELECT t.status, t.orders
FROM (
  SELECT status, count(*) AS orders
  FROM orders
  GROUP BY status
) AS t
WHERE t.orders >= 4;
```

The outer query can use the alias `orders` directly, because inside the derived table it has become a real column.

**Summarise separately, then join.** The last lesson's fan trap: joining both orders and referred customers multiplies them. The fix is to summarise each to one row per customer first, then join the two derived tables:

```sql run
SELECT r.name, o.orders, f.referrals
FROM customers AS r
JOIN (
  SELECT customer_id, count(*) AS orders
  FROM orders
  GROUP BY customer_id
) AS o ON o.customer_id = r.id
JOIN (
  SELECT referred_by, count(*) AS referrals
  FROM customers
  WHERE referred_by IS NOT NULL
  GROUP BY referred_by
) AS f ON f.referred_by = r.id
ORDER BY r.id;
```

Each derived table has one row per customer when joined, so nothing multiplies.

## Going deeper {#deeper}

**A scalar subquery must return one row.** With several rows, the database does not know which value to use:

```sql run error
SELECT name
FROM products
WHERE price = (SELECT price FROM products WHERE category_id = 1);
```

Books has 3 products, so the subquery returns 3 prices. To compare with a set of values, use the next lesson's `IN`.

**Zero rows give NULL.** If the subquery finds nothing, the scalar subquery's value is NULL, `price > NULL` is unknown, and the outer query returns no rows, without any error.

**An uncorrelated subquery runs once.** None of this lesson's subqueries depends on any row of the outer query, so the database computes it once and every row shares the result. Correlated subqueries, two lessons on, refer to columns of the outer query.

**Aliases for derived tables.** Standard SQL requires a subquery in `FROM` to have an alias, as do MySQL and PostgreSQL 15 and earlier; from PostgreSQL 16 it may be omitted. To run everywhere, and to refer to its columns from outside, always write one.

**Subqueries and joins are often interchangeable.** Many subqueries can be written as joins, and the other way round. Pick the form that reads most like the question.

## Common mistakes {#mistakes}

**1. Comparing with `=` against a subquery that can return several rows.** See Going deeper: `more than one row returned by a subquery used as an expression`. Make sure the subquery returns one row (for example, because it is an aggregate), or use `IN`.

**2. Using an aggregate directly in `WHERE`.** `WHERE price > avg(price)` is an error. Move the aggregate into a subquery: `WHERE price > (SELECT avg(price) FROM products)`.

**3. Referring to the subquery's inner tables from outside.** A derived table exposes only the columns it selects. Writing `order_items.quantity` in the outer query is an error; only columns like `t.total` exist out there.

**4. A subquery that unexpectedly returns zero rows.** With a wrong condition, the scalar subquery returns NULL and the outer query quietly returns nothing. When a result is empty, run the subquery on its own and look at what it returns.

**5. Mixing up the subquery's condition and the outer one.** For "products dearer than the Electronics average", `category_id = 2` belongs inside the subquery, to compute the Electronics average; in the outer query it would filter the products themselves.

## Summary {#summary}

- A subquery is a `SELECT` in parentheses whose result can be used as a value or as a table.
- A scalar subquery returns one value and fits anywhere a value does; several rows are an error, zero rows give NULL.
- A derived table goes in `FROM` and needs an alias; it makes "summarise, then summarise again" possible.
- Summarising separately and then joining derived tables avoids the fan trap.
- An uncorrelated subquery is computed once.
