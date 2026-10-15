## Why you need it {#why}

In the previous lesson, "customers from China or Japan" became `country = 'China' OR country = 'Japan'`. What about five countries? Or "products priced between 20 and 40 dollars", or "products whose name starts with D"? You can build all of them from `=` and `<`, but the result is long and easy to get wrong.

SQL has dedicated forms for these three common conditions: `IN`, `BETWEEN` and `LIKE`.

## Core idea {#core}

**`IN`: one of the values in a list.**

```sql run
SELECT name, country
FROM customers
WHERE country IN ('Canada', 'France', 'Italy');
```

`x IN (a, b, c)` is shorthand for `x = a OR x = b OR x = c`, and `NOT IN` means "none of the values in the list".

**`BETWEEN`: within a range, both ends included.**

```sql run
SELECT name, price
FROM products
WHERE price BETWEEN 22 AND 42;
```

`x BETWEEN a AND b` equals `x >= a AND x <= b`. Both 22.00 and 42.00 are in the result.

**`LIKE`: text that has a certain shape.** This is {{term:pattern-matching}}, and the pattern can use two {{term:wildcard|wildcards}}:

- `%` matches any number of characters, including none.
- `_` matches exactly one character.

```sql run
SELECT name
FROM products
WHERE name LIKE 'D%';
```

`'D%'` means "starts with D, followed by anything". Note that `LIKE` must match the whole text: the pattern `'D'` matches only text that is exactly D. To find a word anywhere inside, put `%` at both ends.

## Syntax {#syntax}

All three forms are a `condition`: they go straight into `WHERE`, or combine with other conditions through `AND` and `OR`:

```syntax
expression [ NOT ] IN ( value [, …] )
expression [ NOT ] BETWEEN [ SYMMETRIC ] low AND high
string [ NOT ] { LIKE | ILIKE } pattern [ ESCAPE escape_character ]
```

| Part | What goes there | Optional? |
|---|---|---|
| `expression` | The value being tested, usually a column | No |
| `value [, …]` | One or more values, separated by commas, the whole list in parentheses | At least one |
| `low`, `high` | The lower and upper bound, both included | No |
| `string` | The text being tested, usually a text column | No |
| `pattern` | Text with wildcards, in single quotes | No |
| `NOT` | Negates the whole condition | Yes |
| `SYMMETRIC` | Lets `BETWEEN` swap the bounds when needed (see Going deeper) | Yes |
| `ESCAPE escape_character` | Sets the escape character (see Going deeper) | Yes; the default is a backslash |

The `AND` in `BETWEEN low AND high` belongs to `BETWEEN`; it is not the logical `AND` from the previous lesson. The database tells them apart: `price BETWEEN 22 AND 42 AND stock > 20` means "priced from 22 to 42, and more than 20 in stock".

Some conditions, read against the shapes:

- `country IN ('Canada', 'France', 'Italy')`: three `value`s.
- `country NOT IN ('China', 'Japan')`: with the optional `NOT`.
- `name ILIKE '%pen%'`: `ILIKE` picked from `{ LIKE | ILIKE }`, with no `ESCAPE`.

## Example {#example}

Task: which customers have an email address in which the character just before `@` is the letter d?

1. **Describe the shape in words.** Anything at the start, then `d`, immediately followed by `@`, then anything.
2. **Translate the words into wildcards.** "Anything" is `%`.
3. **Write the whole pattern.** `'%d@%'`.

```sql run
SELECT name, email
FROM customers
WHERE email LIKE '%d@%';
```

Only Emma Dubois's `emma.d@example.com` fits. To require `.d` before the `@`, the pattern would be `'%.d@%'`.

## Variations {#variants}

**`_` matches one character.** Product names whose second letter is e:

```sql run
SELECT name
FROM products
WHERE name LIKE '_e%';
```

**Ignoring case: `ILIKE`.** `LIKE` is case-sensitive, so `'%pen%'` misses Fountain Pen. PostgreSQL offers `ILIKE`, which ignores case:

```sql run
SELECT name
FROM products
WHERE name ILIKE '%pen%';
```

`ILIKE` is not part of standard SQL; it is a PostgreSQL extension. Elsewhere the usual approach is to lower-case both sides before comparing, with the `lower()` function you will meet in chapter 2.

**An `IN` list of numbers.** The previous lesson's example, rewritten with `IN`, no longer needs parentheses to manage precedence:

```sql run
SELECT name, category_id, price
FROM products
WHERE category_id IN (1, 2) AND price < 50;
```

The result is the same 3 rows as the parenthesised version. `IN` is one complete condition, so `AND` cannot split it apart.

**`BETWEEN` with dates.** Customers who joined in the first half of 2023:

```sql run
SELECT name, joined_on
FROM customers
WHERE joined_on BETWEEN '2023-01-01' AND '2023-06-30';
```

`joined_on` is a date with no time of day, so including both ends is exactly right: someone who joined on 30 June counts. Timestamps, which carry a time, are another matter; see Going deeper.

**`NOT IN`, `NOT BETWEEN`, `NOT LIKE`.** A leading `NOT` negates each of them:

```sql run
SELECT name, country
FROM customers
WHERE country NOT IN ('China', 'Japan');
```

## Going deeper {#deeper}

**`BETWEEN` and timestamps.** `BETWEEN` includes both ends, and with data that carries a time of day that causes surprises. As a timestamp, `'2024-06-28'` means midnight at the start of 28 June, so this query misses order 24, placed on the morning of 28 June:

```sql run
SELECT id, ordered_at
FROM orders
WHERE ordered_at BETWEEN '2024-06-01' AND '2024-06-28';
```

The dependable form is "at or after the start, before the day after the end":

```sql run
SELECT id, ordered_at
FROM orders
WHERE ordered_at >= '2024-06-01' AND ordered_at < '2024-06-29';
```

This half-open range works for dates and timestamps alike, with no need to worry about the last second of the day.

**The ends of `BETWEEN` have an order.** `price BETWEEN 42 AND 22` finds nothing, because it means `price >= 42 AND price <= 22`. Put the smaller value first. (PostgreSQL also has `BETWEEN SYMMETRIC`, which swaps the ends if needed.)

**Matching `%` and `_` themselves.** If the text you are looking for contains `%` or `_`, put a backslash before it: `LIKE '%\_%'` finds text containing an underscore.

**Regular expressions.** `LIKE` has only two wildcards, which limits what it can describe. PostgreSQL also offers the `~` operator, which matches text against a {{term:regular-expression}}: `name ~ '^[A-D]'` finds names starting with A to D. Standard SQL also has `SIMILAR TO`, somewhere between the two and rarely used. Regular expressions are beyond this course; it is enough to know the tool exists.

**`NOT IN` and NULL.** If the list contains a NULL, `NOT IN` returns no rows at all. The reason will make sense after the next lesson on NULL; for now, never put NULL in a `NOT IN` list.

## Common mistakes {#mistakes}

**1. A `LIKE` pattern with no wildcard.** `name LIKE 'Pen'` matches only a name that is exactly Pen. To find names containing Pen, write `'%Pen%'`.

**2. Assuming `LIKE` ignores case.** In MySQL and SQLite, `LIKE` ignores the case of English letters by default; in PostgreSQL it does not:

```sql run
SELECT name
FROM products
WHERE name LIKE '%pen%';
```

0 rows. To ignore case, use `ILIKE`.

**3. `BETWEEN` for the end of a timestamp range.** See Going deeper: `BETWEEN '2024-06-01' AND '2024-06-28'` excludes everything after midnight on the 28th.

**4. Wildcards with `=`.** `name = 'D%'` looks for a product literally called `D%`. Wildcards only work with `LIKE` and `ILIKE`.

**5. An `IN` list without parentheses or quotes.** `country IN 'China', 'Japan'` is a syntax error. Quote each text value and wrap the whole list in parentheses: `IN ('China', 'Japan')`.

**6. Wildcards in an `IN` list.** `name IN ('D%')` looks for a product literally called `D%` and returns 0 rows. As with mistake 4, wildcards only work with `LIKE` and `ILIKE`.

**7. Replacing the `AND` in `BETWEEN`.** `price BETWEEN 22 OR 42` is a syntax error. The shape of `BETWEEN` is fixed as `BETWEEN low AND high`; that `AND` cannot become `OR` or a comma.

## Summary {#summary}

- `x IN (a, b, c)` is shorthand for a chain of `OR`s; `NOT IN` means not in the list.
- `x BETWEEN a AND b` includes both ends; put the smaller value first.
- `LIKE` matches the whole text with `%` (any characters) and `_` (one character); in PostgreSQL it is case-sensitive, and `ILIKE` is not.
- For a range of timestamps, use `>= start AND < day after end` rather than `BETWEEN`.
