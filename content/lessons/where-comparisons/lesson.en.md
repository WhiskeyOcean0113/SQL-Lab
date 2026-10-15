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

You compare columns with other columns or with fixed values written into the query, called {{term:literal|literals}}. How you write a literal depends on its type:

- **Numbers** are written as they are: `price > 100`.
- **Text** goes in single quotes: `country = 'Canada'`.
- **Dates** also go in single quotes, as year-month-day: `joined_on >= '2024-01-01'`.

```sql run
SELECT name, joined_on
FROM customers
WHERE joined_on >= '2024-01-01';
```

In the logical order, `WHERE` runs right after `FROM` and before `SELECT`. It can therefore use any column of the table, even one that is not selected in the end.

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

## Going deeper {#deeper}

**Text comparison is case-sensitive.** In PostgreSQL, `'china'` and `'China'` are different values:

```sql run
SELECT name
FROM customers
WHERE country = 'china';
```

That returns 0 rows, with no error. MySQL's default comparison rules ignore case, so the same query there returns 3 rows. Watch for this when you move between databases.

**Text compares alphabetically, not numerically.** `'9' > '10'` is true, because comparing character by character, `'9'` is greater than `'1'`. Store numbers as numbers and compare them with numbers.

```sql run
SELECT '9' > '10' AS text_comparison, 9 > 10 AS number_comparison;
```

**Single quotes and double quotes have separate jobs.** PostgreSQL follows the standard strictly here: single quotes wrap text, double quotes wrap names (tables, columns, aliases). To put a single quote inside text, write two: `'Liam O''Brien'`.

```sql run
SELECT name, city
FROM customers
WHERE name = 'Liam O''Brien';
```

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

## Summary {#summary}

- `WHERE` tests a condition on each row and keeps the rows where it is true.
- The comparison operators are `=`, `<>` (or `!=`), `<`, `>`, `<=` and `>=`.
- Text and dates go in single quotes; double quotes are for names.
- Text comparison is case-sensitive and alphabetical.
- Check the boundary: `>=` and `>` differ by one value, and that is where mistakes hide.
