## Why you need it {#why}

Customer service wants a contact list with each line reading "Lin Wei (China)". Marketing wants to know which domain each customer's email comes from. And someone needs the customers whose country is china without being sure whether the data stores it in upper or lower case.

All of these reshape {{term:string|strings}}, and SQL has a set of string functions for the job.

## Core idea {#core}

**`||` joins text.** Putting pieces of text together is {{term:concatenation}}:

```sql run
SELECT name || ' (' || country || ')' AS label
FROM customers;
```

**A function is computed once per row.** The most common ones:

| Function | Does | Example → result |
|---|---|---|
| `upper(s)` / `lower(s)` | upper / lower case | `lower('China')` → `china` |
| `length(s)` | number of characters | `length('Lin Wei')` → 7 |
| `left(s, n)` / `right(s, n)` | first / last n characters | `left('SQL Pocket Guide', 3)` → `SQL` |
| `substring(s from i for n)` | n characters from position i | → `Pocket` |
| `position(t in s)` | where t first occurs | `position('@' in 'ava.t@example.com')` → 6 |
| `split_part(s, separator, k)` | split on a separator, take piece k | → `example.com` |
| `replace(s, old, new)` | replace every occurrence | |
| `trim(s)` | strip spaces from both ends | |

Positions count from 1, not 0.

**NULL meets `||`, and the result is NULL.** Just as in arithmetic: if any piece is NULL, the whole concatenation is NULL.

## Example {#example}

Task: list the username part (before `@`) and the domain part (after `@`) of each customer's email.

1. **Find the boundary.** `@` splits the address in two.
2. **Choose the function.** Splitting on a separator is exactly what `split_part` does.
3. **Take piece 1 and piece 2**, and name them.
4. **Leave out customers without an email.** Their results would be NULL.

```sql run
SELECT name,
       split_part(email, '@', 1) AS username,
       split_part(email, '@', 2) AS domain
FROM customers
WHERE email IS NOT NULL;
```

Every shop address is at example.com. To find where the `@` is, use `position('@' in email)`.

## Variations {#variants}

**Case-insensitive comparison.** Convert both sides to the same case first:

```sql run
SELECT name, country
FROM customers
WHERE lower(country) = 'china';
```

This works in every database; PostgreSQL's `ILIKE` only covers `LIKE`-style pattern matching.

**Cutting and replacing.**

```sql run
SELECT substring('SQL Pocket Guide' from 5 for 6) AS middle,
       left('SQL Pocket Guide', 3) AS first_three,
       right('SQL Pocket Guide', 5) AS last_five,
       replace('SQL Pocket Guide', 'Pocket', 'Field') AS replaced;
```

**Putting numbers into text.** `||` also joins numbers, and the result is text:

```sql run
SELECT name || ' ($' || price || ')' AS label
FROM products;
```

## Going deeper {#deeper}

**`concat` and `concat_ws` skip NULL.** Where `||` turns the whole result NULL, `concat()` treats NULL as an empty string, and `concat_ws(separator, …)` joins with a separator and leaves NULLs out:

```sql run
SELECT name, city,
       name || ', ' || city AS with_bars,
       concat(name, ', ', city) AS with_concat,
       concat_ws(', ', name, city) AS with_concat_ws
FROM customers;
```

Liam O'Brien's city is NULL: `||` gives NULL, `concat` leaves a dangling comma, and `concat_ws` cleanly leaves just the name.

**An empty string is not NULL.** In PostgreSQL, `''` is a string of length 0, and `'' IS NULL` is false. Oracle treats `''` as NULL; watch for this when moving between databases.

**Length counts characters.** `length('数据库')` is 3. For bytes use `octet_length`, which gives 9 for those same three Chinese characters.

**`+` does not join text.** SQL Server joins strings with `+`, but standard SQL and PostgreSQL use `||`.

## Common mistakes {#mistakes}

**1. Joining with `+`.**

```sql run error
SELECT name + ' (' + country + ')' AS label
FROM customers;
```

`operator does not exist: text + unknown`. PostgreSQL's concatenation operator is `||`.

**2. Forgetting that NULL wipes out a concatenation.** Building labels with `||`, a customer with a NULL city gets a NULL label. To keep the other parts, use `concat_ws`, or the `COALESCE` coming up in this chapter's fourth lesson.

**3. Counting positions from 0.** `substring(s from 0 for 3)` returns only 2 characters. SQL string positions start at 1.

**4. Lower-casing only one side.** `lower(country) = 'China'` never matches, because the left side is now all lower case. Both sides must agree.

## Summary {#summary}

- `||` joins text, numbers included; `+` does not.
- Everyday functions: `upper`, `lower`, `length`, `left`, `right`, `substring`, `position`, `split_part`, `replace`, `trim`.
- String positions count from 1.
- If any piece is NULL, `||` gives NULL; `concat_ws` skips NULLs.
- For case-insensitive comparison, apply `lower()` to both sides.
