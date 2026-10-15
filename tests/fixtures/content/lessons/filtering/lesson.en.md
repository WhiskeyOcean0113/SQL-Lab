## Why you need it {#why}
You rarely want every {{term:row}}.

## Core idea {#core}
`WHERE` keeps only the {{term:row|rows}} where the condition is true.

## Example {#example}
```sql run
SELECT name, age FROM pets WHERE age > 2;
```

## Common mistakes {#mistakes}
- Testing for NULL with `= NULL`.

## Summary {#summary}
- `WHERE` filters rows.
