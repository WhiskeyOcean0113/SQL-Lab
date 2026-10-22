## Why you need it {#why}

"How many orders has each customer placed?"

The {{term:aggregate-function|aggregate functions}} of the last lesson answer "how many in total": `count(*)` turns the 24 rows of `orders` into one number. For a single customer, you can first keep only their orders with `WHERE`:

```sql run
SELECT count(*) AS orders
FROM orders
WHERE customer_id = 1;
```

Customer 1 has placed 4. But 10 customers have ordered, so this way takes 10 queries that differ in one number, and you have to know the ids in advance. What you actually want is one query and one table: a row per customer, each carrying that customer's own count.

## Core idea {#core}

### Split into groups, then collapse each group into a row

`GROUP BY customer_id` does two things. It puts {{term:row|rows}} with the same `customer_id` into the same {{term:group}}. Then it collapses each group into a single output row, and the aggregate functions are computed separately within each group. Without `GROUP BY` the whole table is one group, which is why last lesson's aggregate queries always returned exactly one row. With it, you get one row per group.

Here are the orders of customers 1, 2 and 3 only, step by step:

```steps
- sql: |
    SELECT customer_id, id, status
    FROM orders
    WHERE customer_id IN (1, 2, 3)
    ORDER BY customer_id, id;
  say: The raw data first, 10 orders from 3 customers. Rows are tinted by `customer_id`, and rows of the same colour will end up in the same group.
  group: customer_id
- sql: |
    SELECT customer_id, count(*) AS orders
    FROM orders
    WHERE customer_id IN (1, 2, 3)
    GROUP BY customer_id
    ORDER BY customer_id;
  say: With `GROUP BY customer_id`, each colour collapses into one row. `count(*)` counts the rows in that group, so the counts are 4, 3 and 3.
  group: customer_id
- sql: |
    SELECT customer_id, status, count(*) AS orders
    FROM orders
    WHERE customer_id IN (1, 2, 3)
    GROUP BY customer_id, status
    ORDER BY customer_id, status;
  say: Add `status` to `GROUP BY` as well, and rows now share a group only when both the customer and the status match. Only customer 1's two delivered orders stay together, and the result grows to 9 rows.
  group: customer_id
```

### Every item needs one value per group

After collapsing, each group is a single row, so every item in `SELECT` must produce a single value. A {{term:grouping-column}} can: the groups were formed by it, so its value is the same throughout a group. An aggregate can too: turning many values into one is its whole job. So can any expression built from those two, such as `count(*) * 2`.

Any other column cannot. Customer 1's group holds 4 orders with the statuses delivered, delivered, shipped and pending, and the output row has room for one:

```sql run error
SELECT customer_id, status, count(*) AS orders
FROM orders
GROUP BY customer_id;
```

PostgreSQL stops with `column "orders.status" must appear in the GROUP BY clause or be used in an aggregate function`. It will not pick a value for you, because whichever it picked could be the wrong one.

### Grain: what one result row stands for

Steps two and three start from the same 10 rows and differ by one grouping column, yet their results mean different things. In step two a row is a customer; in step three a row is one status of one customer. What a single row of a result stands for is its {{term:grain}}, and the grouping columns set it: group by `customer_id` and you get one row per customer; group by `customer_id, status` and you get one row per customer-and-status combination.

So the first step in writing a grouped query is not SQL. It is a question: one row per *what*? If the question says "each customer", group by the customer, with no column more and no column less. One too many, and the groups are cut finer than the question asks. One too few, and rows that belong apart are merged. Either way the query runs perfectly well; it just answers a different question.

### Where it sits in the processing order

In the {{term:logical-order}}, `GROUP BY` comes after `WHERE` and before `SELECT`:

`FROM` → `WHERE` → `GROUP BY` → `SELECT` → `ORDER BY`

The rules above follow from this order. `WHERE` filters row by row first, and only the rows it keeps are grouped, so `WHERE customer_id IN (1, 2, 3)` decides which orders take part. `SELECT` is computed after grouping. By then it no longer sees individual orders, only groups, so it may only contain things that have one value per group.

```check
query: |
  SELECT status, count(*) AS orders
  FROM orders
  WHERE customer_id IN (1, 2, 3)
  GROUP BY status
  ORDER BY status;
question: The same 10 orders, grouped by `status` this time. What is `orders` in the delivered row?
choices: ['1', '3', '4', '10']
answer: 2
explain: A group is now a status, not a customer. The delivered group holds orders 1, 4, 2 and 3, two from customer 1 and one each from customers 2 and 3, so 4 rows. `count(*)` counts order rows, not customers, which is why it is not 3.
```

## Syntax {#syntax}

`GROUP BY` goes after `WHERE` and before `ORDER BY`, so the written order matches the logical one:

```syntax
SELECT select_list
FROM table_name
[ WHERE condition ]
[ GROUP BY grouping_element [, …] ]
[ ORDER BY expression [ ASC | DESC ] [, …] ]
```

| Placeholder | What goes there | Can it be left out? |
|---|---|---|
| `grouping_element` | A column, or an {{term:expression}} computed from columns | The whole `GROUP BY` can; then the whole table is one group |
| `[, …]` | More grouping elements, separated by commas | Yes; with several, rows are grouped by their combination |
| `select_list` | With `GROUP BY`, each item must be a grouping element, an aggregate, or an expression built from those | No |

A few clauses read against the shape:

- `GROUP BY status`: one grouping element, one group per status.
- `GROUP BY customer_id, status`: two grouping elements, one group per customer-and-status combination.
- `SELECT price >= 50 AS over_50, count(*) … GROUP BY price >= 50`: the grouping element is an expression, and `SELECT` uses the very same expression, so it follows the rule.

`string_agg`, which joins a group's text into one string, is an aggregate function too:

```syntax
string_agg(expression, delimiter [ ORDER BY expression [, …] ])
```

`delimiter` is what goes between the pieces, such as `', '`. The `ORDER BY` inside the parentheses sets the order of the pieces within a group; leave it out and that order is not guaranteed. It is separate from the `ORDER BY` at the end of the query, which sorts the result rows.

## Example {#example}

Task: how many items of each product have been sold, and how much revenue did each bring in? Highest revenue first.

1. **Settle the grain.** The question is about each product, so one result row is one product: group by `product_id`. The data is in `order_items`, where a row is one product in one order. The same product appears in several orders, and those rows are exactly what needs merging.
2. **Decide what to compute per group.** Items sold is the sum of the group's `quantity`. Revenue is the sum of `quantity * unit_price`: multiply on each row, then add up within the group.
3. **Check `SELECT`.** `product_id` is the grouping column and the other two items are aggregates, one value per group each. `quantity` and `unit_price` appear only inside aggregates, which is fine.
4. **Sort.** By revenue, highest first, then by product id on a tie so the result is the same every time.

```sql run
SELECT product_id,
       sum(quantity) AS units,
       sum(quantity * unit_price) AS revenue
FROM order_items
GROUP BY product_id
ORDER BY revenue DESC, product_id;
```

That is 15 rows, while shop has 16 products. The Folding Chair (product 16) has never been ordered, so it has no rows in `order_items` and therefore no group. `GROUP BY` groups the rows that exist; it never makes up an empty group.

```check
query: |
  SELECT product_id, count(*) AS lines, sum(quantity) AS units
  FROM order_items
  GROUP BY product_id
  ORDER BY product_id;
question: The Ceramic Mug (product 8) was bought in 4 orders, 2, 4, 6 and 1 at a time. How does it appear in the result?
choices:
  - One row, with lines 1 and units 13
  - One row, with lines 4 and units 4
  - One row, with lines 4 and units 13
  - Four rows, each with lines 1
answer: 2
explain: Grouping by `product_id` merges product 8's four order lines into one group, which yields one row. `count(*)` counts the rows in the group, so `lines` is 4; `sum(quantity)` adds 2, 4, 6 and 1, so `units` is 13. "How many order lines" and "how many items" are different questions.
```

## Variations {#variants}

### Grouping by a condition

A grouping element need not be a stored column. Any expression computed from columns will do. A true-or-false condition has two values, so it splits the rows into two groups. Products at 50 dollars or more against the rest, how many of each, and their average price:

```sql run
SELECT price >= 50 AS over_50,
       count(*) AS products,
       round(avg(price), 2) AS avg_price
FROM products
GROUP BY price >= 50;
```

`price >= 50` in `SELECT` is the same expression as in `GROUP BY`, so it has one value per group. A `CASE` expression gives you more than two bands; `extract(year FROM …)` gives you one group per year.

### Joining a group's text: `string_agg`

To see who is in each group, you cannot just select `name`: it has many values per group. `string_agg` joins those values into one string, which makes it one value again:

```sql run
SELECT country, string_agg(name, ', ' ORDER BY name) AS names
FROM customers
GROUP BY country
ORDER BY country;
```

China's `names` is `Chen Yu, Lin Wei, Zhang Min`: three customers in a single cell.

## Going deeper {#deeper}

### NULL forms a group of its own

Two customers have a NULL `city`. Grouped by `city`, they land in the same group:

```sql run
SELECT city, count(*) AS customers
FROM customers
GROUP BY city
ORDER BY city;
```

`NULL = NULL` is not true, but grouping treats all NULLs as one value, just as `DISTINCT` does. So NULLs are neither dropped nor given a group each; they form one "city unknown" group.

### Grouping does not sort

The order in which groups come out depends on how PostgreSQL chooses to run the query, and it can change when the data does. If you need an order, write `ORDER BY`.

### Grouping by a primary key

`id` is the {{term:primary-key}} of `customers`, so each `id` is exactly one row, and when you group by it, `name` also has one value per group. PostgreSQL recognises this {{term:functional-dependency}} and lets you select the column directly:

```sql run
SELECT id, name, country
FROM customers
GROUP BY id
ORDER BY id;
```

Only the primary key counts. Group by `name` and select `country`, and you still get the error, even though no two names happen to be the same today.

## Common mistakes {#mistakes}

The hardest grouping mistakes to spot raise no error. One grouping column too many or too few, and the query runs as normal while answering a different question. Studies of novice SQL find these among the most frequent and most persistent errors.

**1. Selecting a column with several values per group.** You want each customer's latest order time and the status of that order:

```sql run error
SELECT customer_id, max(ordered_at) AS last_order, status
FROM orders
GROUP BY customer_id;
```

`max(ordered_at)` gives one time but does not say which row it came from, and `status` has several values in the group. The fix depends on what you need. If you do not need the column, drop it; if you need all of the group's values, join them with `string_agg`.

**2. Adding the column to `GROUP BY` to silence the error.** The error says `status` must appear in the GROUP BY clause, and doing just that makes the query run:

```sql run
SELECT customer_id, max(ordered_at) AS last_order, status
FROM orders
GROUP BY customer_id, status
ORDER BY customer_id;
```

But a group is now one status of one customer. The result has 23 rows, customer 1 appears three times, and `last_order` has become "the latest order with this status". The error message knows how to make a query legal, not what you meant to ask. Go back to the question: one row per what? A column that does not belong to that grain should be dropped or aggregated, not added to `GROUP BY`.

**3. Leaving a grouping column out.** The question is "how many orders per month and per status", but the query groups by month only:

```sql
SELECT date_trunc('month', ordered_at) AS month, count(*) AS orders
FROM orders
GROUP BY date_trunc('month', ordered_at);
```

It runs, but each month's statuses are merged into one number. Two "per"s in the question mean two grouping elements in `GROUP BY`, and `status` in `SELECT` as well.

**4. Selecting an expression but grouping by the raw column.** You want products counted by launch year:

```sql run
SELECT extract(year FROM launched_on) AS launch_year, count(*) AS products
FROM products
GROUP BY launched_on
ORDER BY launch_year;
```

There is no error, because `extract(year FROM launched_on)` is computed from the grouping column and so has one value per group. But the groups are full dates, and all 16 products launched on different days, so you get 16 rows, each year repeated, each count 1. To count by year, put the same `extract` expression in `GROUP BY`.

**5. Expecting grouped results to come out sorted.** Grouping decides which rows belong together, not which comes first. When a question asks for an order, the `ORDER BY` has to be there, sorting in the direction the question asks.

## Summary {#summary}

- `GROUP BY` puts rows with the same values in the grouping columns into one group; each group yields one row, and aggregates are computed per group.
- After grouping, every item in `SELECT` must have one value per group: a grouping column, an aggregate, or an expression built from them.
- The grouping columns set the grain of the result. Answer "one row per what?" before writing `GROUP BY`, and never add a grouping column just to silence an error.
- When grouping by an expression, use the same expression in `SELECT`. NULL forms a group of its own. For an order, write `ORDER BY`.

## Reference {#reference}

### Subtotals and totals: `ROLLUP`

```sql run
SELECT status, count(*) AS orders
FROM orders
GROUP BY ROLLUP (status)
ORDER BY status;
```

Besides one row per status, `ROLLUP` adds a total row whose `status` is NULL and whose `orders` is 24. That NULL means "all statuses", not "status unknown"; if the grouping column contains NULLs of its own, the two kinds of row look the same in the result. `ROLLUP (a, b)` summarises by `(a, b)`, then by `(a)`, then over everything. Its relatives are `CUBE` (every combination) and `GROUPING SETS` (you list the groupings you want), all standard SQL. MySQL writes `GROUP BY status WITH ROLLUP`; SQLite has none of these.

### Aliases and positions

PostgreSQL lets `GROUP BY` name an output column's {{term:alias}} (`GROUP BY launch_year`) or its position in `SELECT` (`GROUP BY 1`). Both are PostgreSQL extensions: in standard SQL, `GROUP BY` takes only table columns and expressions built from them. When an alias has the same name as a table column, `GROUP BY` takes the table column, the opposite of what `ORDER BY` does. Positions silently point at a different column once you add or remove a `SELECT` item, so they are best avoided.

### Other databases

PostgreSQL rejects a `SELECT` item with several values per group. SQLite runs the query and takes the value from some row of the group (with `max` or `min`, the row holding the extreme value); MySQL does much the same with `ONLY_FULL_GROUP_BY` switched off. Such queries run, but their results cannot be relied on. The SQL standard also recognises more functional dependencies than primary keys; PostgreSQL currently recognises only primary keys.
