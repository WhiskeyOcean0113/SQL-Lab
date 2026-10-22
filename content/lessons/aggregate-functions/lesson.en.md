## Why you need it {#why}

"How many items has shop sold altogether?"

The answer is in `order_items`: each row is one product in one order, and `quantity` says how many of it were bought. With the SQL you know so far, though, all you can do is list those rows:

```sql run
SELECT order_id, product_id, quantity
FROM order_items;
```

Forty-two rows, one number each, and adding them up is left to you. Every query so far has been one row in, one row out: `WHERE` can drop rows and a function such as `round()` can rewrite each row's values, but nothing yet turns many rows into one answer.

## Core idea {#core}

That is what an {{term:aggregate-function}} does: it reads many rows, takes one value from each, and hands back a single value. `sum(quantity)` adds up `quantity` across all the rows, `count(*)` counts the rows, and `avg`, `min` and `max` give the average, the smallest and the largest value.

Set beside the functions of chapter 2, the difference is plain. `round(price)` works once per row: 16 rows in, 16 rows out. `max(price)` compares all 16 prices together and returns one value. The first is a calculation per row; the second is {{term:aggregation}}.

Here, step by step, is how the three lines of order 3 collapse into one row:

```steps
- sql: |
    SELECT order_id, product_id, quantity, unit_price
    FROM order_items
    WHERE order_id = 3;
  say: "`FROM` produces every order line and `WHERE` keeps the three that belong to order 3. These three rows are the input to be summarised."
- sql: |
    SELECT quantity, unit_price, quantity * unit_price AS line_total
    FROM order_items
    WHERE order_id = 3;
  say: "The {{term:expression}} `quantity * unit_price` is worked out once per row, giving each line's value. This is still per-row work: three rows in, three rows out."
- sql: |
    SELECT sum(quantity * unit_price) AS order_total
    FROM order_items
    WHERE order_id = 3;
  say: "`sum` adds the three values 39.98, 28.50 and 28.00 into 96.48. Three rows in, one row out."
- sql: |
    SELECT count(*) AS lines, sum(quantity) AS units,
           sum(quantity * unit_price) AS order_total, max(unit_price) AS dearest
    FROM order_items
    WHERE order_id = 3;
  say: "One `SELECT` can hold several {{term:aggregate-function|aggregate functions}}. They all summarise the same rows, so there is still one row, with one summary value per column."
```

In the {{term:logical-order}}: `FROM` produces rows, `WHERE` tests them one at a time and drops the ones you do not want, the rows that are left go to the aggregate functions together, and `SELECT` outputs the summaries. `WHERE` runs before anything is summarised, so it decides which rows get summarised.

Because there is only one row, one rule follows: **after aggregating, `SELECT` can hold only summary values**, or expressions computed from them. Suppose you added `product_id` to the last step. The three lines have three different `product_id` values and the result has one row, so which one goes in it? Rather than pick one for you at random, the database reports an error.

With nothing at all to summarise, the result is still one row. Order 24 has no lines:

```sql run
SELECT count(*) AS lines, sum(quantity) AS units
FROM order_items
WHERE order_id = 24;
```

`count(*)` counted zero rows and returns 0. `sum` had no value to add and returns NULL, which means "there is no answer", not "the answer is 0". `avg`, `min` and `max` behave the same way: with no values to compare, there is no largest one.

```check
query: |
  SELECT count(*) AS lines, sum(quantity) AS units
  FROM order_items
  WHERE product_id = 8;
question: Ceramic Mug (product 8) appears on 4 order lines, with quantities 2, 4, 6 and 1. What does this query return?
choices:
  - 4 rows, one per `quantity`
  - "1 row: `lines` is 4 and `units` is 13"
  - "1 row: `lines` is 13 and `units` is 13"
  - "1 row: `lines` is 4 and `units` is 4"
answer: 1
explain: Both aggregates summarise the same 4 rows. `count(*)` counts them, giving 4; `sum(quantity)` adds the quantities, 2 + 4 + 6 + 1 = 13. The result is a single row.
verify: { rows: 1 }
```

## Syntax {#syntax}

In this lesson's queries, every item in the {{term:select-list}} is an aggregate expression:

```syntax
SELECT aggregate_expression [ AS output_name ] [, …]
FROM table_name
[ WHERE condition ]
```

An `aggregate_expression` is an aggregate call, or an expression built from aggregate calls and constants. The aggregates in this lesson:

```syntax
count(*)
count([ DISTINCT ] expression)
sum(expression)
avg(expression)
min(expression)
max(expression)
bool_and(expression)
bool_or(expression)
```

| Part | What goes there | Optional? |
|---|---|---|
| `aggregate_expression` | For example `count(*)`, `round(avg(price), 2)`, `max(price) - min(price)` | No; at least one |
| `*` | Only inside `count`; it means "count rows" and looks at no column | Not in `count(*)` |
| `expression` | A column, or anything that gives one value per row, such as `quantity * unit_price` | No |
| `DISTINCT` | Removes duplicate values before counting | Yes; without it every row's value counts |
| `condition` | A condition that can be decided from one row; no aggregates | Yes; without it the whole table is summarised |

| Function | Returns | Works on |
|---|---|---|
| `count` | The number of rows, or of values | Any type |
| `sum` / `avg` | The total / the average | Numbers |
| `min` / `max` | The smallest / largest value | Anything with an order: numbers, text, dates, timestamps |
| `bool_and` / `bool_or` | Whether every row / at least one row is true | {{Term:boolean|Boolean values}}, usually a condition such as `stock > 0` |

An aggregate call is itself an expression, and that cuts both ways. Its argument can be an expression: `sum(quantity * unit_price)` works out each line's value first and then adds them. And its result can sit inside a larger expression: `round(avg(price), 2)`, `max(price) - min(price)`. It belongs in the {{term:select-list}}, not in `WHERE`, because when `WHERE` runs nothing has been summarised yet.

Some expressions, read against the shapes:

- `count(*)`: count rows, looking at no column.
- `count(DISTINCT customer_id)`: with `DISTINCT`, count how many different customer ids there are.
- `bool_or(stock = 0)`: the `expression` is a condition, true or false in each row; if any row is true, so is the result.

## Example {#example}

Task: in the second quarter of 2024 (April to June), how many orders came in, from how many different customers, and when were the first and the last placed?

1. **Mark out the rows to summarise.** Second-quarter orders, with chapter 1's half-open range: `ordered_at >= '2024-04-01' AND ordered_at < '2024-07-01'`. The condition looks at one row at a time, so it goes in `WHERE`.
2. **Pick a function for each question.** "How many orders" counts rows: `count(*)`. "How many customers" must not count a customer twice: `count(DISTINCT customer_id)`. "The first" is the earliest time, `min(ordered_at)`, and "the last" is `max(ordered_at)`.
3. **Name each result.** Without an {{term:alias}}, a column is named after its function, and two of the four would both be called `count`.

```sql run
SELECT count(*) AS orders,
       count(DISTINCT customer_id) AS customers,
       min(ordered_at) AS first_order,
       max(ordered_at) AS last_order
FROM orders
WHERE ordered_at >= '2024-04-01' AND ordered_at < '2024-07-01';
```

Fourteen orders from 10 customers, so some customers ordered more than once in those three months. `min` and `max` are not limited to numbers: timestamps compare by time and text alphabetically.

```check
query: |
  SELECT count(*) AS orders, count(DISTINCT customer_id) AS customers
  FROM orders
  WHERE status = 'delivered';
question: Without looking at the data, which statement holds whatever the data is?
choices:
  - "`customers` is never larger than `orders`"
  - "`customers` always equals `orders`"
  - "`customers` can be larger than `orders`"
  - Both columns are 1, because an aggregate query returns one row
answer: 0
explain: Each order has exactly one customer, and `DISTINCT` can only remove repeated ids, so the number of customers equals the number of orders or falls below it. Here it is 11 orders from 10 customers; one customer received two. The result is indeed one row, but the values in it are counts, not 1.
```

## Variations {#variants}

**Calculating with the results.** The price range is the top price minus the bottom one, and the average is rounded to two places:

```sql run
SELECT max(price) - min(price) AS price_range,
       round(avg(price), 2) AS avg_price
FROM products;
```

`max(price)` and `min(price)` each collapse to one value before the subtraction happens, and `round` works on the single value `avg` hands back.

**Summarising true and false: `bool_or` and `bool_and`.** "Does anything cost more than 300 dollars?" "Is every product in stock?"

```sql run
SELECT bool_or(price > 300) AS any_over_300,
       bool_and(stock > 0) AS all_in_stock
FROM products;
```

4K Monitor settles both on its own. It costs 399 dollars, so `bool_or` is true; it has no stock, so `bool_and` is false. `bool_or` answers "is it true of at least one row?", and `bool_and` "is it true of every row?".

**Calculate, then summarise, or the other way round?** The same quantities and prices give very different answers depending on the order:

```sql run
SELECT sum(quantity * unit_price) AS order_total,
       sum(quantity) * sum(unit_price) AS not_a_total
FROM order_items
WHERE order_id = 3;
```

The first column multiplies within each row and then adds: 96.48, the real value of order 3. The second adds the quantities into 6 and the prices into 57.49 and then multiplies, giving 344.94, as if every item had cost the three prices put together. It means nothing. When the columns hold no NULLs, addition splits up, so `sum(a + b)` equals `sum(a) + sum(b)`; multiplication does not.

## Going deeper {#deeper}

**Result types.** `count` returns `bigint`; so does `sum` over integers, so no total is too large to hold. `avg` returns an exact `numeric` with a long tail of decimals, which usually wants a `round`:

```sql run
SELECT avg(quantity) AS raw_avg, round(avg(quantity), 2) AS rounded
FROM order_items;
```

`quantity` is an integer, yet `avg` does no {{term:integer-division}}: 1.64 does not become 1. Writing `sum(quantity) / count(*)` yourself would give 1, because that divides one integer by another.

**Aggregates do not nest.** Once `avg` has turned all the rows into one value, `max` has no rows left to compare:

```sql run error
SELECT max(avg(price))
FROM products;
```

## Common mistakes {#mistakes}

**1. Wanting the name of the dearest product, and writing `name` next to `max(price)`.**

```sql run error
SELECT name, max(price)
FROM products;
```

The error is `column "products.name" must appear in the GROUP BY clause or be used in an aggregate function`. Many people expect `max` to bring its row along, but `max(price)` hands back a price and nothing about where it came from, while `name` still has 16 values that cannot fit in one row. The `GROUP BY` in the message is the clause that splits rows into groups; without it, the whole table is one group. Finding the dearest product needs no aggregate at all: sort and take the first row.

```sql run
SELECT name, price
FROM products
ORDER BY price DESC
LIMIT 1;
```

**2. Putting an aggregate in `WHERE`.**

```sql run error
SELECT name, price
FROM products
WHERE price = max(price);
```

The error is `aggregate functions are not allowed in WHERE`. `WHERE` tests one row at a time, and while it tests the first row the top price has not been worked out. A condition in `WHERE` uses only the row's own values, such as `quantity * unit_price > 100`. To find the row with the largest value, sort as above.

**3. `count` where `sum` was meant.** "How many items were sold" adds up each row's `quantity`; `count(quantity)` only counts the order lines:

```sql run
SELECT count(quantity) AS lines, sum(quantity) AS units
FROM order_items;
```

Forty-two lines, 69 items. In everyday speech "how many" can mean either, so before writing, ask: am I counting rows, or adding up a number inside them?

**4. Averaging over the wrong rows.** "What is an order worth on average?" written as `avg(quantity * unit_price)` gives 76.57. But a row of `order_items` is an order line, not an order, so that is the average value of a line. The divisor of `avg` is the number of rows it summarises, and here the rows and the orders are not the same thing:

```sql run
SELECT count(*) AS lines, count(DISTINCT order_id) AS orders
FROM order_items;
```

The 42 lines belong to only 23 orders. Before averaging, ask: an average per what? And is one row of the table one of those?

## Summary {#summary}

- An {{term:aggregate-function}} summarises many rows as one value: `count(*)` counts rows, `sum`, `avg`, `min` and `max` summarise a column or an expression, and `bool_or` and `bool_and` summarise true and false.
- `WHERE` filters row by row before anything is summarised, so it decides which rows count, and it cannot contain an aggregate.
- With an aggregate and no `GROUP BY` the result is always one row, even with nothing to summarise: `count` gives 0 and the others NULL.
- After aggregating, `SELECT` can hold only summary values; to find the row with the largest value, use `ORDER BY … LIMIT 1`.
- Before writing, decide whether you are counting rows or adding up amounts, and what the average is per.

## Reference {#reference}

- `count(1)` gives the same result as `count(*)` with no noticeable difference in speed. `count(*)` is the standard form and says most plainly what it does: count rows.
- `sum` and `avg` accept `DISTINCT` too: `sum(DISTINCT quantity)` drops repeated quantities before adding and gives 21, not 69. Write it only when a question really asks for the sum of the different values.
- Standard SQL calls `bool_and` `every`, and PostgreSQL accepts both names. The standard's counterparts of `bool_or`, `any` and `some`, are not supported, because they would be ambiguous next to `= ANY (…)`.
- To count distinct combinations, wrap the columns in parentheses as one value: `count(DISTINCT (customer_id, status))`. MySQL accepts `count(DISTINCT customer_id, status)`; PostgreSQL reports an error.
- SQLite, and MySQL with `ONLY_FULL_GROUP_BY` switched off, run `SELECT name, max(price) FROM products`: SQLite takes the row that holds the maximum, MySQL any row. PostgreSQL's error protects you from an answer that looks plausible and is wrong.
- In PostgreSQL, `count(*)` over a whole table reads the entire table or an index covering every row, so on a large table it is not instant.
