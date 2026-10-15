## Why you need it {#why}

`SELECT *` is fine for a first look at a table, but answering a real question usually needs only a few of its columns. The warehouse manager asks: "What is the name and stock level of each product?" Launch dates and category numbers do not help with that.

Some answers are not in the table at all and have to be computed: "What is each product's stock worth?" The table holds the unit price and the quantity; the total value is yours to calculate in the query.

This lesson covers those two jobs of `SELECT`: choosing columns and computing new ones.

## Core idea {#core}

### The select list

What follows `SELECT` is a list called the {{term:select-list}}. Each item becomes one column of the result, and items are separated by commas:

```sql run
SELECT name, stock
FROM products;
```

**The result's columns follow the order of your list.** Their order in the table does not matter. The query above lists `name` before `stock`, so the result does too.

### Every item is an expression

Each item in the list is an {{term:expression}}: something that works out to a value. The most common kinds:

| Expression | Example | Value computed for each row |
|---|---|---|
| A column name | `price` | This row's price |
| A {{term:literal}} | `'USD'`, `1.1` | The same fixed value in every row |
| A formula built with an {{term:operator}} | `price * stock` | This row's price times this row's stock |
| A {{term:function}} call | `upper(name)` | This row's product name in capitals (Chapter 2) |

These combine freely, as in `price * stock * 0.8`.

**An expression is computed once for each row.** `FROM products` yields 16 rows, so the result has 16 rows, and each row's `price * stock` uses that row's own price and stock. `SELECT` decides which columns the result has; it never adds or removes rows.

```sql run
SELECT name, price * stock AS stock_value
FROM products;
```

### Naming result columns with `AS`

`AS stock_value` names the computed column. That name is a {{term:column-alias}}. Without one, PostgreSQL picks a name by these rules:

- A plain column name keeps that name.
- A function call is named after the function: `upper(name)` becomes `upper`.
- Any other expression is called `?column?`, which tells nobody anything.

So every computed column deserves a name, given with `AS`, that says what it means.

Recall the logical order from the previous lesson: `SELECT` runs after `FROM` and `WHERE`. It receives rows that have already been filtered and computes your columns for each of them.

## Syntax {#syntax}

```syntax
SELECT { * | expression [ [ AS ] output_name ] } [, …]
FROM table_name
```

| Part | What goes there | Optional? |
|---|---|---|
| `*` | Every column of the table, in the order the table defines | Each item is either `*` or an `expression` |
| `expression` | A column name, a literal, a formula or a function call | As above |
| `AS output_name` | The column's name in the result. `output_name` is a name and follows the same rules as any other {{term:identifier}}: unquoted, it is lower-cased; to keep capitals or spaces, use double quotes | The whole part can go. Dropping only `AS` and keeping the name also runs, but this course always writes `AS` |
| `[, …]` | More items, each preceded by a comma | Yes: one item is enough |
| `table_name` | The table to read | Always written in this lesson; PostgreSQL also accepts queries without `FROM` |

Some queries, read against the shape:

- `SELECT * FROM products`: one item, `*`.
- `SELECT name, price * stock AS stock_value FROM products`: two items, the second a named expression.
- `SELECT *, price * stock AS stock_value FROM products`: two items; more items may follow a `*`.

Later lessons extend this shape step by step with `WHERE`, `ORDER BY` and the other clauses.

## Example {#example}

### Example 1: stock value

Task: list each product's name, unit price, quantity in stock, and the total value of that stock, naming the last column `stock_value`.

1. **Decide which columns, in which order.** Name, price, stock, then the stock value.
2. **Columns that exist in the table: write their names.** `name, price, stock`.
3. **Columns that do not exist: write an expression.** The stock value is `price * stock`.
4. **Name the computed column.** `AS stock_value`.

```sql run
SELECT name, price, stock, price * stock AS stock_value
FROM products;
```

4K Monitor has 0 in stock, so its `stock_value` is 0.00. Gift Card's price of 50.00 times its 999 units gives 49950.00, the most valuable stock in the shop.

### Example 2: 20% off

Task: during a sale everything is 20% off. List each product's name, its sale price `sale_price`, and the value of its stock at the sale price, `sale_value`.

1. **The sale price.** The price times 0.8: `price * 0.8 AS sale_price`.
2. **The stock value at the sale price.** It is tempting to write `sale_price * stock`, but an alias cannot be used elsewhere in the same select list (see Going deeper). So write the sale-price expression again: `price * 0.8 * stock`.
3. **Name both columns.** With more columns, one item per line reads better.

```sql run
SELECT name,
       price * 0.8 AS sale_price,
       price * 0.8 * stock AS sale_value
FROM products;
```

Ceramic Mug costs 12.50, so its sale price is 10.000; with 100 in stock, its sale value is 1000.000. The results have three decimal places because multiplying `numeric` values adds up their decimal places: two in 12.50 and one in 0.8.

## Variations {#variants}

**`AS` is optional, but keep it.** `price * stock stock_value` means the same as the version with `AS`. That optional keyword is behind some very quiet mistakes (see Common mistakes, number 1), so this course always writes `AS`.

**Aliases with spaces or capitals need double quotes.** Double quotes wrap names, not text:

```sql run
SELECT name AS "Product name", price AS "Price (USD)"
FROM products;
```

**Constant columns.** The list can hold a fixed value, which then appears in every row. Text constants take single quotes:

```sql run
SELECT name, price, 'USD' AS currency
FROM products;
```

**Arithmetic.** `+`, `-`, `*` and `/` all work. Here is the price including 10% tax:

```sql run
SELECT name, price, price * 1.1 AS price_with_tax
FROM products;
```

The result has three decimal places (46.200), for the same reason as in Example 2. Chapter 2 shows how to round.

**`*` alongside other items.** To see the whole table plus one computed column:

```sql run
SELECT *, price * stock AS stock_value
FROM products;
```

`*` can also be written `products.*`, meaning "every column of `products`". Here it makes no difference; in Chapter 4, with several tables in one query, it expands the columns of just one of them.

**The same column can appear twice.** Each item is computed on its own, so `SELECT name, name FROM products` gives two identical columns of product names. That is rarely useful, but it makes a point: the list says what to output, not which columns the table has.

## Going deeper {#deeper}

**An alias cannot be used in the same select list.** This query tries to compute another column from the name `stock_value` it has just defined, and fails:

```sql run error
SELECT name,
       price * stock AS stock_value,
       stock_value / 2 AS half_value
FROM products;
```

Think of every item in the list as computed at the same moment from the same input row. `stock_value` is a name for an output column, and it does not exist yet while the other items are computed. Either repeat the expression, as in Example 2, or compute in two steps with a subquery, which Chapter 5 covers. In the logical order, only `ORDER BY`, which runs after `SELECT`, can use an alias.

**Aliases follow the case rules for names.** `AS StockValue` produces a column called `stockvalue`, because unquoted names are lower-cased. To keep the capitals, write `AS "StockValue"`. The easy route is lower case with underscores: `stock_value`.

**An alias names a result column; it does not change the table.** `AS stock_value` affects this query's result only. `products` gains no new column.

**Aliases and keywords.** `order` is an SQL keyword. `SELECT name AS order` runs in PostgreSQL, but without `AS`, as `SELECT name order`, it is a syntax error. That is one more reason to keep `AS`, and a better habit still is to avoid keywords as names altogether.

**Two result columns can share a name.** `SELECT name AS x, price AS x` runs, and both columns are called `x`. PostgreSQL allows it, but nobody can then tell the columns apart by name, so avoid it.

**The cost of `SELECT *`.** In these exercises `SELECT *` is a handy way to look at a table, but real queries should list the columns they need. The result is easier to read, smaller, and does not change silently when someone adds a column to the table.

**Integer division.** Dividing one integer by another gives an integer: `7 / 2` is 3, not 3.5. Take care with calculations like `stock / 2`. Chapter 2 covers numeric types in detail.

## Common mistakes {#mistakes}

**1. A missing comma between columns.** This is one of the quietest mistakes, because it raises no error:

```sql run
SELECT name price
FROM products;
```

The result has one column, called `price`, holding product names. The database read `price` as an alias for `name` (remember that `AS` is optional). The syntax shows why: `expression [ [ AS ] output_name ]` lets a name follow an expression directly. Whenever a result has fewer columns than you expect, check the commas.

**2. A comma after the last column.** `SELECT name, price, FROM products;` fails with `syntax error at or near "FROM"`. In the syntax the comma lives inside `[, …]`, so it only ever goes between two items.

**3. Single quotes around an alias.** Single quotes wrap text, not names. `SELECT name AS 'n'` is a syntax error; write `AS n` or `AS "n"`.

**4. Expecting the table to decide the column order.** Columns come out in the order you list them. If the task asks for the name first and the price second, write them in that order.

**5. Leaving a computed column unnamed.** `SELECT price * stock` produces a column called `?column?`. Nobody reading the result, including you later, can tell what it is, and an exercise that asks for column names will mark it wrong.

**6. Using an alias in the same select list.** See the first point in Going deeper: the error is `column "stock_value" does not exist`, even though the line above defines it. Repeat the expression instead.

## Summary {#summary}

- `SELECT` takes a comma-separated list; each item is an expression, computed once per row, that becomes a result column in the order you write it.
- The shape is `SELECT { * | expression [ [ AS ] output_name ] } [, …] FROM table_name`.
- Name computed columns with `AS`, or they are called `?column?`; unquoted aliases are lower-cased, so use double quotes for spaces or capitals.
- An alias belongs to the result: other items in the same select list cannot use it.
- A missing comma raises no error but turns the next column into an alias; when the column count looks wrong, check the commas first.
