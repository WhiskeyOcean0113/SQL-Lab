## Why you need it {#why}

`SELECT *` is fine for a first look at a table, but answering a real question usually needs only a few of its columns. The warehouse manager asks: "What is the name and stock level of each product?" Launch dates and category numbers do not help with that.

Some answers are not in the table at all and have to be computed: "What is each product's stock worth?" The table holds the unit price and the quantity; the total value is yours to calculate in the query.

This lesson covers those two jobs of `SELECT`: choosing columns and computing new ones.

## Core idea {#core}

What follows `SELECT` is a list called the {{term:select-list}}. Each item becomes one column of the result, and items are separated by commas:

```sql run
SELECT name, stock
FROM products;
```

The essentials:

- **You decide the column order.** The result's columns follow the order of your list, whatever their order in the table.
- **The list can hold {{term:expression|expressions}}, not just column names.** `price * stock` is computed once for every row.
- **`AS` names a result column.** That name is an {{term:alias}}. Without one, PostgreSQL gives a computed column the unhelpful default name `?column?`.

```sql run
SELECT name, price * stock AS stock_value
FROM products;
```

Recall the logical order from the previous lesson: `SELECT` runs after `FROM` and `WHERE`. It receives rows that have already been filtered and computes your columns for each of them.

## Example {#example}

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

The result has three decimal places (46.200) because multiplying `numeric` values adds up their decimal places. Chapter 2 shows how to round.

## Going deeper {#deeper}

**An alias names a result column; it does not change the table.** `AS stock_value` affects this query's result only. `products` gains no new column.

**Aliases and keywords.** `order` is an SQL keyword. `SELECT name AS order` runs in PostgreSQL, but without `AS`, as `SELECT name order`, it is a syntax error. That is one more reason to keep `AS`, and a better habit still is to avoid keywords as names altogether.

**The cost of `SELECT *`.** In these exercises `SELECT *` is a handy way to look at a table, but real queries should list the columns they need. The result is easier to read, smaller, and does not change silently when someone adds a column to the table.

**Integer division.** Dividing one integer by another gives an integer: `7 / 2` is 3, not 3.5. Take care with calculations like `stock / 2`. Chapter 2 covers numeric types in detail.

## Common mistakes {#mistakes}

**1. A missing comma between columns.** This is one of the quietest mistakes, because it raises no error:

```sql run
SELECT name price
FROM products;
```

The result has one column, called `price`, holding product names. The database read `price` as an alias for `name` (remember that `AS` is optional). Whenever a result has fewer columns than you expect, check the commas.

**2. A comma after the last column.** `SELECT name, price, FROM products;` fails with `syntax error at or near "FROM"`. Commas only go between columns.

**3. Single quotes around an alias.** Single quotes wrap text, not names. `SELECT name AS 'n'` is a syntax error; write `AS n` or `AS "n"`.

**4. Expecting the table to decide the column order.** Columns come out in the order you list them. If the task asks for the name first and the price second, write them in that order.

**5. Leaving a computed column unnamed.** `SELECT price * stock` produces a column called `?column?`. Nobody reading the result, including you later, can tell what it is, and an exercise that asks for column names will mark it wrong.

## Summary {#summary}

- `SELECT` takes a comma-separated list; each item is a result column, in the order you write it.
- Items can be expressions such as `price * stock`, computed once per row.
- `AS` gives a result column an alias; aliases with spaces take double quotes, text constants take single quotes.
- A missing comma raises no error but turns the next column into an alias; when the column count looks wrong, check the commas first.
