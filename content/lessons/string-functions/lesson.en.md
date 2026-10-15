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

## Syntax {#syntax}

The concatenation operator and this lesson's string functions:

```syntax
string || string
upper(string)
lower(string)
length(string)
left(string, n)
right(string, n)
substring(string FROM start [ FOR count ])
position(search IN string)
split_part(string, delimiter, field)
replace(string, from_text, to_text)
trim([ LEADING | TRAILING | BOTH ] [ characters FROM ] string)
concat(value [, …])
concat_ws(separator, value [, …])
```

| Placeholder | What goes there |
|---|---|
| `string` | A piece of text: a text column, a literal, or another function that returns text |
| `n`, `start`, `count`, `field` | Integers. Positions count from 1 |
| `search` | The text to look for |
| `delimiter` | The separator to split on, such as `'@'` |
| `from_text`, `to_text` | The text to replace and its replacement |
| `characters` | The characters to strip; spaces if omitted |
| `value` | Any value; numbers are turned into text |
| `separator` | What goes between the pieces |

Look closely at `substring`, `position` and `trim`: inside the parentheses they use keywords such as `FROM`, `FOR`, `IN` and `LEADING` instead of commas. The SQL standard gives these few functions their own shape, which reads like an English phrase: `position('@' in email)` is "the position of @ in email". Every other function is a plain "name(argument, argument)".

Because a `string` can be another function, functions nest. Read them from the inside out:

- `upper(left(name, 3))`: take the first 3 characters of the name, then capitalise them.
- `substring(email FROM position('@' IN email) + 1)`: find the `@`, add 1, and cut from there to the end, which leaves the domain.

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

**Stripping characters: `trim` in full.** By default it strips spaces from both ends; `LEADING` strips only the start and `TRAILING` only the end; and you can name the characters to strip:

```sql run
SELECT '[' || trim('  a  ') || ']' AS both_ends,
       '[' || trim(LEADING '  a  ') || ']' AS leading_only,
       trim(BOTH '-' FROM '--a--') AS dashes;
```

The brackets are concatenated on so you can see where spaces remain.

**Standard forms and comma forms.** PostgreSQL also accepts plain comma forms: `substring('SQL Pocket Guide', 5, 6)` equals `substring('SQL Pocket Guide' FROM 5 FOR 6)`, and `strpos(string, search)` equals `position(search IN string)`, with the arguments the other way round. With `FROM` and no `FOR`, the cut runs to the end:

```sql run
SELECT email,
       substring(email FROM position('@' IN email) + 1) AS domain,
       strpos(email, '@') AS at_sign
FROM customers;
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

**An empty string is not NULL.** As the NULL lesson in Chapter 1 noted, `''` is a string of length 0 and `'' IS NULL` is false; only Oracle treats the two as one. So `length('')` is 0, while `length(NULL)` is NULL.

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

**4. A comma where the standard form wants a keyword.** `position('@', email)` fails with `syntax error at or near ","`. The shape of `position` is `position(search IN string)`; for commas, use `strpos(email, '@')`, and note that the arguments swap places too.

**5. Lower-casing only one side.** `lower(country) = 'China'` never matches, because the left side is now all lower case. Both sides must agree.

## Summary {#summary}

- `||` joins text, numbers included; `+` does not.
- Everyday functions: `upper`, `lower`, `length`, `left`, `right`, `substring`, `position`, `split_part`, `replace`, `trim`.
- String positions count from 1.
- If any piece is NULL, `||` gives NULL; `concat_ws` skips NULLs.
- For case-insensitive comparison, apply `lower()` to both sides.
