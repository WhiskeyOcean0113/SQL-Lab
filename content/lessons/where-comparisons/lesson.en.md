## Why you need it {#why}

`products` holds 16 products, but the answer to "Which products are sold out?" is a single row. `SELECT` decides which columns you get; `WHERE` decides which rows.

```sql run
SELECT name, stock
FROM products
WHERE stock = 0;
```

## Core idea {#core}

`WHERE` is followed by a condition, called a {{term:predicate}}. The database tests it once for every row that `FROM` produces and keeps only the rows where it is true.

Conditions are usually written with a {{term:comparison-operator}}:

| Operator | Meaning | Example |
|---|---|---|
| `=` | equal | `stock = 0` |
| `<>` or `!=` | not equal | `status <> 'delivered'` |
| `<` / `>` | less / greater than | `price > 100` |
| `<=` / `>=` | at most / at least | `price >= 129` |

`<>` is the SQL standard spelling and `!=` is an alias PostgreSQL accepts; they are exactly the same.

Either side of a comparison can be a column, a {{term:literal}} or a calculation. Chapter 0 covered how literals are written: numbers bare, text and dates in single quotes, dates as year-month-day:

```sql run
SELECT name, joined_on
FROM customers
WHERE joined_on >= '2024-01-01';
```

In the logical order, `WHERE` runs right after `FROM` and before `SELECT`. It can therefore use any column of the table, even one that is not selected in the end.

**A condition can be more than true or false.** When either side of a comparison is NULL, the result is neither true nor false but NULL, meaning "unknown". `WHERE` keeps only rows where the condition is true, so rows where it is NULL are dropped too. Going deeper has an example, and this chapter's lesson on NULL covers it fully.

## Syntax {#syntax}

```syntax
SELECT select_list
FROM table_name
WHERE condition
```

The `WHERE` clause is optional; when you write it, it follows `FROM`. `condition` is an {{term:expression}} that works out to true, false or NULL for each row. In this lesson the `condition` is one comparison, shaped like this:

```syntax
expression { = | <> | != | < | > | <= | >= } expression
```

| Part | What goes there | Notes |
|---|---|---|
| Left `expression` | A column name, a literal or a calculation | Most often a column, such as `stock` |
| Operator | One of the six comparisons | `<>` and `!=` are identical |
| Right `expression` | As on the left | Most often a literal, such as `0` |

The two sides must be comparable: numbers with numbers, text with text, dates with dates.

Some conditions, read against the shape:

- `stock = 0`: a column compared with a literal.
- `0 = stock`: the sides swapped; same meaning, just harder to read.
- `price * stock > 1500`: a calculation on the left. Each row's stock value is computed first, then compared with 1500.

The next lesson combines several such comparisons into one `condition` with `AND`, `OR` and `NOT`.

## Example {#example}

Task: which orders have not been delivered yet? List their id and status.

1. **Turn the question into a condition each row can answer with yes or no.** "Not delivered yet" means "the status is not delivered".
2. **Choose the operator.** "Is not" is `<>`.
3. **Write the literal.** `'delivered'` is text, so it takes single quotes, and its case must match the data exactly.
4. **Put it in `WHERE`.**

```sql run
SELECT id, status
FROM orders
WHERE status <> 'delivered';
```

13 of the 24 orders are not delivered: some are shipped, some paid or pending, and some cancelled. If the real question were "orders still on their way, excluding cancelled ones", the condition would need more than one test. That is the next lesson.

## Variations {#variants}

**Filtering on numbers.** Products costing at least 129 dollars:

```sql run
SELECT name, price
FROM products
WHERE price >= 129;
```

`>=` includes 129 itself, so Mechanical Keyboard is in the result; with `>` it would vanish. Whether the boundary value belongs in the result is the one thing to stop and think about whenever you write a condition.

**Filtering on dates.** Dates compare by time: a later date is "greater".

```sql run
SELECT id, ordered_at
FROM orders
WHERE ordered_at < '2024-02-01';
```

**The filter and the select list are independent.** The query above filters on `ordered_at` and happens to select it too, but you could select only `id` and still filter on `ordered_at`.

**Either side can be a calculation.** Products whose stock is worth more than 1500 dollars:

```sql run
SELECT name, price * stock AS stock_value
FROM products
WHERE price * stock > 1500;
```

`WHERE stock_value > 1500` would not work, because the alias only appears at `SELECT` (Chapter 0's logical order). So the calculation is written out again in `WHERE`.

**Text can be compared too.** Text compares character by character, and whatever sorts first is "smaller". Products whose names sort before D:

```sql run
SELECT name
FROM products
WHERE name < 'D';
```

4K Monitor is included, because digits sort before every letter.

## Going deeper {#deeper}

**Text comparison is case-sensitive.** In PostgreSQL, `'china'` and `'China'` are different values:

```sql run
SELECT name
FROM customers
WHERE country = 'china';
```

That returns 0 rows, with no error. MySQL's default comparison rules ignore case, so the same query there returns 3 rows. Watch for this when you move between databases.

**The collation decides how text sorts.** The rules for ordering text are called a {{term:collation}}. This course's database uses the simplest one, C, which compares character codes: digits come before capitals, and every capital comes before every lower-case letter, so `'Zebra' < 'apple'` is true. Many real PostgreSQL installations use a language-aware collation, which can order text differently. Before comparing text, check that its case is consistent.

**Text compares alphabetically, not numerically.** `'9' > '10'` is true, because comparing character by character, `'9'` is greater than `'1'`. Store numbers as numbers and compare them with numbers.

```sql run
SELECT '9' > '10' AS text_comparison, 9 > 10 AS number_comparison;
```

**`<>` does not pick up NULL.** Customers who do not live in Toronto:

```sql run
SELECT name, city
FROM customers
WHERE city <> 'Toronto';
```

Two of the 12 customers live in Toronto, yet the result has 8 rows, not 10. Liam O'Brien and Lucas Silva have no city recorded. `NULL <> 'Toronto'` is NULL, not true, so they are dropped. Including them takes `IS NULL`, from this chapter's lesson on NULL.

**Comparing a timestamp with a date for equality.** `ordered_at` is a timestamp, with hours, minutes and seconds. `ordered_at = '2024-01-05'` means "placed at exactly midnight on 2024-01-05":

```sql run
SELECT id, ordered_at
FROM orders
WHERE ordered_at = '2024-01-05';
```

That returns 0 rows, although order 1 was placed that morning. Finding a day's orders takes a range: `ordered_at >= '2024-01-05'` and `ordered_at < '2024-01-06'`. Once the next lesson introduces `AND`, you can write exactly that.

## Common mistakes {#mistakes}

**1. Double quotes around text.** Many programming languages use double quotes for strings, and the habit breaks SQL:

```sql run error
SELECT name
FROM customers
WHERE country = "Canada";
```

`column "Canada" does not exist`: the database read `"Canada"` as a column name. Write `'Canada'`.

**2. `==` for equality.** Another habit from programming. SQL equality is a single `=`; `==` fails with `operator does not exist`.

**3. A reversed two-character operator.** "At most" is `<=`, not `=<`; the latter also fails with `operator does not exist`.

**4. The wrong boundary.** "At least 129" is `>= 129`; "more than 129" is `> 129`. Research on novice SQL finds the wrong comparison operator among the errors students are least likely to catch themselves, because the query runs and simply returns a row too many or too few. After writing a condition, check the value right on the boundary.

**5. Case that does not match the data.** `status = 'Delivered'` finds nothing, because the data holds lower-case `delivered`. When unsure, `SELECT` the column first and look at what is really there.

**6. Expecting `<>` to return rows holding NULL.** In everyday language, "the city is not Toronto" surely covers people whose city is unknown. In SQL it does not. See Going deeper: when one side is NULL the result is NULL, and `WHERE` drops the row.

**7. Using a `SELECT` alias in `WHERE`.** As Chapter 0 showed, `WHERE` runs before `SELECT`, so the alias does not exist yet. Write the calculation out again in `WHERE`.

## Summary {#summary}

- `WHERE` tests a condition on each row and keeps the rows where it is true.
- The comparison operators are `=`, `<>` (or `!=`), `<`, `>`, `<=` and `>=`.
- When either side of a comparison is NULL, the result is NULL and the row is dropped, with `<>` as with any other operator.
- Text comparison is case-sensitive and alphabetical.
- Check the boundary: `>=` and `>` differ by one value, and that is where mistakes hide.
