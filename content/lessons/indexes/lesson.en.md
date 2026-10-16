## Why you need it {#why}

shop has only 24 orders, so every query is instant. A real online shop might have tens of millions. Support types in a customer id to see that customer's orders: how does the database find them?

With nothing else to go on, it reads from the first row to the last, checking each row's `customer_id`. Only a few dozen of those millions of rows are wanted; reading the rest is wasted effort. It is like looking for a word in a thick book with no contents page and no index: page by page.

## Core idea {#core}

### The index at the back of the book

An {{term:index}} is a separate structure stored alongside the table: one column's values in sorted order, each noting where its row lives. To find `customer_id = 42`, the database locates 42 quickly in the sorted structure and goes straight to those rows, without reading the whole table.

PostgreSQL's default index is a {{term:b-tree}}. Picture a very short, very wide tree: even tens of millions of values take only three or four levels, so a few steps lead from the root to a leaf.

### First, without an index

Generate a table of 100,000 page visits, `visits`, with about 50 rows per customer. `EXPLAIN` shows how the database **plans** to run a query; the next lesson covers it properly, so for now look only at the first line:

```sql run
CREATE TABLE visits AS
SELECT g AS id,
       g % 2000 AS customer_id,
       TIMESTAMP '2024-01-01' + g * INTERVAL '1 minute' AS visited_at
FROM generate_series(1, 100000) AS g;
ANALYZE visits;

EXPLAIN (COSTS OFF)
SELECT * FROM visits WHERE customer_id = 42;
```

`Seq Scan on visits` is a {{term:sequential-scan}}: read the whole table and check each row with `Filter`.

### Then with an index

```sql run
CREATE TABLE visits AS
SELECT g AS id,
       g % 2000 AS customer_id,
       TIMESTAMP '2024-01-01' + g * INTERVAL '1 minute' AS visited_at
FROM generate_series(1, 100000) AS g;
CREATE INDEX visits_customer_id_idx ON visits (customer_id);
ANALYZE visits;

EXPLAIN (COSTS OFF)
SELECT * FROM visits WHERE customer_id = 42;
```

The plan is now a `Bitmap Heap Scan`, with a `Bitmap Index Scan on visits_customer_id_idx` beneath it: the database first finds where the 50 rows are in the index, then fetches exactly those. The query has not changed by a single character, and neither has its result; only the way the database finds the rows has.

### The database decides

You cannot order the database to "use this index" in a query. The {{term:query-planner}} estimates the cost of each approach from {{term:table-statistics}} and picks the cheapest. When the wanted rows are a small fraction of the table (high {{term:selectivity}}), the index pays off; when they are most of it, reading the whole table is faster.

### Indexes are not free

- **They take space**: the index above is about a fifth of the table's size.
- **They slow writes**: every `INSERT`, `UPDATE` and `DELETE` must update every index on the table.
- So index the conditions that are actually used often, not every column.

Primary keys and unique constraints create a unique index automatically, which is why looking up by `id` is already fast. A {{term:foreign-key}} does not get one.

## Syntax {#syntax}

```syntax
CREATE [ UNIQUE ] INDEX [ index_name ] ON table_name [ USING method ]
    ( { column_name | ( expression ) } [ ASC | DESC ] [, …] )
    [ WHERE condition ]
```

```syntax
DROP INDEX [ IF EXISTS ] index_name
```

| Part | What goes there | Rule |
|---|---|---|
| `UNIQUE` | Make the index also forbid duplicates | Optional; same effect as a unique constraint |
| `index_name` | The index's name | Optional; the database picks one such as `visits_customer_id_idx`; by convention `table_column_idx` |
| `USING method` | The kind of index | Optional; `btree` by default |
| `column_name` | The column to index | Several are allowed, and their order matters (see Variations) |
| `( expression )` | A value computed from columns | Such as `(lower(email))`; note the extra brackets |
| `ASC` / `DESC` | The order within the index | Optional; a B-tree reads both ways, so it is rarely needed |
| `WHERE condition` | Index only the rows that meet it | Optional |

Some statements, read against the shape:

- `CREATE INDEX visits_customer_id_idx ON visits (customer_id)`: named, one column.
- `CREATE INDEX ON orders (customer_id, ordered_at)`: unnamed, two columns.
- `CREATE UNIQUE INDEX ON customers (lower(email))`: unique, on an expression.

## Example {#example}

The task: support often looks up a customer's orders, newest first. Give `orders` a suitable index.

1. **Find the query's condition and sort order.** The condition is `customer_id = …`; the sort is `ordered_at DESC`.
2. **The condition column goes first.** With the index sorted by `customer_id`, one customer's orders sit together.
3. **The sort column goes second.** Within a customer, orders are sorted by `ordered_at`, so reading backwards gives "newest first" with no separate sort.
4. **Create the index, then take a look in `pg_indexes`.**

```sql run
CREATE INDEX orders_customer_id_ordered_at_idx
ON orders (customer_id, ordered_at);

SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'orders';
```

`orders` now has two indexes: `orders_pkey`, which came with the primary key, and the new one. shop's tables are so small that the database will still read the whole table; at a few million rows, this index lets "a customer's latest orders" read just a handful of rows.

## Variations {#variants}

**Multi-column indexes: column order decides where they help.** An index on `(customer_id, visited_at)` sorts by customer, then by time, like a phone book sorted by surname, then first name. A search by time alone gets no help from it:

```sql run
CREATE TABLE visits AS
SELECT g AS id,
       g % 2000 AS customer_id,
       TIMESTAMP '2024-01-01' + g * INTERVAL '1 minute' AS visited_at
FROM generate_series(1, 100000) AS g;
CREATE INDEX ON visits (customer_id, visited_at);
ANALYZE visits;

EXPLAIN (COSTS OFF)
SELECT * FROM visits
WHERE visited_at >= '2024-03-01' AND visited_at < '2024-03-01 00:10';
```

`Seq Scan`. A {{term:composite-index}} helps only when the condition includes its first column. Change the condition to `customer_id = 42 AND visited_at >= '2024-02-01'` and run it again to see the index used.

**Indexing for a sort.** "The latest 5 visits" without an index means sorting all 100,000 rows first; with an index on `visited_at`, the database reads 5 entries backwards from the end of the index:

```sql run
CREATE TABLE visits AS
SELECT g AS id,
       g % 2000 AS customer_id,
       TIMESTAMP '2024-01-01' + g * INTERVAL '1 minute' AS visited_at
FROM generate_series(1, 100000) AS g;
CREATE INDEX ON visits (visited_at);
ANALYZE visits;

EXPLAIN (COSTS OFF)
SELECT * FROM visits ORDER BY visited_at DESC LIMIT 5;
```

`Index Scan Backward`: the index is read in reverse, and there is no `Sort` step.

**{{Term:expression-index|Expression indexes}}: when the query computes on a column.** A case-insensitive email search has the condition `lower(email) = …`. An ordinary index on `email` cannot serve it; you need an index on `lower(email)`. Add `UNIQUE`, and emails also cannot repeat regardless of case:

```sql run error
CREATE UNIQUE INDEX customers_email_lower_key ON customers (lower(email));

INSERT INTO customers (id, name, email, country, joined_on)
VALUES (13, 'Lin W.', 'LIN.WEI@example.com', 'China', '2024-07-01');
```

`duplicate key value violates unique constraint "customers_email_lower_key"`: the upper-case email counts as the same as Lin Wei's.

**{{Term:partial-index|Partial indexes}}: index only the rows you need.** If only pending orders are ever searched, index just those; the index is smaller and writes are faster:

```sql run
CREATE INDEX orders_pending_idx ON orders (ordered_at)
WHERE status = 'pending';

SELECT indexname, indexdef FROM pg_indexes WHERE indexname = 'orders_pending_idx';
```

The database uses it only for queries whose condition includes `status = 'pending'`.

## Going deeper {#deeper}

**When an index cannot help.**

- The table is small: shop's `orders` fits in one page, and reading it is quicker than consulting an index.
- Too many rows are wanted: for 99% of 100,000 rows, the database reads the table directly.
- The condition computes on the column: with an index on `customer_id`, neither `WHERE customer_id + 0 = 42` nor `WHERE customer_id::text = '42'` can use it. Rewrite the condition or build an expression index.
- A `LIKE` that starts with a wildcard: `email LIKE '%@example.com'` cannot use sorted order, like searching a phone book sorted by surname for "first names ending in Wei".

**Beyond B-trees.** `USING gin` suits arrays, `jsonb` and full-text search; `USING brin` suits huge tables written in time order, with a tiny index; `USING hash` supports only equality. The default B-tree is right almost every time.

**Reading the index alone.** When every column a query needs is in the index, as in `SELECT customer_id FROM visits WHERE customer_id BETWEEN 10 AND 12`, the database can sometimes answer from the index without touching the table, shown in a plan as `Index Only Scan`.

**Creating indexes in production.** A plain `CREATE INDEX` blocks writes to the table while it builds. On a large table use `CREATE INDEX CONCURRENTLY`, which is slower but does not block writes. It cannot run inside a transaction, so it is not available in SQL Lab.

**Index your foreign keys.** Deleting a customer makes the database check whether any order references that customer, which means searching `orders.customer_id`. Without an index, that is a read of all of `orders`. When you often join on a foreign key or delete referenced rows, index the foreign key column.

## Common mistakes {#mistakes}

**1. Indexing every column.** More indexes mean slower writes and more space, and many of them are never used. Start from real slow queries, and index only the conditions, joins and sorts that are common.

**2. A multi-column index in the wrong order.** Queries always filter on `customer_id`, but the index is `(ordered_at, customer_id)`, which barely helps `WHERE customer_id = 42`. Put equality columns first, and range and sort columns after them.

**3. Computing on the column in the condition.** With an index on `email`, `WHERE lower(email) = 'lin.wei@example.com'` cannot use it:

```sql run
CREATE TABLE people AS
SELECT g AS id, 'User' || g || '@Example.com' AS email
FROM generate_series(1, 100000) AS g;
CREATE INDEX ON people (email);
ANALYZE people;

EXPLAIN (COSTS OFF)
SELECT * FROM people WHERE lower(email) = 'user42@example.com';
```

`Seq Scan`. Index `(lower(email))` instead, or compare `email` directly.

**4. Expecting a small table to use a new index.** Create an index on `customer_id` in shop's `orders`, and `EXPLAIN` still says `Seq Scan`. The index is not broken; the table is so small that reading it directly is faster. Test performance with data of realistic size.

**5. Two indexes with the same name.** `CREATE INDEX idx ON orders (customer_id)` followed by `CREATE INDEX idx ON orders (status)` fails with `relation "idx" already exists`: indexes share one set of names with tables. Use names that say what they are for, such as `table_column_idx`.

## Summary {#summary}

- An index is a structure sorted by column values that lets the database find rows without reading the whole table; the default kind is a B-tree.
- The query planner decides whether to use it: an index for few rows, a direct read for many; small tables are usually read directly.
- Indexes take space and slow writes, so build them only for common conditions, joins and sorts.
- A multi-column index's column order decides where it helps; conditions that compute on a column need an expression index.
- Primary keys and unique constraints come with indexes; foreign keys do not.
