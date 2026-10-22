## Why you need it {#why}

Which item is the cheapest?

## Core idea {#core}

`ORDER BY` sets the order of the result. MySQL writes it the same way.

```check
query: |
  SELECT name FROM items ORDER BY price;
question: How many rows does this query return? Does sorting change the number of rows?
choices: ['1', '5']
answer: 1
explain: Five. Sorting changes only the order of the rows, never their number.
verify: { rows: 5 }
```

## Example {#example}

```steps
- sql: |
    SELECT name, category FROM items;
  say: First the original order.
- sql: |
    SELECT name, category FROM items ORDER BY category NULLS FIRST;
  say: NULLs come first.
```

## Going deeper {#deeper}

Sorting is ascending by default; descending takes a keyword after the column. NULLs sort last in ascending order and first in descending order, and you can say where they go. The next lesson shows how to keep only the first few rows.

## Common mistakes {#mistakes}

**1. Forgetting `BY`.** A syntax error.

**2. Expecting a fixed order without `ORDER BY`.** There is none.

**3. Writing `ORDER BY` before `WHERE`.** The order is reversed.

## Summary {#summary}

- `ORDER BY` sets the order.
