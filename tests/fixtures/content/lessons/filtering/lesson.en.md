## Why you need it {#why}
You rarely want every {{term:row}}.

## Core idea {#core}
`WHERE` keeps only the {{term:row|rows}} where the condition is true.

```steps
- sql: |
    SELECT name, age FROM pets ORDER BY age;
  say: All three {{term:row|rows}}, sorted by age. Rows with the same age form a group.
  group: age
- sql: |
    SELECT name, age FROM pets WHERE age > 2 ORDER BY age;
  say: WHERE keeps the rows where `age > 2` is true. Bean, whose age is NULL, is gone.
```

```check
query: |
  SELECT name FROM pets WHERE age > 2;
question: How many {{term:row|rows}} does this query return?
choices: ['1', '2', '3']
answer: 1
explain: Bean's age is NULL, and `NULL > 2` is not true, so only Mochi and Tofu remain.
verify: { rows: 2 }
```

## Example {#example}
```sql run
SELECT name, age FROM pets WHERE age > 2;
```

## Common mistakes {#mistakes}
- Testing for NULL with `= NULL`.

## Summary {#summary}
- `WHERE` filters rows.

## Reference {#reference}
- In standard SQL a condition is true, false or unknown, and `WHERE` keeps only the rows where it is true.
