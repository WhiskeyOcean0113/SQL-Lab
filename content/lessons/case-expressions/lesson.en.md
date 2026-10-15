## Why you need it {#why}

Marketing wants products in three tiers: premium from 100 dollars up, standard from 30 to 100, budget for the rest. No column holds a tier; it depends on which range the price falls in.

"If this, then that, otherwise something else" is written in SQL as a {{term:case-expression}}.

## Core idea {#core}

```sql
CASE
  WHEN condition1 THEN value1
  WHEN condition2 THEN value2
  ELSE default_value
END
```

- The database tests the `WHEN` conditions **from top to bottom**, and the **first** one that is true supplies the result; the rest are not looked at.
- When no condition holds, the `ELSE` value is returned; **without an `ELSE`, the result is NULL**.
- `CASE … END` is an expression that yields one value per row, so it can go anywhere a value can: `SELECT`, `WHERE`, `ORDER BY`.

```sql run
SELECT name, price,
       CASE
         WHEN price >= 100 THEN 'premium'
         WHEN price >= 30 THEN 'standard'
         ELSE 'budget'
       END AS tier
FROM products
ORDER BY price DESC;
```

## Example {#example}

Task: give every product a stock note: `sold out` when there is none, `low` below 10 units, and `ok` otherwise.

1. **List every case and its value.** Zero units, fewer than 10, everything else.
2. **Decide the order.** Zero also counts as "fewer than 10", so the more specific condition goes first.
3. **Write an `ELSE`** that covers everything left, so no row gets NULL.
4. **Name it.** `AS stock_note`.

```sql run
SELECT name, stock,
       CASE
         WHEN stock = 0 THEN 'sold out'
         WHEN stock < 10 THEN 'low'
         ELSE 'ok'
       END AS stock_note
FROM products;
```

4K Monitor is sold out; Noise-Cancelling Headphones (8 units), Linen Throw (7) and Folding Chair (5) are low.

## Variations {#variants}

**The simple CASE.** When every branch tests the same value for equality, put that value right after `CASE`:

```sql run
SELECT id, status,
       CASE status
         WHEN 'delivered' THEN 'closed'
         WHEN 'cancelled' THEN 'closed'
         ELSE 'open'
       END AS phase
FROM orders;
```

**A custom sort order.** Sorting order statuses alphabetically means nothing. To sort them in the order an order moves through, map each status to a number with CASE:

```sql run
SELECT id, status
FROM orders
ORDER BY CASE status
           WHEN 'pending' THEN 1
           WHEN 'paid' THEN 2
           WHEN 'shipped' THEN 3
           WHEN 'delivered' THEN 4
           ELSE 5
         END, id;
```

**`COALESCE`: the first value that is not NULL.** `COALESCE(city, 'unknown')` gives `unknown` when the city is NULL. It is shorthand for a CASE:

```sql run
SELECT name, COALESCE(city, 'unknown') AS city
FROM customers;
```

**`NULLIF`: NULL when equal.** `NULLIF(stock, 0)` returns NULL when the stock is 0. Its most common use is guarding against division by zero:

```sql run
SELECT name, price, stock, price / NULLIF(stock, 0) AS price_per_unit
FROM products;
```

4K Monitor has 0 in stock and gets NULL in that column instead of an error.

## Going deeper {#deeper}

**A simple CASE cannot test for NULL.** `CASE city WHEN NULL THEN …` really tests `city = NULL`, which is never true:

```sql run
SELECT name, city,
       CASE city WHEN NULL THEN 'unknown' ELSE city END AS simple_case,
       CASE WHEN city IS NULL THEN 'unknown' ELSE city END AS searched_case
FROM customers;
```

In Liam O'Brien's row the first form is still NULL. For NULL, use the full form with `IS NULL`, or simply `COALESCE`.

**Every branch must have the same type.** A CASE returns one type only. Here one branch is text and the other an integer, so it fails:

```sql run error
SELECT name,
       CASE WHEN stock = 0 THEN 'sold out' ELSE stock END AS stock_label
FROM products;
```

PostgreSQL tries to turn `'sold out'` into an integer and cannot. Converting the number to text as well, `stock::text`, makes it work (type casts are the last lesson of this chapter).

**Standard and dialects.** `CASE`, `COALESCE` and `NULLIF` are standard SQL and work in every major database. MySQL's `IF()` and SQL Server's `IIF()` are their own extensions.

## Common mistakes {#mistakes}

**1. Branches in the wrong order.** Put a broad condition first and the narrow one never gets its turn:

```sql run
SELECT name, price,
       CASE
         WHEN price >= 30 THEN 'standard'
         WHEN price >= 100 THEN 'premium'
         ELSE 'budget'
       END AS tier
FROM products
WHERE price >= 100;
```

All three products over 100 dollars come out as standard, because `price >= 30` matches first. Start with the most specific, narrowest condition.

**2. Forgetting `ELSE`.** Rows that match nothing get NULL, which then causes knock-on trouble in later arithmetic or concatenation. Write an `ELSE` even when you believe the conditions cover everything.

**3. Testing NULL with a simple CASE.** See Going deeper: `WHEN NULL` never matches.

**4. Branches of different types.** Mixing text and numbers is an error; make the types agree first.

**5. A missing `END`.** `CASE` must close with `END`, and the alias goes after `END`.

## Summary {#summary}

- `CASE WHEN … THEN … ELSE … END` tests from the top, and the first true branch gives the result.
- Without an `ELSE`, unmatched rows get NULL.
- The simple CASE suits "equals this value" tests but cannot detect NULL.
- CASE works anywhere a value can, `SELECT`, `WHERE`, `ORDER BY` and more, and every branch must have the same type.
- `COALESCE` returns the first non-NULL value; `NULLIF` returns NULL when its arguments are equal, a common guard against division by zero.
