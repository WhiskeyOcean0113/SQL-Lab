## Why you need it {#why}

"List every customer, along with the orders each has placed." The previous lesson's inner join cannot do it: Lucas Silva and Mei Tanaka have never ordered, find no partner in `orders`, and the inner join drops them.

```sql run
SELECT c.name, o.id AS order_id
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
ORDER BY c.id, o.id;
```

Twenty-four rows, and only 10 of the 12 customers appear. Yet "who has not ordered yet" is often exactly what you want to know.

## Core idea {#core}

An {{term:outer-join}} starts from the inner join and **also keeps the rows on one side that found no partner**, filling the other side's columns with NULL. A keyword says which side is kept:

| Written as | Keeps the unmatched rows of |
|---|---|
| `LEFT JOIN` | the left table (written before `JOIN`) |
| `RIGHT JOIN` | the right table (written after `JOIN`) |
| `FULL JOIN` | both tables |

They are the {{term:left-join}}, the {{term:right-join}} and the {{term:full-join}}. `LEFT JOIN` and `LEFT OUTER JOIN` are identical; `OUTER` is optional. The table whose rows are kept is the {{term:preserved-table}}.

```sql run
SELECT c.name, o.id AS order_id, o.status
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
ORDER BY c.id, o.id;
```

Twenty-six rows: the 24 pairs, plus one row each for Lucas Silva and Mei Tanaka, whose `order_id` and `status` are NULL.

One way to see it: do the inner join, then add back the left rows that never matched. So a left join returns **at least** as many rows as the left table has.

## Syntax {#syntax}

An outer join has the same shape as an inner join, apart from the words naming its type:

```syntax
FROM table_name [ [ AS ] alias ]
    { LEFT | RIGHT | FULL } [ OUTER ] JOIN table_name [ [ AS ] alias ] ON condition
    [ … ]
```

The last line, `[ … ]`, means further joins may follow, inner or outer.

| Part | Meaning | Optional? |
|---|---|---|
| `LEFT` / `RIGHT` / `FULL` | Which side keeps its unmatched rows | No: pick one; leaving it out makes an inner join |
| `OUTER` | Only says "this is an outer join" | Yes; it changes nothing |
| `ON condition` | What counts as a match; several conditions can be combined with `AND` | No |

All the join types of this chapter so far:

| Written as | Keeps |
|---|---|
| `JOIN`, `INNER JOIN` | Matched rows only |
| `LEFT [ OUTER ] JOIN` | Matched rows + unmatched rows of the left table |
| `RIGHT [ OUTER ] JOIN` | Matched rows + unmatched rows of the right table |
| `FULL [ OUTER ] JOIN` | Matched rows + unmatched rows of both |

Some joins, read against the shape:

- `LEFT JOIN orders AS o ON o.customer_id = c.id`: `LEFT` chosen, `OUTER` left out.
- `LEFT JOIN orders AS o ON o.customer_id = c.id AND o.status = 'pending'`: the `condition` is two conditions joined by `AND`, and both decide what counts as a match (see Going deeper).
- `FULL JOIN categories AS c ON c.id = p.category_id`: `FULL` chosen.

## Example {#example}

Task: which customers have never placed an order?

1. **Which table must be kept whole?** We are looking for customers, so `customers` goes on the left, `LEFT JOIN orders`.
2. **What does an unmatched row look like?** Every column from `orders` is NULL.
3. **Filter on exactly that.** Keep only the rows where the `orders` side is NULL. Check a column that can **never** be NULL in a real pair; the primary key `o.id` is the safest.

```sql run
SELECT c.id, c.name
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
WHERE o.id IS NULL;
```

Lucas Silva and Mei Tanaka. This "left join, then right side is NULL" pattern is an {{term:anti-join}}: it finds the rows that are in A but not in B.

## Variations {#variants}

**Products that have never sold.** The same idea with two other tables:

```sql run
SELECT p.name
FROM products AS p
LEFT JOIN order_items AS i ON i.product_id = p.id
WHERE i.product_id IS NULL;
```

Folding Chair.

**Keeping the product without a category.** The last lesson's inner join lost Gift Card; a left join brings it back:

```sql run
SELECT p.name, c.name AS category
FROM products AS p
LEFT JOIN categories AS c ON c.id = p.category_id
ORDER BY p.id;
```

**Left joins in a row, keeping everything.** Every customer, every order, every line item, with no customer who never ordered and no order without items lost:

```sql run
SELECT c.name, o.id AS order_id, i.product_id
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
LEFT JOIN order_items AS i ON i.order_id = o.id
ORDER BY c.id, o.id, i.product_id;
```

45 rows: 42 line items, plus order 24, which has none, plus the two customers who never ordered. Turn the second `LEFT JOIN` into `JOIN` and only 42 remain (see Going deeper).

**Showing NULL as text.** Chapter 2's `COALESCE` makes the unmatched rows easier to read:

```sql run
SELECT c.name, COALESCE(o.status, 'no orders') AS status
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
ORDER BY c.id;
```

**`RIGHT JOIN` just swaps the sides.** This gives the same result as the query above:

```sql run
SELECT p.name, c.name AS category
FROM categories AS c
RIGHT JOIN products AS p ON p.category_id = c.id
ORDER BY p.id;
```

In practice people almost always write `LEFT JOIN`, with the table to keep whole written first, because it reads more naturally.

**`FULL JOIN` keeps both sides.** It keeps products without a category and categories without products:

```sql run
SELECT p.name, c.name AS category
FROM products AS p
FULL JOIN categories AS c ON c.id = p.category_id;
```

Sixteen rows, the same as the left join, because every shop category has at least one product, so nothing on the right is left over. `FULL JOIN` is the tool for comparing two lists and seeing what appears on only one side.

## Going deeper {#deeper}

**`ON` and `WHERE` behave differently in an outer join.** For an inner join the position of a condition does not matter; for an outer join it matters a great deal.

A condition in `ON` decides **what counts as a match**. This query wants every customer together with any pending orders:

```sql run
SELECT c.name, o.id AS order_id
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id AND o.status = 'pending'
ORDER BY c.id;
```

All 12 customers are there; those without a pending order show NULL.

A condition in `WHERE` filters the joined result **afterwards**:

```sql run
SELECT c.name, o.id AS order_id
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
WHERE o.status = 'pending'
ORDER BY c.id;
```

Only 4 rows remain. For unmatched customers `o.status` is NULL, `NULL = 'pending'` is unknown, and `WHERE` removes them. The rows the left join kept are dropped again, and the result is exactly the inner join's. The rule: **to keep every left row, put conditions on the right table in `ON`.**

**A later inner join cancels an earlier outer join.** After `customers LEFT JOIN orders`, a further `JOIN order_items` drops the customers who never ordered (their `o.id` is NULL and matches no item), and order 24, which has no items, too. To keep them all the way through, the later joins must be `LEFT JOIN` as well.

**Other databases.** MySQL has no `FULL JOIN`; you combine a `LEFT JOIN` and a `RIGHT JOIN` with chapter 5's `UNION`. SQLite gained `RIGHT JOIN` and `FULL JOIN` only in version 3.39, in 2022. `LEFT JOIN` works everywhere.

## Common mistakes {#mistakes}

**1. Filtering the right table in `WHERE`, quietly turning the join back into an inner join.** See Going deeper: `LEFT JOIN … WHERE o.status = 'pending'` equals an inner join. It is one of the most common outer-join mistakes, and a hard one to notice: the query runs and the result looks reasonable.

**2. An anti-join that checks a column which can be NULL anyway.** Looking for customers who never ordered, but checking `shipped_at`:

```sql run
SELECT c.name, o.id AS order_id
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
WHERE o.shipped_at IS NULL;
```

Twelve rows. Orders that have not shipped have a NULL `shipped_at` already, so they slip in. An anti-join must check the join column or the primary key, which are NULL only when nothing matched.

**3. Sides the wrong way round.** `orders LEFT JOIN customers` keeps every order, and every order has a customer, so the result is the inner join's and the customers who never ordered are still missing. Decide which table must be kept whole, then write it on the left of `LEFT JOIN`.

**4. An inner join further down.** See Going deeper: a `LEFT JOIN` followed by a plain `JOIN` can drop the rows the outer join kept.

**5. An outer join without `ON`.** `FROM customers AS c LEFT JOIN orders AS o` with nothing after it fails with `syntax error at end of input`. In the shape, an outer join's `ON condition` cannot be left out.

**6. Finding unmatched rows with `= NULL`.** `WHERE o.id = NULL` is never true and returns nothing. Test for NULL with `IS NULL`.

## Summary {#summary}

- `LEFT JOIN` keeps every row of the left table, with NULL in the right table's columns when nothing matches; `RIGHT JOIN` is the mirror image, and `FULL JOIN` keeps both sides.
- A left join returns at least as many rows as the left table has.
- An anti-join, `LEFT JOIN … WHERE right_table_key IS NULL`, finds the rows in A that are not in B.
- To keep every left row, conditions on the right table go in `ON`; in `WHERE` they turn the join into an inner join.
- An inner join after an outer join can drop the rows the outer join kept.
