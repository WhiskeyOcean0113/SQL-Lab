## Why you need it {#why}

"Which customers have placed at least 3 orders?" The previous lesson counted each customer's orders; now you only want to keep those with enough of them. The natural first attempt puts the condition in `WHERE`:

```sql run error
SELECT customer_id, count(*) AS orders
FROM orders
WHERE count(*) >= 3
GROUP BY customer_id;
```

It fails. This lesson explains why, and where the condition belongs.

## Core idea {#core}

`WHERE` and `HAVING` both filter. They differ in **what they filter and when**:

| | Filters | Runs | Aggregates allowed? |
|---|---|---|---|
| `WHERE` | single rows | before grouping | no |
| `HAVING` | whole groups | after grouping and aggregation | yes |

In the {{term:logical-order}}:

`FROM` → `WHERE` → `GROUP BY` → **`HAVING`** → `SELECT` → `ORDER BY`

When `WHERE` runs, the rows are not grouped yet and `count(*)` has not been computed, so it cannot be used. `HAVING` runs after aggregation, when every group's totals exist:

```sql run
SELECT customer_id, count(*) AS orders
FROM orders
GROUP BY customer_id
HAVING count(*) >= 3
ORDER BY customer_id;
```

Three of the 10 groups qualify. `HAVING` removes whole groups, never individual rows inside a group.

## Example {#example}

Task: which categories have at least 2 products under 50 dollars?

1. **Separate the conditions.** There are two: "under 50 dollars" and "at least 2".
2. **Decide for each whether it is about a row or a group.** "Under 50 dollars" is a property of one product, decidable from one row, so it goes in `WHERE`. "At least 2" needs a count of the group first, so it goes in `HAVING`.
3. **Write them in execution order.** `WHERE` keeps the cheap products, then group by category, then `HAVING` keeps the groups with enough of them.

```sql run
SELECT category_id, count(*) AS cheap_products
FROM products
WHERE price < 50
GROUP BY category_id
HAVING count(*) >= 2
ORDER BY category_id;
```

Four categories. Electronics (id 2) is missing: it has 4 products, but only one of them, USB-C Hub, is under 50 dollars.

## Variations {#variants}

**An aggregate in `HAVING` need not appear in `SELECT`.** Which statuses involve at least 4 different customers? The result shows order counts but filters on customer counts:

```sql run
SELECT status, count(*) AS orders
FROM orders
GROUP BY status
HAVING count(DISTINCT customer_id) >= 4;
```

**With both `WHERE` and `HAVING`, `WHERE` changes what `HAVING` counts.** Customers with at least 3 orders, counting only orders that were not cancelled:

```sql run
SELECT customer_id, count(*) AS orders
FROM orders
WHERE status <> 'cancelled'
GROUP BY customer_id
HAVING count(*) >= 3
ORDER BY customer_id;
```

Customer 3 has dropped out compared with the core example: one of customer 3's 3 orders was cancelled, `WHERE` removed it first, and 2 are not enough.

**`HAVING` without `GROUP BY`.** The whole table is then one group, so the result is either one row or none:

```sql run
SELECT count(*) AS orders
FROM orders
HAVING count(*) > 100;
```

Zero rows. This does not contradict the rule from two lessons ago that an aggregate always gives one row: that row is computed, and then `HAVING` removes it.

## Going deeper {#deeper}

**`HAVING` cannot use an alias from `SELECT`.** Aliases come into being at the `SELECT` step, and `HAVING` runs before it:

```sql run error
SELECT customer_id, count(*) AS n
FROM orders
GROUP BY customer_id
HAVING n >= 3;
```

Repeat the aggregate instead: `HAVING count(*) >= 3`. MySQL accepts aliases in `HAVING`, so people who learned SQL there often trip over this; standard SQL and PostgreSQL do not.

**A condition that can go in `WHERE` should.** A condition on a grouping column gives the same result in `HAVING`, for example `HAVING customer_id <= 3`. But then the database groups every row and computes every aggregate before throwing most groups away. In `WHERE` the unwanted rows are excluded from the start, and the intent is clearer: `WHERE` is about rows, `HAVING` about groups.

**Plain columns in `HAVING` must be grouping columns too.** As in `SELECT`, after grouping each group is down to one row, and a column that is not grouped has many values in it.

## Common mistakes {#mistakes}

**1. An aggregate condition in `WHERE`.** See Why you need it: `WHERE count(*) >= 3` is an error. Conditions on totals go in `HAVING`.

**2. A single-row condition in `HAVING`.**

```sql run error
SELECT customer_id, count(*) AS orders
FROM orders
GROUP BY customer_id
HAVING status = 'delivered';
```

`status` is not a grouping column, so by the time `HAVING` runs it has many values per group. "Only count delivered orders" is about single rows and belongs in `WHERE`.

**3. An alias in `HAVING`.** See Going deeper: PostgreSQL reports `column "n" does not exist`.

**4. A missing `WHERE` that quietly changes the meaning.** "At least 3 orders that were not cancelled" needs `WHERE` to remove cancelled orders before grouping and counting. With only `HAVING count(*) >= 3`, cancelled orders are counted too, customer 3 sneaks in, and nothing reports an error. Before writing, ask: is this condition used before counting, or after?

## Summary {#summary}

- `WHERE` filters single rows before grouping and cannot use aggregates; `HAVING` filters whole groups after aggregation and can.
- The order is `FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY`.
- The test: a condition decidable from one row goes in `WHERE`; one that needs a group's totals goes in `HAVING`.
- `WHERE` changes which rows `HAVING` counts; `HAVING` cannot use `SELECT` aliases.
- Without `GROUP BY`, `HAVING` treats the whole table as one group, and the result can be zero rows.
