## Why you need it {#why}

A report query that was quick yesterday takes tens of seconds today. More data? A missing index? A join written wrong? Guessing can mean an afternoon of changes that never touch the real cause.

SQL says what you want, not how to get it. The how is the database's own decision, written down in a {{term:query-plan}}, and `EXPLAIN` shows it to you. The last lesson glanced at its first line; this one reads the whole plan.

## Core idea {#core}

### A plan is a tree

Put `EXPLAIN` in front of any statement and you get back not the query's result but how the database intends to run it:

```sql run
EXPLAIN
SELECT c.name, count(*) AS orders
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
GROUP BY c.name
ORDER BY orders DESC;
```

Each line is a {{term:plan-node}}, and `->` with indentation shows parent and child. Data starts in the innermost nodes and is handed outwards, level by level, to their parents; the outermost node produces the final result. So a plan is read **from the inside out, from the bottom up**:

1. `Seq Scan on customers c`: read the customers table.
2. `Hash`: put the customers into a hash table keyed on `id`.
3. `Seq Scan on orders o`: read the orders table.
4. `Hash Join`: look each order's customer up in the hash table, on the `Hash Cond`.
5. `HashAggregate`: group and count by the `Group Key`, which is the `GROUP BY`.
6. `Sort`: sort by the `Sort Key`, which is the `ORDER BY`.

That is Chapter 0's logical processing order: `FROM` and joins first, then grouping, then sorting.

### The estimates in brackets

The brackets after each node are a {{term:cost-estimate}}:

| Field | Means |
|---|---|
| `cost=1.27..2.60` | Startup cost..total cost, in the database's own "cost units", not milliseconds; useful only for comparison |
| `rows=24` | How many rows the node is expected to output |
| `width=11` | The expected average row size in bytes |

These are all **estimates**, based on the {{term:table-statistics}} the database collects. `EXPLAIN` alone does not run the query.

### EXPLAIN ANALYZE: running it for real

Add `ANALYZE` and the database really runs the statement, writing what actually happened beside each node:

```sql run
EXPLAIN ANALYZE
SELECT * FROM orders WHERE status = 'pending';
```

`actual time` is the node's real time in milliseconds, `rows` the rows it really output, and `loops` how many times it ran. `Rows Removed by Filter: 20` says 24 rows were read and 20 thrown away. When estimated and actual rows are far apart, that is often why a plan went wrong.

## Syntax {#syntax}

```syntax
EXPLAIN [ ANALYZE ] statement
EXPLAIN ( option [ boolean ] [, …] ) statement
```

| Part | What goes there | Rule |
|---|---|---|
| `statement` | Any `SELECT`, `INSERT`, `UPDATE` or `DELETE` | Not run unless `ANALYZE` is given |
| `ANALYZE` | Run it for real and report actual times and rows | For a data-changing statement, the change really happens |
| `COSTS OFF` | Hide the estimates in brackets | Cleaner when you only want the plan's shape |
| `TIMING OFF` | Hide each node's time | Used with `ANALYZE` |
| `BUFFERS OFF`, `SUMMARY OFF` | Hide pages read and total times | Used with `ANALYZE` |
| `FORMAT JSON` | Output the plan as JSON | For visualisation tools |

In `option [ boolean ]`, `boolean` is `ON` or `OFF`, and `ON` when left out.

Some statements, read against the shapes:

- `EXPLAIN SELECT …`: the first shape, estimates only.
- `EXPLAIN ANALYZE SELECT …`: the first shape, run for real.
- `EXPLAIN (ANALYZE, COSTS OFF, TIMING OFF) SELECT …`: the second shape, three options, with `COSTS` and `TIMING` set `OFF`.

## Example {#example}

The question: why, on a newly created large table, is a query's estimate ten times off reality, and how is it fixed?

1. **Create a 100,000-row table without `ANALYZE`.** The database has no statistics about it yet.
2. **Compare estimate and reality with `EXPLAIN ANALYZE`.** The estimated `rows` is in the left brackets, the actual `rows` in the right.
3. **Compare.** 506 rows estimated, only 50 actual: with no statistics, the database guesses with a default proportion.

```sql run
CREATE TABLE visits AS
SELECT g AS id, g % 2000 AS customer_id
FROM generate_series(1, 100000) AS g;

EXPLAIN (ANALYZE, BUFFERS OFF, TIMING OFF, SUMMARY OFF)
SELECT * FROM visits WHERE customer_id = 42;
```

4. **Collect statistics and look again.** `ANALYZE visits` samples the distribution of values in each column:

```sql run
CREATE TABLE visits AS
SELECT g AS id, g % 2000 AS customer_id
FROM generate_series(1, 100000) AS g;
ANALYZE visits;

EXPLAIN (ANALYZE, BUFFERS OFF, TIMING OFF, SUMMARY OFF)
SELECT * FROM visits WHERE customer_id = 42;
```

Now the estimate is 50 rows, matching reality. Being ten times off does no harm here, since the plan is the same; but in a complex join, wrong row estimates make the database choose the wrong join method and run a hundred times slower. A real database runs `ANALYZE` automatically in the background, but after a large data load it is safer to run it yourself.

## Variations {#variants}

**Just the shape: `COSTS OFF`.** Without the estimates, a plan is easier to read:

```sql run
EXPLAIN (COSTS OFF)
SELECT name, price
FROM products
WHERE category_id = 2
ORDER BY price DESC
LIMIT 2;
```

Inside out: read `products` and keep category 2 with `Filter`, `Sort` by price, and `Limit` to the first two rows.

**The primary key's index at work.** A lookup by primary key shows `Index Scan using products_pkey`, with `Index Cond` as the condition used on the index:

```sql run
EXPLAIN (COSTS OFF)
SELECT * FROM products WHERE id = 3;
```

**Another join: `Nested Loop`.** For each row taken from the outer side, look up the inner side once. The database chooses it when the inner side has an index and the outer side has few rows:

```sql run
CREATE TABLE visits AS
SELECT g AS id, g % 2000 AS customer_id
FROM generate_series(1, 100000) AS g;
CREATE TABLE people AS
SELECT g AS id, 'User ' || g AS name
FROM generate_series(0, 1999) AS g;
CREATE INDEX ON visits (customer_id);
ANALYZE visits;
ANALYZE people;

EXPLAIN (COSTS OFF)
SELECT p.name, count(*)
FROM visits AS v
JOIN people AS p ON p.id = v.customer_id
WHERE p.id < 5
GROUP BY p.name;
```

Five people, one index lookup each. Remove `WHERE p.id < 5` and run it again: joining all 2,000 people, the database switches to a `Hash Join`. Same query, different data, different plan.

**Seeing a change's plan without making the change.** `EXPLAIN ANALYZE` really runs a `DELETE`. Put it inside a transaction and roll back afterwards:

```sql run
BEGIN;
EXPLAIN ANALYZE DELETE FROM order_items WHERE order_id = 3;
ROLLBACK;

SELECT count(*) AS still_there FROM order_items WHERE order_id = 3;
```

## Going deeper {#deeper}

**Common nodes.**

| Node | Does |
|---|---|
| `Seq Scan` | Reads the whole table from start to end |
| `Index Scan` | Finds rows through an index, then fetches them from the table |
| `Index Only Scan` | Answers from the index alone, without visiting the table |
| `Bitmap Index Scan` + `Bitmap Heap Scan` | Collects every matching row's position from the index, then fetches them from the table in order, in batches |
| `Nested Loop` | For each outer row, looks up the inner side; suits few outer rows and an indexed inner side |
| `Hash Join` | Builds a hash table from one side and probes it row by row from the other; suits two larger sides joined on equality |
| `Merge Join` | Merges two sides already sorted on the join column, like closing a zip |
| `HashAggregate`, `GroupAggregate` | Grouping and aggregation, also used for `DISTINCT` |
| `Sort`, `Limit` | Sorting; taking the first rows |

**How costs are counted.** Reading a page in sequence counts 1, a random page 4, processing a row 0.01, and so on; a node's cost adds these up. Costs mean something only when compared on the same data and machine.

**Statistics.** `ANALYZE` samples how many distinct values each column has, which values are most common, and how values are distributed. The planner relies on this to estimate how many rows a `WHERE` keeps and a join produces. In a real PostgreSQL, the background autovacuum keeps it up to date. SQL Lab runs `ANALYZE` when it loads shop, so shop's estimates are accurate; tables you create during a run need their own `ANALYZE`.

**Visualising plans.** For a long plan, `EXPLAIN (ANALYZE, FORMAT JSON)` gives JSON that online plan visualisers turn into a coloured tree, with the slowest nodes easy to spot.

**Other databases.** MySQL 8 and SQLite have `EXPLAIN` too (in SQLite, usually `EXPLAIN QUERY PLAN`); SQL Server shows execution plans graphically; Oracle uses `EXPLAIN PLAN FOR`. The output differs, but it is always a tree of nodes.

## Common mistakes {#mistakes}

**1. Reading a plan from the top down.** The first line is the step that finishes last. Start from the most indented nodes and read outwards and upwards.

**2. Taking `cost` for milliseconds.** `cost=1.27..2.60` is in cost units, not time. For real times, use `EXPLAIN ANALYZE` and read `actual time`.

**3. `EXPLAIN ANALYZE` on a data-changing statement, which really changes the data.**

```sql run
EXPLAIN (ANALYZE, COSTS OFF, BUFFERS OFF, TIMING OFF, SUMMARY OFF)
DELETE FROM order_items WHERE order_id = 3;

SELECT count(*) AS left_over FROM order_items WHERE order_id = 3;
```

The items are gone. On a real database, this is a real delete. To see how a change actually runs, `BEGIN` first and `ROLLBACK` afterwards.

**4. Judging plans on tiny data.** shop's tables have a few dozen rows each, so nearly every query is a `Seq Scan`, which is exactly right. At millions of rows, the same query gets a completely different plan. Analyse performance with data of realistic size.

**5. Forgetting `ANALYZE` after creating or loading a table.** Without statistics, estimates can be ten or a hundred times off, and the planner chooses badly. See the Example.

## Summary {#summary}

- `EXPLAIN` shows how the database plans to run a statement; a plan is a tree of nodes, read from the innermost outwards.
- `cost`, `rows` and `width` in brackets are estimates, and `cost` is not in milliseconds.
- `EXPLAIN ANALYZE` runs the statement for real and shows actual times, rows and loops; for data changes, wrap it in a transaction and roll back.
- Estimated rows far from actual rows often explain a bad plan; run `ANALYZE` after creating or loading a table.
- The same query gets different plans at different data sizes, so judge with realistic data.
