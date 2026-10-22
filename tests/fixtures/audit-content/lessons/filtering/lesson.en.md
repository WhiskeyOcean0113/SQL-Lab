## Why you need it {#why}

`items` holds 5 products. How do you see only the cheap ones?

## Core idea {#core}

`WHERE` evaluates a condition once per {{term:row}} and keeps the rows where it is true.

```sql run
SELECT name, price FROM items WHERE price < 10;
```

Chapter 1 will cover sorting. MySQL writes it the same way.

## Going deeper {#deeper}

`AND` joins two comparisons; a row stays only when both are true. A comparison with a missing value is neither true nor false, so such rows do not stay either. Remember this when you handle missing data.

## Common mistakes {#mistakes}

**1. Writing the condition before `FROM`.** The order of clauses is fixed.

## Summary {#summary}

- `WHERE` keeps only the rows where the condition is true.
