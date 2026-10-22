## Why you need it {#why}

Chapter 0 found the cheap items. A question like "how many items are in each category?" needs the {{term:row|rows}} put into groups first.

## Core idea {#core}

`GROUP BY` puts rows with the same value in a column (or an {{term:expression}}) into one group, and each group yields one row. The {{term:aggregate-function}} `count(*)` counts within each group. After grouping, `SELECT` may contain only the grouping columns and aggregates: each group is down to one row, and another column may hold several different values in it.

```sql run
SELECT price > 50 AS pricey, count(*) AS n FROM items GROUP BY price > 50;
```

```check
query: |
  SELECT price > 50 AS pricey, count(*) AS n FROM items GROUP BY price > 50;
question: How many rows does this query return?
choices: ['1', '2', '5']
answer: 1
explain: Prices fall on either side of 50, so there are two groups.
verify: { rows: 2 }
```

## Example {#example}

```steps
- sql: |
    SELECT name, price > 50 AS pricey FROM items;
  say: First see which group each row belongs to.
  group: pricey
- sql: |
    SELECT price > 50 AS pricey, count(*) AS n FROM items GROUP BY price > 50;
  say: After grouping, each group is one row.
```

```check
query: |
  SELECT category FROM items GROUP BY category;
question: How many rows does this query return?
choices: ['2', '3', '5']
answer: 1
explain: Two categories, plus one group for NULL, make three.
verify: { rows: 3 }
```

## Going deeper {#deeper}

All NULLs go into one group. MySQL does the same.

## Common mistakes {#mistakes}

**1. A column in `SELECT` that is not grouped.** The database reports an error.

**2. Expecting NULLs to be dropped.** They form a group of their own.

## Summary {#summary}

- `GROUP BY` yields one row per group.
- NULL forms a group of its own.

## Reference {#reference}

SQLite also puts all NULLs into one group.
