## Why you need it {#why}

Every month the owner looks at sales and asks the same two questions: is this month up or down on last month? And how much have we sold so far this year?

Monthly totals are Chapter 3 material. The hard part is "last month": each row of the result knows only its own month. Getting last month's figure onto the same row used to mean joining the monthly result to itself on "one month apart", which is roundabout and easy to get wrong. "Total so far" is no better: every row has to add up all the rows before it.

## Core idea {#core}

### Looking back and ahead: `lag` and `lead`

`lag(revenue)` takes `revenue` from the **previous row** of the window, and `lead(revenue)` from the **next row**. "Previous" and "next" are defined by the `ORDER BY` inside `OVER`:

```sql run
SELECT id, ordered_at,
       lag(id) OVER (ORDER BY ordered_at) AS prev_order,
       lead(id) OVER (ORDER BY ordered_at) AS next_order
FROM orders
ORDER BY ordered_at
LIMIT 4;
```

The first row has no previous row, so `lag` returns NULL; the last row has no next row, so `lead` returns NULL.

### Add `ORDER BY` and an aggregate accumulates

The previous lesson's `avg(price) OVER (PARTITION BY category_id)` computed one value for the whole partition. Add an `ORDER BY` inside `OVER` and the same aggregate becomes **cumulative**: each row sees only the rows from the start of the partition up to itself.

```sql run
SELECT id, ordered_at,
       count(*) OVER (ORDER BY ordered_at) AS orders_so_far
FROM orders
ORDER BY ordered_at
LIMIT 5;
```

### The {{term:window-frame}}

The stretch of rows that takes part in a row's calculation is its window frame. The frame moves with the current row:

- Without `ORDER BY`, the frame is **the whole partition**.
- With `ORDER BY`, the default frame runs **from the start of the partition to the current row**. That is why `sum` becomes a {{term:running-total}}.
- You can also set the frame yourself, for example "the two rows before through the current row", and an average over it is a {{term:moving-average}}.

`lag` and `lead` ignore the frame; they simply count positions backwards or forwards.

## Syntax {#syntax}

```syntax
lag(expression [, offset [, default ] ]) OVER ( window_definition )
lead(expression [, offset [, default ] ]) OVER ( window_definition )
aggregate_name ( expression ) OVER (
    [ PARTITION BY expression [, …] ]
    ORDER BY expression [ ASC | DESC ] [, …]
    [ { ROWS | RANGE } BETWEEN frame_start AND frame_end ]
)
```

`window_definition` is what went inside the brackets of `OVER` in the previous lesson: `PARTITION BY` and `ORDER BY`.

| Part | What goes there | Rule |
|---|---|---|
| `expression` | The value to fetch or summarise | Any expression, such as `revenue` or `ordered_at::date` |
| `offset` | How many rows back (`lag`) or ahead (`lead`) | Optional, 1 by default |
| `default` | What to return when there is no such row | Optional, NULL by default; writing `default` means writing `offset` too |
| `aggregate_name` | An aggregate such as `sum`, `avg`, `count`, `min` or `max` | With `ORDER BY`, computed over the frame |
| `ROWS` / `RANGE` | Whether the frame counts rows or `ORDER BY` values | Optional; without it, the frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` |
| `frame_start`, `frame_end` | Where the frame begins and ends | See the next table |

A frame starts and ends at one of:

| Written | Means |
|---|---|
| `UNBOUNDED PRECEDING` | The first row of the partition |
| `n PRECEDING` | n rows before the current row |
| `CURRENT ROW` | The current row |
| `n FOLLOWING` | n rows after the current row |
| `UNBOUNDED FOLLOWING` | The last row of the partition |

Some window functions, read against the shape:

- `lag(revenue) OVER (ORDER BY month)`: just the `expression`, with `offset` 1 and `default` NULL, taking the previous row by month.
- `lag(id, 1, 0) OVER (ORDER BY ordered_at)`: one row back, returning 0 when there is no previous row.
- `avg(orders) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW)`: a frame of the current row and the two before it, three rows in all.

## Example {#example}

The question: each month's revenue, last month's revenue, the change from last month, and the revenue to date. Cancelled orders do not count.

1. **Summarise by month first.** Put monthly revenue in a CTE called `monthly`, one row per month. The window functions work on top of it.
2. **Last month: `lag(revenue) OVER (ORDER BY month)`.** Order by month and take the previous row.
3. **Change: this month minus last month.** January has no last month, so `lag` is NULL and so is the difference.
4. **To date: `sum(revenue) OVER (ORDER BY month)`.** The default frame runs from the first month to the current one.

```sql run
WITH monthly AS (
  SELECT date_trunc('month', o.ordered_at)::date AS month,
         sum(i.quantity * i.unit_price) AS revenue
  FROM orders AS o
  JOIN order_items AS i ON i.order_id = o.id
  WHERE o.status <> 'cancelled'
  GROUP BY 1
)
SELECT month, revenue,
       lag(revenue) OVER (ORDER BY month) AS prev,
       revenue - lag(revenue) OVER (ORDER BY month) AS change,
       sum(revenue) OVER (ORDER BY month) AS running_total
FROM monthly
ORDER BY month;
```

February is 137.99 down on January, June 340.99 up on May, and the half-year total is 2687.95. The last running total equals the sum of all months, a handy check.

## Variations {#variants}

**A running total per customer: `PARTITION BY`.** Each order's total, and how much the customer had spent up to and including it:

```sql run
SELECT o.customer_id, o.id,
       sum(i.quantity * i.unit_price) AS total,
       sum(sum(i.quantity * i.unit_price))
         OVER (PARTITION BY o.customer_id ORDER BY o.ordered_at) AS running
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
WHERE o.customer_id IN (1, 2)
GROUP BY o.customer_id, o.id, o.ordered_at
ORDER BY o.customer_id, o.ordered_at;
```

`sum(sum(…)) OVER (…)` looks odd but has two layers: the inner `sum` is the `GROUP BY` aggregate giving each order's total; the outer `sum … OVER` is a window function adding those totals up after grouping. Because window functions run after `GROUP BY`, the nesting is allowed.

**Days until the next order: `lead`.**

```sql run
SELECT customer_id, id, ordered_at::date AS day,
       lead(ordered_at::date) OVER (PARTITION BY customer_id ORDER BY ordered_at)
         - ordered_at::date AS days_until_next
FROM orders
WHERE customer_id IN (1, 2)
ORDER BY customer_id, ordered_at;
```

Subtracting one `date` from another gives a number of days. Each customer's last order has no next one, so the result is NULL.

**A moving average: setting the frame.** The average number of orders over each month and the two before it:

```sql run
WITH monthly AS (
  SELECT date_trunc('month', ordered_at)::date AS month, count(*) AS orders
  FROM orders
  GROUP BY 1
)
SELECT month, orders,
       round(avg(orders) OVER (ORDER BY month ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), 2) AS avg_3m
FROM monthly
ORDER BY month;
```

January has no earlier months, so its frame is just itself; February's frame has two rows. Only from March is the frame a full three months.

**Month-on-month percentage.** The change divided by last month's value:

```sql run
WITH monthly AS (
  SELECT date_trunc('month', o.ordered_at)::date AS month,
         sum(i.quantity * i.unit_price) AS revenue
  FROM orders AS o
  JOIN order_items AS i ON i.order_id = o.id
  WHERE o.status <> 'cancelled'
  GROUP BY 1
)
SELECT month, revenue,
       round(100.0 * (revenue - lag(revenue) OVER (ORDER BY month))
             / lag(revenue) OVER (ORDER BY month), 1) AS pct_change
FROM monthly
ORDER BY month;
```

**Further back, and a default.** `lag(id, 2)` reaches two rows back; `lag(id, 1, 0)` returns 0 instead of NULL when there is no previous row:

```sql run
SELECT id, ordered_at,
       lag(id, 2) OVER (ORDER BY ordered_at) AS two_back,
       lag(id, 1, 0) OVER (ORDER BY ordered_at) AS prev_or_zero
FROM orders
ORDER BY ordered_at
LIMIT 4;
```

## Going deeper {#deeper}

**`RANGE` treats tied rows as one block.** The default frame is `RANGE … CURRENT ROW`, and it ends not at "this row" but at the last row with the same `ORDER BY` value as the current one. Rows sharing that value are {{term:peer-row|peer rows}}. A running total of item quantities by `order_id`:

```sql run
SELECT order_id, product_id, quantity,
       sum(quantity) OVER (ORDER BY order_id) AS by_order,
       sum(quantity) OVER (ORDER BY order_id, product_id) AS by_item
FROM order_items
WHERE order_id <= 4
ORDER BY order_id, product_id;
```

Order 3's three items share their `order_id`, so `by_order` takes them in all at once and shows 10 on all three rows. `by_item` orders by something that tells every row apart, so there are no peers and it adds one row at a time. For a row-by-row running total, make the `ORDER BY` unique, or write the frame as `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. With ties, though, `ROWS` alone leaves the order of the tied rows to chance, so the result is still not fixed.

**`first_value` and `last_value`.** These take the first and last row of the frame. `first_value` behaves as you would expect; `last_value` often surprises, because the default frame ends at the current row, which makes "the last row of the frame" the current row itself. See mistake 1.

**`GROUPS` and `EXCLUDE`.** Besides `ROWS` and `RANGE`, a frame can count in groups of peer rows (`GROUPS`), and `EXCLUDE CURRENT ROW` leaves the current row out. They are rarely needed; it is enough to know they exist.

**Other databases.** `lag`, `lead`, `first_value` and frames are standard SQL, supported since MySQL 8.0 and SQLite 3.25; `GROUPS` and `EXCLUDE` are less widely supported.

## Common mistakes {#mistakes}

**1. Using `last_value` for the last row of the partition.** To show the cheapest electronic product beside each one:

```sql run
SELECT name, price,
       last_value(name) OVER (ORDER BY price DESC) AS cheapest_wrong,
       last_value(name) OVER (ORDER BY price DESC
                              ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS cheapest
FROM products
WHERE category_id = 2
ORDER BY price DESC;
```

`cheapest_wrong` is each row's own name, because the default frame stops at the current row. Extend the frame to `UNBOUNDED FOLLOWING`, or flip the order and use `first_value(name) OVER (ORDER BY price)`.

**2. Forgetting `PARTITION BY`, so `lag` strays into someone else's rows.** To see customers 1 and 2 each with their previous order:

```sql run
SELECT customer_id, id,
       lag(id) OVER (ORDER BY ordered_at) AS prev
FROM orders
WHERE customer_id IN (1, 2)
ORDER BY customer_id, ordered_at;
```

The "previous order" of customer 1's order 4 is customer 2's order 2. Without a partition, all orders form one queue by time, and `lag` cares only about position, not whose order it is. Add `PARTITION BY customer_id`.

**3. `lag` in `WHERE`.**

```sql run error
SELECT id, ordered_at
FROM orders
WHERE lag(ordered_at) OVER (ORDER BY ordered_at) IS NOT NULL;
```

`window functions are not allowed in WHERE`, just as in the previous lesson: compute `lag` in a CTE, then filter outside.

**4. A running total that jumps several rows at once on ties.** The cause is `RANGE` and peer rows, as described in Going deeper. Before accumulating, check that the `ORDER BY` columns are unique.

**5. No `ORDER BY` inside `OVER`.** `lag(id) OVER ()` raises no error, but "previous" means previous in whatever order the database happened to produce, which means nothing. `sum(x) OVER (PARTITION BY …)` without `ORDER BY` is not a running total either, but the whole partition's sum.

## Summary {#summary}

- `lag` reaches earlier rows and `lead` later ones, in the order set by `ORDER BY` inside `OVER`; with no such row they return NULL or the given default.
- An aggregate with `OVER (ORDER BY …)` becomes cumulative, because the default frame runs from the start of the partition to the current row.
- A frame such as `ROWS BETWEEN n PRECEDING AND CURRENT ROW` gives a moving average.
- The default `RANGE` frame takes peer rows in together; for a row-by-row total, make `ORDER BY` unique.
- `last_value` needs a frame reaching `UNBOUNDED FOLLOWING`; per-group calculations need `PARTITION BY`.
