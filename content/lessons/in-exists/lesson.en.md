## Why you need it {#why}

"Which customers have a delivered order?" Written with a chapter 4 join:

```sql run
SELECT c.name
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
WHERE o.status = 'delivered'
ORDER BY c.id;
```

Eleven rows, with Lin Wei twice, because Lin Wei has two delivered orders. The question asks "which customers", though, so each customer should appear once. What you want is not a pairing but a test: **is this customer on that list?**

## Core idea {#core}

`IN` takes a subquery returning one column and tests whether the value on its left appears in that column:

```sql run
SELECT name
FROM customers
WHERE id IN (SELECT customer_id FROM orders WHERE status = 'delivered')
ORDER BY id;
```

Ten rows, each customer once. The subquery returns a set of customer ids, with 1 in it twice, but `IN` only cares whether a value is there, not how often.

This effect, keeping only the rows that have a match in another table and keeping each of them once, is a {{term:semi-join}}. It is the same `IN` as chapter 1's `IN (1, 2, 3)`, with the list of values replaced by a subquery.

`EXISTS` makes the same kind of test with a different question: **does the subquery return any row at all?**

```sql run
SELECT name
FROM customers AS c
WHERE EXISTS (
  SELECT 1
  FROM orders AS o
  WHERE o.customer_id = c.id AND o.status = 'cancelled'
);
```

For each customer, the subquery looks for that customer's cancelled orders; if it finds at least one row, `EXISTS` is true. Note that `c.id` inside the subquery comes from the outer query: the subquery refers to an outer column, and the next lesson is about such correlated subqueries. `SELECT 1` is just a convention; `EXISTS` checks whether rows exist, not what they contain.

## Syntax {#syntax}

All three conditions use a subquery as "a set of values" or as "are there any rows". Each is a `condition`: it goes in `WHERE` and combines with other conditions:

```syntax
expression [ NOT ] IN ( select_statement )
[ NOT ] EXISTS ( select_statement )
expression comparison_operator { ANY | ALL } ( select_statement )
```

| Shape | The subquery must return | True when |
|---|---|---|
| `x IN (…)` | One column, any number of rows | `x` equals one of the values |
| `x NOT IN (…)` | One column | `x` differs from every value; never true once the subquery holds a NULL |
| `EXISTS (…)` | Any columns; what is selected does not matter | The subquery returns at least one row |
| `NOT EXISTS (…)` | As above | The subquery returns no rows |
| `x > ANY (…)` | One column | `x` is greater than at least one value |
| `x > ALL (…)` | One column | `x` is greater than every value |

`comparison_operator` can be any comparison: `= ANY` is the same as `IN`, and `<> ALL` the same as `NOT IN`.

Compare Chapter 1's `IN ( value [, …] )`: the shape is identical, except that a query has taken the place of the value list.

Some conditions, read against the shapes:

- `id IN (SELECT customer_id FROM orders WHERE status = 'delivered')`: the first line, with a subquery returning one column of customer ids.
- `EXISTS (SELECT 1 FROM orders AS o WHERE o.customer_id = c.id AND …)`: the second line, with a subquery referring to the outer `c.id`.
- `price > ALL (SELECT price FROM products WHERE category_id = 1)`: the third line, operator `>`, `ALL` chosen.

## Example {#example}

Task: which products has Kenji Sato (customer 3) bought? List each product once.

1. **Find the list first.** The product ids in Kenji Sato's orders: join `order_items` to `orders`, filter on `o.customer_id = 3`, select `product_id`.
2. **Run it on its own and look at its shape.** One column, possibly with repeats.
3. **Put it inside `IN`.** The outer query reads `products`, `WHERE id IN (…)`.

```sql run
SELECT name
FROM products
WHERE id IN (
  SELECT i.product_id
  FROM order_items AS i
  JOIN orders AS o ON o.id = i.order_id
  WHERE o.customer_id = 3
);
```

Four products. Even a product bought twice would appear once, because each outer product is tested only once.

## Variations {#variants}

**`NOT IN` and `NOT EXISTS`: not on the list.** Customers who have never ordered:

```sql run
SELECT name
FROM customers
WHERE id NOT IN (SELECT customer_id FROM orders);
```

Products that have never sold, with `NOT EXISTS`:

```sql run
SELECT name
FROM products AS p
WHERE NOT EXISTS (
  SELECT 1 FROM order_items AS i WHERE i.product_id = p.id
);
```

Both mean the same as chapter 4's "left join plus `IS NULL`" anti-join; pick whichever reads most clearly.

**`ALL` and `ANY`: comparing with each value of a set.** Products dearer than every book in Books:

```sql run
SELECT name, price
FROM products
WHERE price > ALL (SELECT price FROM products WHERE category_id = 1)
ORDER BY price;
```

`> ALL` requires being greater than every value, that is, greater than the largest; `> ANY` only than at least one. `= ANY` is exactly `IN`.

## Going deeper {#deeper}

**`NOT IN` returns nothing once NULL is involved.** Which customers have never referred anyone? `referred_by` holds referrer ids, so this looks natural:

```sql run
SELECT name
FROM customers
WHERE id NOT IN (SELECT referred_by FROM customers);
```

Zero rows, although 7 customers have referred nobody. The reason is in the NULL lesson: `referred_by` contains NULLs. `x NOT IN (1, 2, NULL)` means `x <> 1 AND x <> 2 AND x <> NULL`, and the last part is always unknown, so the whole condition can never be true.

```sql run
SELECT 2 IN (1, NULL) AS in_result, 2 NOT IN (1, NULL) AS not_in_result;
```

Both are NULL, that is, unknown.

`NOT EXISTS` does not have this problem, because it only asks whether rows exist:

```sql run
SELECT name
FROM customers AS c
WHERE NOT EXISTS (
  SELECT 1 FROM customers AS x WHERE x.referred_by = c.id
)
ORDER BY c.id;
```

Seven rows. The rule: **when the subquery's column can contain NULL, use `NOT EXISTS`, or add `WHERE column IS NOT NULL` inside the subquery.** In the variation above, `orders.customer_id` is declared `NOT NULL`, so that `NOT IN` is safe.

**The difference between `IN` and a join is duplication.** A join repeats the "one" side of a one-to-many relationship; `IN` and `EXISTS` do not, so each outer row appears at most once. Use a join when you need columns from the other table, and `IN` or `EXISTS` when you only need to know whether a match exists.

**`ALL` with an empty subquery.** When the subquery returns no rows, `> ALL` is true for every row and `> ANY` false for every row:

```sql run
SELECT count(*) AS products
FROM products
WHERE price > ALL (SELECT price FROM products WHERE category_id = 99);
```

All 16 rows pass: there is no category 99, so "dearer than every one of them" has no counterexample. That is logically sound but easily surprising: when the subquery's condition is wrong, `ALL` makes the outer query return everything.

**`IN` works on several columns too.** `(a, b) IN (SELECT x, y …)` compares whole rows: a match needs both columns equal.

## Common mistakes {#mistakes}

**1. `NOT IN` on a column that can contain NULL.** See Going deeper: the result quietly becomes empty, with no error. It is one of the most dangerous subquery mistakes.

**2. Answering "is there one" with a join, and getting duplicates.** See Why you need it: a customer with two delivered orders appears twice. `DISTINCT` would remove the repeats, but `IN` or `EXISTS` expresses the question directly.

**3. An `IN` subquery that selects several columns.** `WHERE id IN (SELECT customer_id, status FROM orders)` fails with `subquery has too many columns`: one value on the left, two per row on the right, nothing to compare. Select only the column you are comparing.

**4. An `EXISTS` subquery that is not linked to the outer query.** `WHERE EXISTS (SELECT 1 FROM orders WHERE status = 'cancelled')` asks, whichever customer is being tested, "does `orders` contain any cancelled order at all". The answer is always true, so every customer comes back. The subquery must contain a condition referring to the outer query, such as `o.customer_id = c.id`.

**5. `=` instead of `IN`.** When the subquery returns several rows, `=` fails with `more than one row returned by a subquery`, as the previous lesson showed.

## Summary {#summary}

- `x IN (subquery)` tests whether `x` appears in the column the subquery returns; `EXISTS (subquery)` tests whether the subquery returns at least one row.
- Both are semi-joins: each outer row appears at most once, never repeated as in a join.
- `NOT IN` returns nothing when the subquery yields a NULL; use `NOT EXISTS`, or exclude the NULLs first.
- An `EXISTS` subquery must refer to the outer query, or it gives every row the same answer.
- `> ALL` means greater than every value, `> ANY` greater than at least one, and `= ANY` equals `IN`.
