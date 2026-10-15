## Why you need it {#why}

Most subqueries in the last two lessons were computed once: "the average price of all products" is the same for every product. Many questions, though, compare against something that **changes from row to row**:

- Which products cost more than the average of **their own** category?
- When was **each customer's own** latest order?

The average for books differs from the average for electronics, and every customer's latest order is different. The subquery needs to know which outer row it is working for.

## Core idea {#core}

A {{term:correlated-subquery}} is a subquery that refers to a column of the {{term:outer-query}}. The last lesson's `EXISTS` already was one: in `o.customer_id = c.id` inside the subquery, `c` came from outside.

```sql run
SELECT p.name, p.category_id, p.price
FROM products AS p
WHERE p.price > (
  SELECT avg(p2.price)
  FROM products AS p2
  WHERE p2.category_id = p.category_id
)
ORDER BY p.category_id, p.price;
```

Logically, think of it like this: for each product `p` the outer query handles, `p.category_id` is plugged into the subquery, which computes that category's average, and then `p.price` is compared with it. The subquery is **recomputed for every row**, because it depends on the current row.

The two aliases `p` and `p2` are the key: two roles for one table, with `p` the product being judged and `p2` the products of the same category being averaged. It is the same idea as a self join.

Gift Card is missing from the result: its `category_id` is NULL, `p2.category_id = NULL` finds no rows, the average is NULL, and the comparison is unknown.

## Example {#example}

Task: which is each customer's most recent order?

1. **Write the answer for one particular customer first.** Customer 1's latest order time: `SELECT max(ordered_at) FROM orders WHERE customer_id = 1`.
2. **Replace the fixed 1 with the outer query's current row.** The outer query reads `orders AS o`, the subquery `orders AS o2`, and the condition becomes `o2.customer_id = o.customer_id`.
3. **Use it to filter the outer query.** Keep only the orders whose time equals "this customer's latest time".

```sql run
SELECT o.customer_id, o.id, o.ordered_at
FROM orders AS o
WHERE o.ordered_at = (
  SELECT max(o2.ordered_at)
  FROM orders AS o2
  WHERE o2.customer_id = o.customer_id
)
ORDER BY o.customer_id;
```

Ten rows, one per customer who has ordered. This is a classic problem, "the row with the greatest value in each group": `GROUP BY` can give the latest time but not that row's order id; a correlated subquery can.

Writing the fixed-value version first, checking it, and only then correlating it is the safest way to build a correlated subquery.

## Variations {#variants}

**In `SELECT`, one value per row.** Each customer's latest order time, NULL for customers who have never ordered:

```sql run
SELECT c.name,
       (SELECT max(o.ordered_at) FROM orders AS o WHERE o.customer_id = c.id) AS last_order
FROM customers AS c
ORDER BY c.id;
```

**Counting gives 0 naturally.** A correlated `count(*)` returns 0 for customers without orders, without chapter 4's `LEFT JOIN` plus `count(o.id)`:

```sql run
SELECT c.name,
       (SELECT count(*) FROM orders AS o WHERE o.customer_id = c.id) AS orders
FROM customers AS c
ORDER BY c.id;
```

**Showing the reference value alongside.** Each product with its category's average price:

```sql run
SELECT p.name, p.price,
       (SELECT round(avg(p2.price), 2) FROM products AS p2
        WHERE p2.category_id = p.category_id) AS category_avg
FROM products AS p
ORDER BY p.id;
```

## Going deeper {#deeper}

**Correlated subqueries can be rewritten as joins.** "Dearer than its category's average" can also be written by computing each category's average in a derived table and joining it. Both give the same result; the correlated form reads closer to the question, while the join with a derived table is often easier to optimise when there are many groups. PostgreSQL's optimiser rewrites some correlated subqueries into joins on its own, so "runs once per row" is a way to understand it, not necessarily how it is executed.

**A correlated subquery in `SELECT` must still return one value.** This subquery returns several rows for customers with several orders, which is an error:

```sql run error
SELECT c.name,
       (SELECT o.id FROM orders AS o WHERE o.customer_id = c.id) AS order_id
FROM customers AS c;
```

Either aggregate to one value (`max`, `count`) or use a join instead.

**`LATERAL`.** PostgreSQL and standard SQL also let a subquery in `FROM` refer to the tables to its left, written `JOIN LATERAL (…)` or `CROSS JOIN LATERAL (…)`. It works like a correlated subquery that can return several rows and columns, for example "each customer's latest 3 orders". For now it is enough to know it exists.

## Common mistakes {#mistakes}

**1. Forgetting to correlate, and comparing with everything.** With no reference to the outer query, `WHERE p.price > (SELECT avg(price) FROM products)` compares with the average of all products, not of the same category.

**2. No aliases, so the condition quietly becomes "itself equals itself".**

```sql run
SELECT p.name, p.price
FROM products AS p
WHERE p.price > (
  SELECT avg(price) FROM products WHERE category_id = category_id
);
```

Only 3 rows, the same as comparing with the overall average. Both `category_id`s inside the subquery refer to the **subquery's own** `products`, because the nearest table wins, and `category_id = category_id` holds for every row. Give the inner and outer `products` their own aliases and write `p2.category_id = p.category_id` explicitly.

**3. A correlated subquery in `SELECT` returning several rows.** See Going deeper: `more than one row returned by a subquery`.

**4. Expecting a correlated `sum` to give 0 for "none".** `count(*)` returns 0, but `sum` returns NULL. Use `COALESCE` when you need 0, as in chapter 3.

**5. Forgetting ties when taking the greatest row per group.** If a customer placed two orders at the same moment, `ordered_at = max(...)` returns both. That is not wrong, but know it can happen; when you need exactly one row, use chapter 6's window functions.

## Summary {#summary}

- A correlated subquery refers to the outer query's columns and is, logically, recomputed for each outer row.
- Two aliases tell apart the two roles of the same table, for example `p` and `p2`.
- It suits "compare with the same group", "the greatest row per group" and "one summary value per row".
- Without aliases, an unqualified column refers to the nearest table, and the correlation quietly becomes always true.
- Write the one-row answer with a fixed value first, then replace the fixed value with the outer column.
