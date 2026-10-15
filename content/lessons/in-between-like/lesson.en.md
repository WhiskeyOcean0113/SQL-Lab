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

## Summary {#summary}

- `x IN (a, b, c)` is shorthand for a chain of `OR`s; `NOT IN` means not in the list.
- `x BETWEEN a AND b` includes both ends; put the smaller value first.
- `LIKE` matches the whole text with `%` (any characters) and `_` (one character); in PostgreSQL it is case-sensitive, and `ILIKE` is not.
- For a range of timestamps, use `>= start AND < day after end` rather than `BETWEEN`.
