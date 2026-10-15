## Why you need it {#why}

"How much has each customer spent?" The answer is spread across three tables: names in `customers`, who owns each order in `orders`, and what each line bought for how much in `order_items`.

Chapter 3's aggregates summarise one table; this chapter's joins stitch tables together. This lesson combines the two: **join first, then group and summarise**. Joins change row counts easily, so this is also where most of the traps are.

## Core idea {#core}

In the {{term:logical-order}}, joins come first and aggregation later:

`FROM` + `JOIN` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY`

So the database first builds one wide table from the joined tables, `WHERE` removes unwanted rows, and only then does grouping start. **What you summarise are the joined rows**, not the rows of any one original table.

```sql run
SELECT c.name, sum(i.quantity * i.unit_price) AS spent
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
JOIN order_items AS i ON i.order_id = o.id
WHERE o.status <> 'cancelled'
GROUP BY c.id, c.name
ORDER BY spent DESC;
```

After the joins, each row is "one line of one order of one customer"; grouping by customer adds up the value of each group's lines.

Why group by `c.id, c.name` rather than `c.name` alone? Names can repeat; primary keys cannot. Chapter 3 showed that PostgreSQL lets you select a table's other columns once you group by its primary key; writing `c.name` into `GROUP BY` as well works in every database.

## Example {#example}

Task: how many orders has each customer placed? Customers who never ordered must appear too, with 0.

1. **Keep every customer.** Use the previous lessons' `LEFT JOIN orders`.
2. **Group by customer.** `GROUP BY c.id, c.name`.
3. **Count the right thing.** After the join, a customer who never ordered still has **one row**, with NULL on the orders side. `count(*)` counts that row as 1; `count(o.id)` skips NULL and gives 0.

```sql run
SELECT c.name, count(o.id) AS orders, count(*) AS rows_in_group
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
GROUP BY c.id, c.name
ORDER BY c.id;
```

Look at the last two rows: Lucas Silva and Mei Tanaka have 0 `orders` but 1 `rows_in_group`. When counting after an outer join, count a column of the right table that is never NULL in a real match, usually its primary key.

## Variations {#variants}

**Each order's total, including orders with no lines.** Order 24 has no lines yet. `LEFT JOIN` keeps it, and `COALESCE` turns the empty sum into 0:

```sql run
SELECT o.id, COALESCE(sum(i.quantity * i.unit_price), 0) AS total
FROM orders AS o
LEFT JOIN order_items AS i ON i.order_id = o.id
WHERE o.status = 'pending'
GROUP BY o.id
ORDER BY o.id;
```

**Sales by category.** Lines join to products, products to categories. Gift Card has no category; `LEFT JOIN categories` keeps its sales, which form a group with a NULL category:

```sql run
SELECT cat.name AS category, sum(i.quantity * i.unit_price) AS revenue
FROM order_items AS i
JOIN products AS p ON p.id = i.product_id
LEFT JOIN categories AS cat ON cat.id = p.category_id
GROUP BY cat.id, cat.name
ORDER BY revenue DESC;
```

**Orders and revenue per country at once.** Revenue adds up every line, but the order count must not count lines; it needs `count(DISTINCT o.id)`:

```sql run
SELECT c.country, count(DISTINCT o.id) AS orders,
       sum(i.quantity * i.unit_price) AS revenue
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
JOIN order_items AS i ON i.order_id = o.id
GROUP BY c.country
ORDER BY revenue DESC;
```

## Going deeper {#deeper}

**A join multiplies the "one" side.** An order has several lines, so after joining `order_items` the order appears several times. Count orders now, and you are really counting lines:

```sql run
SELECT c.name, count(*) AS line_rows, count(DISTINCT o.id) AS orders
FROM customers AS c
JOIN orders AS o ON o.customer_id = c.id
JOIN order_items AS i ON i.order_id = o.id
GROUP BY c.id, c.name
ORDER BY c.id;
```

Lin Wei has 4 orders and 10 lines, so `count(*)` is 10. Note that Kenji Sato shows 2 orders, not 3: order 24 has no lines and the inner join dropped it.

**Two independent one-to-many joins multiply each other.** Join a referrer to their own orders and to the customers they referred at the same time:

```sql run
SELECT r.name, count(*) AS rows_in_group,
       count(DISTINCT o.id) AS orders, count(DISTINCT c.id) AS referrals
FROM customers AS r
JOIN orders AS o ON o.customer_id = r.id
JOIN customers AS c ON c.referred_by = r.id
GROUP BY r.id, r.name
ORDER BY r.id;
```

Lin Wei's 4 orders and 2 referrals have nothing to do with each other, yet the join pairs every order with every referral: 4 × 2 = 8 rows. Data modelling calls this a {{term:fan-trap}}. `count(DISTINCT …)` rescues the counts but not a `sum`: summing a value stored once per order, such as a shipping fee, would add each of Lin Wei's orders twice. The reliable fix is to summarise each one-to-many path separately and join the summaries, which needs chapter 5's subqueries.

**With an outer join, conditions still go in `ON`.** To count each customer's delivered orders and keep the customers with 0, the condition goes in `ON`; in `WHERE`, customers without a delivered order vanish entirely, for the reason the outer join lesson gave.

## Common mistakes {#mistakes}

**1. `count(*)` after an outer join.** Customers who never ordered show 1 instead of 0. Count the right table's primary key: `count(o.id)`.

**2. Counting with the old meaning after a join has multiplied the rows.** Once lines are joined, `count(*)` counts lines. To count orders use `count(DISTINCT o.id)`; for a correct `sum`, make sure the column being added has not been repeated.

**3. Filtering the right table in `WHERE` and losing the zero rows.**

```sql run
SELECT c.name, count(o.id) AS delivered
FROM customers AS c
LEFT JOIN orders AS o ON o.customer_id = c.id
WHERE o.status = 'delivered'
GROUP BY c.id, c.name;
```

Ten rows; Lucas Silva and Mei Tanaka are gone. Move `o.status = 'delivered'` into `ON` and there are 12.

**4. Grouping by name only.** Two customers with the same name would merge into one group and their numbers would quietly add up. Group by the primary key, and add the columns you want to show to `GROUP BY`.

**5. An inner join quietly dropping the "none" rows.** Counting orders through their lines loses order 24, which has none; counting customers through their orders loses customers who never ordered. When a question says "every" or "including those with none", use `LEFT JOIN`.

## Summary {#summary}

- Joins happen before grouping: you summarise the joined rows.
- Group by the primary key of the thing you report on, for example `GROUP BY c.id, c.name`.
- After an outer join, count the right table's primary key so that `count(o.id)` can show 0; conditions on the right table go in `ON`.
- A join multiplies the rows of the "one" side; count orders with `count(DISTINCT o.id)`.
- Two independent one-to-many joins multiply each other, the fan trap; summarise them separately.
