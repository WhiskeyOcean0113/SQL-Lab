## Why you need it {#why}

The shop wants an "Under 40 dollars" section on its home page, with one shelf per category. A shelf is only worth showing if it holds at least 2 products. So the question is: which categories have at least 2 products priced under 40 dollars?

The previous lesson taught you to count products per category. The natural first attempt puts both conditions in `WHERE`:

```sql run error
SELECT category_id, count(*) AS cheap_products
FROM products
WHERE price < 40 AND count(*) >= 2
GROUP BY category_id;
```

PostgreSQL refuses: `aggregate functions are not allowed in WHERE`. `price < 40` is fine; `count(*) >= 2` is the problem. This lesson explains why it cannot go there, and where it does go.

## Core idea {#core}

The query holds two different kinds of condition. `price < 40` can be answered by looking at one row: pick up a product, read its price, keep it or drop it. `count(*) >= 2` cannot. A single product has no "number of products"; only a whole category does.

So SQL has two places to filter, at two moments of the {{term:logical-order}}:

`FROM` → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` → `ORDER BY`

`WHERE` runs before grouping and looks at one {{term:row}} at a time. No {{term:group|groups}} exist yet, so there is nothing for `count(*)` to count, and an {{term:aggregate-function}} cannot appear in `WHERE`. `HAVING` runs after grouping and aggregation and looks at one group at a time. Every group's `count(*)` and `sum(…)` are known by then, so it can compare them; what it can no longer see is any single row inside the group.

Here is the query taken apart, with the real intermediate result at each step:

```steps
- sql: |
    SELECT id, name, category_id, price
    FROM products
    ORDER BY category_id, id;
  say: "`FROM`: 16 products, coloured by category. This is everything `WHERE` will check, row by row."
  group: category_id
- sql: |
    SELECT id, name, category_id, price
    FROM products
    WHERE price < 40
    ORDER BY category_id, id;
  say: "`WHERE price < 40`: each row is judged on its own, and 7 remain. The Gift Card costs exactly 50 dollars and is gone, so the group without a category never forms."
  group: category_id
- sql: |
    SELECT category_id, count(*) AS cheap_products,
           string_agg(name, ', ' ORDER BY name) AS names
    FROM products
    WHERE price < 40
    GROUP BY category_id
    ORDER BY category_id;
  say: "`GROUP BY category_id`: the 7 rows fall into 5 groups, and each group gets its own `count(*)`. The `names` column only lists each group's products so you can check."
  group: category_id
- sql: |
    SELECT category_id, count(*) AS cheap_products
    FROM products
    WHERE price < 40
    GROUP BY category_id
    HAVING count(*) >= 2
    ORDER BY category_id;
  say: "`HAVING count(*) >= 2`: each group is judged on its own. Only categories 4 and 5 have 2 products, so only they remain. Whole groups are removed, never some rows of a group."
  group: category_id
```

Look at how step 2 shapes step 4. Category 3 (Home) has 3 products, yet `HAVING` counts only 1, because the other two were removed at the `WHERE` step. `HAVING` only ever sees the rows `WHERE` kept: filter rows, then group, then filter groups, and that order decides what gets counted.

Deciding where a condition goes therefore comes down to one question: can it be answered from a single row?

| Condition | Answerable from one row? | Goes in |
|---|---|---|
| Price under 40 dollars | Yes, each product has its own price | `WHERE` |
| The order was not cancelled | Yes, each order has its own status | `WHERE` |
| At least 2 products | No, the group must be counted first | `HAVING` |
| Average price over 100 dollars | No, the group must be summarised first | `HAVING` |

If one row can answer it, put it in `WHERE` and drop the unwanted rows before grouping. If only a summary of the whole group can answer it, put it in `HAVING`.

```check
query: |
  SELECT category_id, count(*) AS products
  FROM products
  GROUP BY category_id
  HAVING count(*) >= 2;
question: Remove `WHERE price < 40` and keep only `HAVING`. How many categories remain now?
choices: ['2', '4', '5', '6']
answer: 2
explain: Without `WHERE`, `HAVING` counts every product in each category. Categories 1 to 5 all have at least 2; the group without a category holds only the Gift Card and is removed. The answer goes from 2 groups to 5. Which step a condition sits in decides what `HAVING` counts.
verify: { rows: 5 }
```

## Syntax {#syntax}

```syntax
SELECT select_list
FROM table_name
[ WHERE condition ]
[ GROUP BY grouping_element [, …] ]
[ HAVING condition ]
[ ORDER BY expression [, …] ]
```

| Part | What goes there | Optional? |
|---|---|---|
| `WHERE condition` | A condition on one row; any column of the table, no aggregates | Yes; without it every row is grouped |
| `GROUP BY grouping_element` | A {{term:grouping-column}} or an expression | Yes |
| `HAVING condition` | A condition on a whole group: aggregates, grouping columns, and expressions built from them | Yes; without it every group is kept |

Both `condition`s are written the same way, with comparisons, `AND`, `OR`, `IN` and `BETWEEN`. They differ only in what they may refer to. A plain column in `HAVING` must be a grouping column, for the same reason as in `SELECT`: after grouping, any other column has several values per group, and "the group's price" would not say which one.

`HAVING` is written after `GROUP BY` and before `ORDER BY`, so the written order matches the order of execution.

A few clauses, read against the shape:

- `HAVING count(*) >= 2`: an aggregate compared with a constant.
- `HAVING sum(stock) > 100 AND count(*) >= 3`: two group conditions joined by `AND`, exactly as conditions are combined in `WHERE`.
- `WHERE status <> 'cancelled' … HAVING count(*) >= 3`: one row condition and one group condition, each in its own place.

## Example {#example}

Task: which products are often bought several at a time? To be precise: an order line with a quantity of 2 or more is a "bulk purchase". Find the products with at least 2 bulk purchases, and list each product's id, its number of bulk purchases, and how many units those lines add up to.

1. **Decide what one row of the result stands for.** One product, so group by `product_id`.
2. **Split the conditions and ask of each: can one row answer it?** "This line bought 2 or more": the line's `quantity` says so, so it goes in `WHERE`. "At least 2 times": you have to count a product's bulk lines, so it goes in `HAVING`. Both conditions contain a 2, but one is about a row and the other about a group.
3. **Decide what each group computes.** The number of purchases is `count(*)`, the units are `sum(quantity)`. Since `WHERE` has already removed the single-unit lines, both aggregates cover bulk purchases only.
4. **Write it in execution order, then check one group by hand.**

```sql run
SELECT product_id, count(*) AS bulk_lines, sum(quantity) AS units
FROM order_items
WHERE quantity >= 2
GROUP BY product_id
HAVING count(*) >= 2
ORDER BY product_id;
```

Check product 8, the Ceramic Mug. It appears on 4 order lines; the one in order 22 is for a single mug and is dropped by `WHERE`. The remaining 3 lines add up to 2 + 4 + 6 = 12 units.

```check
query: |
  SELECT product_id, count(*) AS bulk_lines, sum(quantity) AS units
  FROM order_items
  WHERE quantity >= 2
  GROUP BY product_id
  HAVING count(*) >= 3
  ORDER BY product_id;
question: Raise the bar to at least 3 bulk purchases. Is product 6, the USB-C Hub, still in the result?
choices:
  - Yes, it appears on 3 order lines
  - Yes, its bulk purchases add up to 5 units
  - No, it has only 2 bulk purchases
  - No, it is an error to use WHERE and HAVING in one query
answer: 2
explain: Product 6 is on orders 4, 11 and 15, and the line in order 11 is for a single unit, so `WHERE` has already dropped it. The group `HAVING` sees has 2 rows, its `count(*)` is 2, and 2 is not `>= 3`. The 5 is `sum(quantity)`, which is not what this condition compares. Only products 8 and 12 remain.
```

## Variations {#variants}

**An aggregate in `HAVING` need not appear in `SELECT`.** Which order statuses involve at least 4 different customers? The result shows order counts, but the filter uses customer counts:

```sql run
SELECT status, count(*) AS orders
FROM orders
GROUP BY status
HAVING count(DISTINCT customer_id) >= 4;
```

`delivered` has 11 orders from 10 customers; `cancelled` and `shipped` involve fewer than 4 customers and are removed.

**Group conditions combined with `AND` and `OR`.** The warehouse checks two kinds of order by hand: those worth more than 300 dollars, and those with at least 3 lines. Both conditions summarise a whole order, so `OR` joins them:

```sql run
SELECT order_id, count(*) AS lines, sum(quantity * unit_price) AS total
FROM order_items
GROUP BY order_id
HAVING sum(quantity * unit_price) > 300 OR count(*) >= 3
ORDER BY order_id;
```

Order 5 has a single line but is worth 399 dollars; order 3 is worth under 100 dollars but has 3 lines. Meeting either condition is enough.

## Going deeper {#deeper}

**`HAVING` without `GROUP BY`.** A query with `HAVING` is a grouped query even when it has no `GROUP BY`. All rows then form one group, and the result is either one row or none:

```sql run
SELECT count(*) AS orders, min(ordered_at) AS first_order
FROM orders
HAVING count(*) > 30;
```

No rows. The aggregates still produce their one row (24 orders), and then `HAVING` finds that the group fails the condition and removes it.

**A condition on a grouping column works in `HAVING`, but belongs in `WHERE`.** A grouping column has a single value per group, so `HAVING category_id <= 2` runs and gives the same result as the same condition in `WHERE`. The work differs. In `HAVING`, the database groups every row and computes every aggregate, then throws most groups away; in `WHERE`, the unwanted rows never reach the grouping. The intent is clearer as well: `WHERE` is about rows, `HAVING` about groups.

## Common mistakes {#mistakes}

**1. An aggregate condition in `WHERE`.** This is the query from Why you need it: `WHERE … count(*) >= 2` fails with `aggregate functions are not allowed in WHERE`. Move that condition to a `HAVING` after `GROUP BY`, and leave the row condition `price < 40` in `WHERE`.

**2. A row condition in `HAVING`.** Counting each category's products launched in 2023 or later:

```sql run error
SELECT category_id, count(*) AS products
FROM products
GROUP BY category_id
HAVING launched_on >= '2023-01-01';
```

It fails with `column "products.launched_on" must appear in the GROUP BY clause or be used in an aggregate function`. By the time `HAVING` runs, a category has several launch dates, so "the group's launch date" means nothing. "Launched in 2023 or later" is about one product and belongs in `WHERE`. Do not follow the error and add `launched_on` to `GROUP BY`: the query then runs, but each group becomes "the products of one category launched on one day".

**3. Rows that should be filtered first are not, and the numbers quietly grow.** Looking for customers with at least 2 shipped orders, but writing only `HAVING`:

```sql run
SELECT customer_id, count(*) AS shipped
FROM orders
GROUP BY customer_id
HAVING count(*) >= 2;
```

All 10 customers come back, because `count(*)` counts each customer's orders of every kind. "Shipped" restricts which rows are counted, so `WHERE shipped_at IS NOT NULL` has to remove the other orders before grouping. Nothing reports an error and the result looks plausible, which makes this the hardest mistake to spot. Before writing, ask: is this condition used before counting, or after?

**4. A group condition written as a row condition.** "Categories whose average price is under 50 dollars", written as:

```sql run
SELECT category_id, round(avg(price), 2) AS avg_price
FROM products
WHERE price < 50
GROUP BY category_id;
```

It runs, but it answers another question: the average price of each category's products under 50 dollars. Category 2 averages 203 dollars, yet it shows up because one of its products, the 35-dollar USB-C Hub, is cheap. An average belongs to the whole group: write `HAVING avg(price) < 50` and drop the `WHERE`.

**5. A `SELECT` {{term:alias}} in `HAVING`.**

```sql run error
SELECT customer_id, count(*) AS n
FROM orders
GROUP BY customer_id
HAVING n >= 3;
```

It fails with `column "n" does not exist`. The alias is created at the `SELECT` step, and `HAVING` runs before it. In PostgreSQL, `GROUP BY` and `ORDER BY` may use output column names, but `WHERE` and `HAVING` may not. Repeat the aggregate instead: `HAVING count(*) >= 3`.

## Summary {#summary}

- `WHERE` filters one row at a time before grouping and cannot use aggregates; `HAVING` filters one group at a time after grouping, with aggregates or grouping columns in its condition.
- The test: a condition one row can answer goes in `WHERE`; one that needs a summary of the group goes in `HAVING`.
- `HAVING` sees only the rows `WHERE` kept, so `WHERE` changes what `HAVING` counts.
- `HAVING` cannot use `SELECT` aliases; without `GROUP BY` the whole table is one group, and the result can be empty.

## Reference {#reference}

- Neither standard SQL nor PostgreSQL lets `HAVING` use a `SELECT` alias. MySQL does, so people who learned SQL on MySQL often meet `column does not exist` in PostgreSQL.
- The MySQL manual gives the same advice: do not put in `HAVING` a condition that belongs in `WHERE`.
- `HAVING` without `GROUP BY` is standard SQL. The PostgreSQL manual describes it as one group made of all rows, which yields one row if the condition is true and none otherwise.
