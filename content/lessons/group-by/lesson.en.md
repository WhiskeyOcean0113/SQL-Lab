## Why you need it {#why}

"How many orders are there in each status?" The previous lesson's aggregates give one total only. To count separately, you would need one query per status:

```sql run
SELECT count(*) AS orders
FROM orders
WHERE status = 'delivered';
```

With 5 statuses that is 5 queries, and you would have to know the statuses in advance. What you actually want is **one row per status**, each carrying its own count.

## Core idea {#core}

`GROUP BY` first splits the rows into {{term:group|groups}} by the values of some columns: rows with equal values go into the same group. The aggregates are then **computed separately within each group**, and each group produces one row.

```sql run
SELECT status, count(*) AS orders
FROM orders
GROUP BY status;
```

The 24 orders fall into 5 groups, so the result has 5 rows. The columns after `GROUP BY` are the {{term:grouping-column|grouping columns}}.

In the {{term:logical-order}}, `GROUP BY` comes after `WHERE` and before `SELECT`:

`FROM` → `WHERE` → **`GROUP BY`** → `SELECT` → `ORDER BY`

That gives a hard rule: **after grouping, each group is down to one row, so every column in `SELECT` is either a grouping column or inside an aggregate.** A grouping column has the same value throughout its group and can be output directly; any other column has many values in the group and can only be summarised into one.

## Example {#example}

Task: how many orders has each customer placed, and when was their first? Busiest customers first.

1. **Decide "one row per what".** Per customer, so group by `customer_id`.
2. **What to compute in each group?** The number of orders, `count(*)`, and the earliest order time, `min(ordered_at)`.
3. **Check `SELECT`.** `customer_id` is the grouping column and the other two are aggregates, so the rule holds.
4. **Sort.** By order count, highest first; ties by customer id, so the order is stable.

```sql run
SELECT customer_id, count(*) AS orders, min(ordered_at) AS first_order
FROM orders
GROUP BY customer_id
ORDER BY orders DESC, customer_id;
```

Ten rows, because the 24 orders come from 10 customers. Customer 1 placed the most, 4.

## Variations {#variants}

**Grouping by several columns.** With several grouping columns, rows go into the same group only when the **combination** matches:

```sql run
SELECT country, city, count(*) AS customers
FROM customers
GROUP BY country, city
ORDER BY country, city;
```

Nine groups, the same as the rows of `SELECT DISTINCT country, city`. Without aggregates, `GROUP BY` has the effect of removing duplicates.

**Grouping by an expression.** Chapter 2's `date_trunc` cuts order times down to the month, which counts orders per month:

```sql run
SELECT date_trunc('month', ordered_at) AS month, count(*) AS orders
FROM orders
GROUP BY date_trunc('month', ordered_at)
ORDER BY month;
```

**Joining a group's text: `string_agg`.** Another aggregate: it joins the group's values into one string with a separator:

```sql run
SELECT category_id, string_agg(name, ', ' ORDER BY name) AS products
FROM products
GROUP BY category_id
ORDER BY category_id;
```

## Going deeper {#deeper}

**NULL forms its own group.** In the last example, Gift Card, which has no category, gets a group of its own with NULL as the grouping value. As with `DISTINCT`, all NULLs count as one value when grouping.

**`GROUP BY` does not guarantee an order.** The order groups come out in depends on how the database happens to execute the query:

```sql run
SELECT country, count(*) AS customers
FROM customers
GROUP BY country;
```

If you need an order, write `ORDER BY`. Older versions of MySQL used to sort grouped results as a side effect, and many people came to rely on it.

**Grouping by the primary key lets you select the table's other columns.** A primary key identifies one row, so when grouping by `id` each group holds one row and `name` has only one value. PostgreSQL recognises this {{term:functional-dependency}}:

```sql run
SELECT id, name, country
FROM customers
GROUP BY id
ORDER BY id;
```

This becomes useful in chapter 4, when customers are joined to orders and counted. It only works for the primary key, though: grouping by `name` and selecting `country` is still an error.

**PostgreSQL shorthands.** `GROUP BY` accepts an output column's alias (`GROUP BY month`) or its position (`GROUP BY 1`). Neither is standard SQL, and positions silently break when columns are added or removed, so avoid them.

## Common mistakes {#mistakes}

These are the grouping errors research finds most often, and the hardest for learners to spot on their own.

**1. A column in `SELECT` that is neither grouped nor aggregated.**

```sql run error
SELECT customer_id, status, count(*) AS orders
FROM orders
GROUP BY customer_id;
```

Customer 1 has 4 orders with different statuses; which `status` should that group show? The database cannot decide.

**2. Adding a column to `GROUP BY` to make the error go away.** Following the error message and adding `status` makes the query run, but changes its meaning:

```sql run
SELECT customer_id, status, count(*) AS orders
FROM orders
GROUP BY customer_id, status
ORDER BY customer_id;
```

Each group is now "one status of one customer", 23 rows, no longer one row per customer. The right fix is usually to remove the extra column from `SELECT`, not to add it to `GROUP BY`. One grouping column too many or too few, and the result has the wrong grain.

**3. Expecting grouped results to be sorted.** See Going deeper: for an order, write `ORDER BY`.

**4. `count(*)` when counting distinct things.** "How many customers are behind each status" needs `count(DISTINCT customer_id)`; `count(*)` counts order rows. Delivered has 11 orders but only 10 customers.

## Summary {#summary}

- `GROUP BY` puts rows with equal grouping values into one group; aggregates are computed per group, and each group yields one row.
- After grouping, every `SELECT` column is either a grouping column or inside an aggregate.
- Several grouping columns group by their combination; you can also group by an expression.
- NULL forms its own group; grouping does not guarantee order, so sort with `ORDER BY`.
- When a grouping error appears, first decide "one row per what"; do not add grouping columns just to silence it.
