## Why you need it {#why}

Marketing asks: which customers have spent more than the average customer?

Chapter 5's {{term:derived-table|derived tables}} can answer that, but the intermediate result, each customer's total spend, is needed twice: once to list the customers and once to compute the average. With derived tables, the same twenty-line subquery has to be written out twice, nested in brackets that the reader has to unpick from the inside out.

This lesson shows a more readable way: give the intermediate result a name first, then use it as if it were a table.

## Core idea {#core}

### Name it, then use it

A `WITH` clause defines one or more named intermediate results before the main query. Each one is a {{term:cte}}, usually called a CTE:

```sql run
WITH status_counts AS (
  SELECT status, count(*) AS n
  FROM orders
  GROUP BY status
)
SELECT status, n
FROM status_counts
WHERE n >= 4;
```

`status_counts` is the CTE's name and the brackets hold its query. The main query that follows treats `status_counts` as a table: it selects columns from it, filters it and could join it, exactly as with an ordinary table.

### It lives for one statement

A CTE is not a real table. It is not written to the database, and no other statement can see it. When the statement ends, it is gone. Think of it as a {{term:derived-table}} belonging to this one statement, except that it has a name and has moved to the front.

### Read it from top to bottom

One `WITH` can define several CTEs, separated by commas. Each CTE may refer to the ones before it, and the main query may refer to all of them. A complex query becomes a sequence of steps:

1. the first step computes something;
2. the second builds on the first;
3. the main query uses these results to answer the question.

Unlike derived tables, the reading order is the order of the reasoning; there are no nested brackets to take apart.

### One name, several uses

The main query may use the same CTE more than once. That is exactly what the opening question needs: each customer's total, listed row by row and also averaged.

## Syntax {#syntax}

```syntax
WITH with_query [, …]
select_statement
```

Each `with_query` has this shape:

```syntax
cte_name [ ( column_name [, …] ) ] AS ( select_statement )
```

| Part | What goes there | Rule |
|---|---|---|
| `cte_name` | The name of the intermediate result | Used as a table name within this statement; when it matches an existing table, the CTE wins |
| `column_name` | New names for the CTE's columns | Optional; without it, the inner query's column names are kept |
| `AS ( select_statement )` | A complete query | The brackets are required, with no semicolon inside |
| `[, …]` | More `with_query`s | Separated by commas, with `WITH` written once at the start; later ones may refer to earlier ones |
| The final `select_statement` | The main query | Required; together with `WITH` it forms one complete statement |

The whole statement has one semicolon, after the main query. There is none between `WITH … )` and the main query, because they are two parts of a single statement.

Some queries, read against the shape:

- The query in Core idea: one `with_query` named `status_counts`, with no column list, then the main query `SELECT status, n FROM status_counts WHERE n >= 4`.
- `WITH t(status, n) AS (SELECT status, count(*) FROM orders GROUP BY status)`: the column list names both columns, so the inner query needs no `AS`.
- `WITH a AS (…), b AS (… FROM a …) SELECT … FROM b`: two `with_query`s, with `b` referring to `a` before it.

## Example {#example}

The question: the customers whose total spend is above average, with their names and totals, highest first. Cancelled orders do not count.

1. **Step one: a total for each customer.** Join orders to their items, group by customer and add up. Name this step `customer_totals`.
2. **Main query: attach the names.** `customer_totals` holds only `customer_id`; the names come from `customers`.
3. **Filter: totals above the average of all totals.** The average is another `avg` over `customer_totals`, written as a scalar subquery. It refers to the same CTE, so nothing is written twice.
4. **Sort.**

```sql run
WITH customer_totals AS (
  SELECT o.customer_id, sum(i.quantity * i.unit_price) AS total
  FROM orders AS o
  JOIN order_items AS i ON i.order_id = o.id
  WHERE o.status <> 'cancelled'
  GROUP BY o.customer_id
)
SELECT c.name, t.total
FROM customer_totals AS t
JOIN customers AS c ON c.id = t.customer_id
WHERE t.total > (SELECT avg(total) FROM customer_totals)
ORDER BY t.total DESC;
```

Ten customers have valid orders, the average spend is 268.80, and three are above it. Written with derived tables, the summing part would appear twice, and the two copies would have to stay identical; change one later and forget the other, and the answer goes quietly wrong.

## Variations {#variants}

**A relay of steps.** The second CTE builds on the first. Compute each order's total, keep the orders of 150 dollars or more, then summarise by customer:

```sql run
WITH order_totals AS (
  SELECT order_id, sum(quantity * unit_price) AS total
  FROM order_items
  GROUP BY order_id
),
big_orders AS (
  SELECT order_id, total
  FROM order_totals
  WHERE total >= 150
)
SELECT o.customer_id, count(*) AS big_orders, sum(b.total) AS spent
FROM big_orders AS b
JOIN orders AS o ON o.id = b.order_id
GROUP BY o.customer_id
ORDER BY spent DESC;
```

Each step can be checked on its own: replace the main query with `SELECT * FROM order_totals` to see what step one produced. When debugging a long query, this is the most useful thing about CTEs.

**Naming columns with a column list.** The brackets after the name name every column at once, so the inner query needs no `AS`:

```sql run
WITH status_counts (status, n) AS (
  SELECT status, count(*) FROM orders GROUP BY status
)
SELECT status, n FROM status_counts ORDER BY n DESC, status;
```

**Together with an outer join.** Summarise the quantity sold of each product first, then `LEFT JOIN` it back to the products, so that unsold products show 0:

```sql run
WITH product_sales AS (
  SELECT product_id, sum(quantity) AS sold
  FROM order_items
  GROUP BY product_id
)
SELECT p.name, coalesce(s.sold, 0) AS sold
FROM products AS p
LEFT JOIN product_sales AS s ON s.product_id = p.id
ORDER BY sold DESC, p.name
LIMIT 5;
```

Summarising before joining keeps Chapter 4's {{term:fan-trap}} away: `product_sales` has one row per product, so the join multiplies nothing.

**Finding the row with the maximum.** One CTE both computes each country's spend and provides the maximum:

```sql run
WITH country_spend AS (
  SELECT c.country, sum(i.quantity * i.unit_price) AS spent
  FROM customers AS c
  JOIN orders AS o ON o.customer_id = c.id
  JOIN order_items AS i ON i.order_id = o.id
  WHERE o.status <> 'cancelled'
  GROUP BY c.country
)
SELECT country, spent
FROM country_spend
WHERE spent = (SELECT max(spent) FROM country_spend);
```

## Going deeper {#deeper}

**How does the database run a CTE compared with a derived table?** Since PostgreSQL 12, a CTE referenced only once is usually "inlined": it is optimised together with the main query, just like a derived table, and performs the same. A CTE referenced two or more times is computed once by default and its result kept for each use. `AS MATERIALIZED` forces the result to be kept and `AS NOT MATERIALIZED` forces inlining, though you will rarely need either. Older articles warning that "a CTE is an optimisation fence and makes queries slow" describe PostgreSQL before version 12.

**A CTE hides a table of the same name.** `WITH orders AS (SELECT 1 AS id) SELECT * FROM orders` reads the CTE, not the real `orders` table. There is no error, so avoid existing table names when naming a CTE.

**Only later CTEs can refer to earlier ones.** An ordinary CTE can only use CTEs written before it. Here `a` uses `b`, which comes after it:

```sql run error
WITH a AS (SELECT * FROM b),
     b AS (SELECT 1 AS x)
SELECT * FROM a;
```

The error is `relation "b" does not exist`, and the DETAIL explains that a CTE named `b` exists but cannot be referenced from this point. Swap the two CTEs and it works. The `WITH RECURSIVE` mentioned in the HINT is the next lesson's subject.

**Data-changing statements can use `WITH` too.** Besides `SELECT`, the main statement after `WITH` can be `INSERT`, `UPDATE` or `DELETE`; Chapter 7 uses this.

**Other databases.** `WITH` is standard SQL, supported by MySQL 8.0, SQLite 3.8.3, SQL Server and Oracle. SQL Server requires the statement before a `WITH` to end with a semicolon, which is why you will see `;WITH` written there.

## Common mistakes {#mistakes}

**1. Writing `WITH` before every CTE.** `WITH` appears once; further CTEs follow after a comma:

```sql run error
WITH a AS (SELECT 1 AS x),
WITH b AS (SELECT 2 AS y)
SELECT * FROM a, b;
```

`syntax error at or near "WITH"`. Delete the second `WITH` and keep the comma. Leaving out the comma instead fails with `syntax error at or near "b"`.

**2. A semicolon after the CTE.**

```sql run error
WITH a AS (SELECT 1 AS x);
SELECT * FROM a;
```

`syntax error at or near ";"`. The semicolon ends the statement, and a statement with a `WITH` but no main query is incomplete. The only semicolon goes after the main query.

**3. Using a CTE in the next statement.** A CTE exists only within the statement that defines it:

```sql run error
WITH t AS (SELECT 1 AS x)
SELECT * FROM t;
SELECT * FROM t;
```

The first statement works; the second fails with `relation "t" does not exist`. To use the same result in several statements, repeat the `WITH` in each, or create a {{term:view}} as in Chapter 8.

**4. Writing the `WITH` but forgetting the main query.** Running just the CTE gives `syntax error at end of input`. A CTE returns nothing by itself; a main query has to read from it.

**5. Expecting a CTE to sort or deduplicate anything.** A CTE is an ordinary query, and its result is exactly what that query returns on its own. An `ORDER BY` inside a CTE does not fix the main query's order; only the main query's `ORDER BY` does.

## Summary {#summary}

- `WITH name AS (query)` names an intermediate result, and the main query uses it like a table.
- Several CTEs are separated by commas under one `WITH`; later ones may use earlier ones, so the query reads from top to bottom.
- The main query can use one CTE several times, so the same subquery is never written twice.
- A CTE lasts for one statement and is not stored; there is no semicolon between `WITH` and the main query.
- From PostgreSQL 12 on, a CTE and a derived table usually perform the same; pick the more readable one.
