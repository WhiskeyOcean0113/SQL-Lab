## Why you need it {#why}

The shop wants a printed price list: what 1, 2 or 3 copies of each book cost. Or marketing wants to send the two Japanese customers a survey with one page per product category.

Neither question wants "matched rows". Both want **every combination**: each book × each quantity, each customer × each category. The joins so far used a condition to pick out pairs; this one picks none out.

## Core idea {#core}

A {{term:cross-join}} pairs every row of the left table with every row of the right table. There is no join condition, so there is no `ON`:

```sql run
SELECT u.name AS customer, c.name AS category
FROM customers AS u
CROSS JOIN categories AS c
WHERE u.country = 'Japan'
ORDER BY u.name, c.name;
```

The set of all possible pairs of two tables is their {{term:cartesian-product}}. Its row count is the **product** of the two tables' row counts: 12 customers × 5 categories is 60 rows; above, filtering down to the 2 Japanese customers leaves 2 × 5 = 10.

Recall the definition from the inner join lesson: an inner join is the Cartesian product with the pairs that fail `ON` filtered out. `CROSS JOIN` is that result before any filtering.

## Example {#example}

Task: a price list for the 3 books in the Books category, showing the total for 1, 2 and 3 copies.

1. **Work out how many rows there should be.** 3 books × 3 quantities = 9 rows. Estimating first and running second is the cheapest way to catch a join mistake.
2. **Find where the quantities come from.** No table in shop stores 1, 2 and 3. `generate_series(1, 3)` is a {{term:set-returning-function}}: it returns the rows 1, 2 and 3 as if it were a table, and can go straight into `FROM`.
3. **Combine with `CROSS JOIN`, then keep only Books with `WHERE`.**
4. **Compute the total.** Each row has a price and a quantity; multiply them.

```sql run
SELECT p.name, n.qty, p.price * n.qty AS total
FROM products AS p
CROSS JOIN generate_series(1, 3) AS n(qty)
WHERE p.category_id = 1
ORDER BY p.name, n.qty;
```

Nine rows, as estimated. `AS n(qty)` names the "table" `n` and its only column `qty`.

## Variations {#variants}

**A comma is a `CROSS JOIN`.** `FROM customers AS u, categories AS c` is identical to `FROM customers AS u CROSS JOIN categories AS c`:

```sql run
SELECT count(*) AS pairs
FROM customers AS u, categories AS c;
```

Sixty rows. That is why the inner join lesson warned that listing tables with commas and forgetting the join condition in `WHERE` gives a Cartesian product.

**Combining a table with itself.** `CROSS JOIN` works on one table too. Pair every two different categories into a joint promotion, each pair once, with the previous lesson's `a.id < b.id`:

```sql run
SELECT a.name AS first, b.name AS second
FROM categories AS a
CROSS JOIN categories AS b
WHERE a.id < b.id
ORDER BY a.id, b.id;
```

Five categories in pairs: 10 promotions.

**An explicit "no condition".** `JOIN … ON true` also gives the Cartesian product, since every pair satisfies `true`. It is less obvious at a glance than `CROSS JOIN`.

## Going deeper {#deeper}

**Row counts multiply fast.** Each extra table multiplies the row count by its own. The Cartesian product of three copies of `categories` is already 5 × 5 × 5 = 125 rows; for two production tables of a million rows each, it is a trillion.

**One missing join condition is one Cartesian product.** With three tables, forgetting one of the conditions is the classic slip. This query should attach the product and the order to each order line, but adds `orders` with a comma and no condition:

```sql run
SELECT count(*) AS lines
FROM products AS p
JOIN order_items AS i ON i.product_id = p.id, orders AS o;
```

1008 rows: 42 order lines × 24 orders. With the missing condition added, it is 42:

```sql run
SELECT count(*) AS lines
FROM products AS p
JOIN order_items AS i ON i.product_id = p.id
JOIN orders AS o ON o.id = i.order_id;
```

This is called {{term:row-explosion}}. When this course's grader sees your result is several times larger than expected, it tells you to check your join conditions.

**Joining on the wrong columns can inflate rows too.** `JOIN orders AS o ON o.customer_id = i.order_id` raises no error, since both are integers, but returns 48 rows instead of 42. It is far less dramatic than a missing condition, which makes it harder to notice.

**Other databases.** PostgreSQL requires every `JOIN` to have `ON` or `USING`; only `CROSS JOIN` may go without. MySQL and SQLite treat a `JOIN` without a condition as a `CROSS JOIN`, so a forgotten `ON` passes silently.

## Common mistakes {#mistakes}

**1. Joining with commas and leaving out one condition.** See Going deeper: three tables with conditions for only two, and the row count becomes a product. Write every table with `JOIN … ON`, each `ON` right next to its table, and a missing one stands out.

**2. Mixing commas and `JOIN`.**

```sql run error
SELECT count(*)
FROM orders AS o, order_items AS i
JOIN products AS p ON p.id = i.product_id AND o.id = i.order_id;
```

`JOIN` binds more tightly than the comma: it attaches to `order_items` first, and its `ON` cannot yet see `o`, which comes before the comma. Use `JOIN` throughout and this never happens.

**3. `CROSS JOIN` plus `WHERE` instead of an inner join.** `FROM orders CROSS JOIN customers WHERE customers.id = orders.customer_id` returns the inner join's rows, but the reader first sees "every combination" and has to find the condition later. When you mean "matching pairs", write `JOIN … ON`; write `CROSS JOIN` only when you really want every combination.

**4. Hiding row explosion with `DISTINCT`.** When a result is full of duplicates, `DISTINCT` can make it look normal, but the extra pairs are still there, and the next `sum` or `count` will be wrong. Find the join condition that is missing or wrong.

**5. Not estimating the row count.** Before running a join, estimate roughly how many rows it should return: for a one-to-many join, about the row count of the "many" side; for a Cartesian product, the product. If the result is far from your estimate, a join condition is wrong.

## Summary {#summary}

- `CROSS JOIN` returns every pairing of the two tables' rows, the Cartesian product; its row count is the product of theirs.
- `FROM a, b` equals `CROSS JOIN`; an inner join is the Cartesian product filtered by `ON`.
- Use `CROSS JOIN` only when you want every combination; a set-returning function such as `generate_series` can be used like a table in `FROM`.
- A missing or wrong join condition causes row explosion, which `DISTINCT` only hides.
- Estimating the row count before running is the simplest way to catch a join mistake.
