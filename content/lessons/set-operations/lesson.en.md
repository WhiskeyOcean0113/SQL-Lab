## Why you need it {#why}

Customer service wants Lin Wei's full timeline: when each order was placed and when it shipped, all in time order.

"Placed" and "shipped" are two columns of the same `orders` table, `ordered_at` and `shipped_at`. One order row can hold two events, but the result needs **one row per event**. `WHERE` only picks rows and a join only puts columns side by side; neither can stack two lists on top of each other.

## Core idea {#core}

A {{term:set-operation}} combines the results of two queries as if they were two sets:

| Written as | Result |
|---|---|
| `A UNION B` | rows in A or B, the {{term:set-union}}, with duplicates kept once |
| `A UNION ALL B` | every row of A followed by every row of B, duplicates kept |
| `A INTERSECT B` | rows in both A and B, the {{term:set-intersection}} |
| `A EXCEPT B` | rows in A but not in B, the {{term:set-difference}} |

The two queries must follow two rules:

- **The same number of columns**, matched **by position**: first with first, second with second, regardless of names.
- Matching columns of **compatible types**.

The result takes its column names from the first query, and `ORDER BY` goes at the very end and sorts the whole result.

## Syntax {#syntax}

```syntax
select_statement { UNION | INTERSECT | EXCEPT } [ ALL | DISTINCT ] select_statement
[ ORDER BY expression [, …] ]
[ LIMIT count ]
```

| Part | What goes there | Notes |
|---|---|---|
| `select_statement` | A query, with its own `WHERE`, `GROUP BY` and `HAVING` if needed | It cannot carry its own `ORDER BY` or `LIMIT` unless wrapped in parentheses (see Variations) |
| `UNION` / `INTERSECT` / `EXCEPT` | One of the three operations | The result can feed another set operation: `A UNION B EXCEPT C` |
| `ALL` | Keep duplicate rows | Optional |
| `DISTINCT` | Remove duplicate rows | Optional; with neither `ALL` nor `DISTINCT`, it is `DISTINCT` |
| `ORDER BY expression` | Sorts the whole combined result | Only result column names or positions, no expressions |
| `LIMIT count` | Takes the first rows of the combined result | Optional |

In the shape, `ORDER BY` and `LIMIT` follow the last query and look as if they belong to it, but they belong to the result of the whole set operation.

The example's query, read against the shape: the first `select_statement` picks order events, then `UNION ALL`, the second picks shipping events, and the final `ORDER BY at` sorts by `at`, the column name given in the first query.

## Example {#example}

Task: Lin Wei's (customer 1) placed and shipped events for each order, in time order.

1. **Write the first list.** Placed events: order id, event name, time. The event name is a constant, `'ordered'`.
2. **Write the second list with its columns lined up.** Shipped events: the same three columns, with `shipped_at` as the time, for shipped orders only.
3. **Decide whether to remove duplicates.** The two lists have different event names, so no two rows can be identical; use `UNION ALL` and skip the deduplication work.
4. **Sort the whole result last.**

```sql run
SELECT id AS order_id, 'ordered' AS event, ordered_at AS at
FROM orders
WHERE customer_id = 1
UNION ALL
SELECT id, 'shipped', shipped_at
FROM orders
WHERE customer_id = 1 AND shipped_at IS NOT NULL
ORDER BY at;
```

Seven events: 4 orders placed, 3 shipped, and order 22 not shipped yet. The second query's columns have no aliases, because only the first query names the result's columns.

## Variations {#variants}

**`UNION` versus `UNION ALL`.** Customers who ordered in January or in June:

```sql run
SELECT customer_id FROM orders WHERE ordered_at < '2024-02-01'
UNION
SELECT customer_id FROM orders WHERE ordered_at >= '2024-06-01'
ORDER BY customer_id;
```

Seven customers. `UNION ALL` gives 10 rows instead, because customers 1, 2 and 3 ordered in both months and appear twice.

**`INTERSECT`: in both.** Customers who ordered before April and came back in June:

```sql run
SELECT customer_id FROM orders WHERE ordered_at < '2024-04-01'
INTERSECT
SELECT customer_id FROM orders WHERE ordered_at >= '2024-06-01'
ORDER BY customer_id;
```

**`EXCEPT`: on the left, not on the right.** Customers who ordered before April but did not return in June:

```sql run
SELECT customer_id FROM orders WHERE ordered_at < '2024-04-01'
EXCEPT
SELECT customer_id FROM orders WHERE ordered_at >= '2024-06-01'
ORDER BY customer_id;
```

The direction of `EXCEPT` matters: `A EXCEPT B` and `B EXCEPT A` are different questions.

**Sorting and limiting each side separately.** Wrap a `select_statement` in parentheses and it may have its own `ORDER BY` and `LIMIT`. The two most expensive and the two cheapest products together:

```sql run
(SELECT name, price FROM products ORDER BY price DESC LIMIT 2)
UNION ALL
(SELECT name, price FROM products ORDER BY price LIMIT 2)
ORDER BY price DESC;
```

The `ORDER BY … LIMIT 2` inside each pair of parentheses decides which two rows each side contributes; the final `ORDER BY` outside sorts the 4 combined rows.

**Combining different tables.** As long as the columns line up, the two sides can come from different tables; a constant column labels the source:

```sql run
SELECT 'customer' AS kind, name FROM customers WHERE country = 'Canada'
UNION ALL
SELECT 'product', name FROM products WHERE category_id = 4
ORDER BY kind, name;
```

## Going deeper {#deeper}

**Set operations treat NULLs as equal.** As with `DISTINCT` and `GROUP BY`, two NULLs count as the same here. So `EXCEPT` avoids the `NOT IN` trap from two lessons ago:

```sql run
SELECT city FROM customers
EXCEPT
SELECT city FROM customers WHERE country = 'Japan';
```

Seven rows: Osaka is removed and NULL keeps one row. Like `UNION`, `EXCEPT` removes duplicates; `INTERSECT ALL` and `EXCEPT ALL` keep how many times each row occurs.

**`INTERSECT` binds more tightly than `UNION` and `EXCEPT`.** Without parentheses, `A UNION B INTERSECT C` means `A UNION (B INTERSECT C)`, just as multiplication comes before addition. When mixing them, add parentheses:

```sql run
SELECT customer_id FROM orders WHERE status = 'cancelled'
UNION
(SELECT customer_id FROM orders WHERE status = 'pending'
 INTERSECT
 SELECT customer_id FROM orders WHERE status = 'paid')
ORDER BY customer_id;
```

**`UNION` removes duplicates, which costs more.** Deduplicating means comparing all rows. When duplicates cannot occur, or when they matter, use `UNION ALL`.

**Emulating `FULL JOIN` with `UNION`.** As chapter 4 mentioned, MySQL has no `FULL JOIN`; the usual substitute is a `UNION` of a `LEFT JOIN` and a `RIGHT JOIN`. MySQL also gained `INTERSECT` and `EXCEPT` only in 8.0.31, and Oracle calls `EXCEPT` `MINUS`.

## Common mistakes {#mistakes}

**1. Different numbers of columns.**

```sql run error
SELECT id, name FROM customers WHERE country = 'Canada'
UNION
SELECT name FROM products WHERE category_id = 4;
```

`each UNION query must have the same number of columns`. Select the same number of columns on both sides.

**2. Columns out of order.** Set operations pair columns by position, not by name. This mixes cities and countries in one column without any error:

```sql run
SELECT city FROM customers
UNION
SELECT country FROM customers;
```

Sixteen rows of cities and countries jumbled together, under the name `city`. Before writing, line up the two select lists and check them column by column.

**3. Incompatible types.** `SELECT id FROM customers UNION SELECT name FROM categories` fails with `UNION types integer and text cannot be matched`.

**4. `ORDER BY` in the middle.** `ORDER BY` can only go at the end of the whole set operation, sorting the combined result; after the first query it is a syntax error.

**5. An expression in the final `ORDER BY`.**

```sql run error
SELECT name FROM customers WHERE country = 'Canada'
UNION
SELECT name FROM products WHERE category_id = 4
ORDER BY lower(name);
```

That fails with `invalid UNION/INTERSECT/EXCEPT ORDER BY clause`, and the detail says only result column names can be used, not expressions or functions. In the shape, this `ORDER BY` sorts the combined result, and it knows only the result's columns. To sort by an expression, compute it in each side's select list and sort by that column.

**6. `UNION` where `UNION ALL` was needed.** Combining two sets of sales records and then summing them, `UNION` merges two rows that happen to be identical into one, and the total comes out too low. When every row must be kept, use `UNION ALL`.

## Summary {#summary}

- `UNION` combines and removes duplicates, `UNION ALL` combines and keeps them, `INTERSECT` keeps rows in both, `EXCEPT` keeps rows on the left but not the right.
- Both sides have the same number of columns, of compatible types, matched by position; the column names come from the first query.
- `ORDER BY` goes at the end and sorts the whole result.
- Set operations treat NULLs as equal; `INTERSECT` is evaluated before `UNION` and `EXCEPT`, so use parentheses when mixing them.
- When you do not need deduplication, use `UNION ALL`: it is faster and never merges identical rows by mistake.
