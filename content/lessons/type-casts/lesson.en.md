## Why you need it {#why}

Types have come up again and again in this chapter: `stock / 3` lost its fraction because both sides were integers, a CASE failed when one branch was text and another a number, and `'9' > '10'` compared alphabetically.

Every value has a type, and operations and comparisons need matching types. This lesson is about explicitly turning a value of one type into another, a {{term:type-cast}}.

## Core idea {#core}

There are two spellings, and they do exactly the same thing:

```sql
CAST(value AS type)   -- standard SQL
value::type           -- PostgreSQL shorthand
```

```sql run
SELECT CAST('42' AS integer) + 1 AS standard_form,
       '42'::integer + 1 AS short_form,
       '2024-03-01'::date + 1 AS next_day;
```

**A cast can fail.** The text must really read as the target type, or you get an error: `'abc'::integer` fails with `invalid input syntax for type integer`.

**Decimals round when cast to integers.** `19.99::integer` is 20 and `55.50::integer` is 56; they are not truncated.

**When the database converts for you.** A quoted literal starts out without a settled type, and PostgreSQL decides what it is from the context. That is why `'2024-07-01' - joined_on` computes days directly and `'3' + 4` equals 7. This is an {{term:implicit-cast}}. A column whose type is already `text`, however, is never quietly turned into a number; that conversion you must write yourself.

## Example {#example}

Task: give every order a reference of the form "customer id-order id", such as `1-4`.

1. **List the pieces to join.** `customer_id`, a hyphen, `id`.
2. **Check the types.** Both ids are integers; the hyphen is text.
3. **Decide whether to convert.** `||` can join numbers and text directly, but writing `::text` makes the intent obvious and avoids any confusion with arithmetic.
4. **Join and name it.**

```sql run
SELECT id, customer_id, customer_id::text || '-' || id::text AS reference
FROM orders;
```

## Variations {#variants}

**Integer to exact decimal, to avoid integer division.** Convert `stock` to `numeric` before dividing:

```sql run
SELECT name, stock, round(stock::numeric / 3, 2) AS per_share
FROM products;
```

**Prices rounded to whole dollars.**

```sql run
SELECT name, price, CAST(price AS integer) AS whole_dollars
FROM products;
```

**Formatted text to and from numbers and dates.** `to_char`, `to_number` and `to_date` describe the shape of the text with a format template:

```sql run
SELECT to_char(1234.5, 'FM9,999.00') AS formatted,
       to_number('1,234.50', '9,999.99') AS parsed_number,
       to_date('05/03/2024', 'DD/MM/YYYY') AS parsed_date;
```

The template gives the ambiguous `05/03/2024` a definite meaning: here, 5 March.

## Going deeper {#deeper}

**Where you cast matters.** `(stock / 3)::numeric` does the integer division first and converts afterwards, by which time the fraction is gone:

```sql run
SELECT (25 / 3)::numeric AS too_late, 25::numeric / 3 AS in_time;
```

`::` binds very tightly, so `25::numeric / 3` converts 25 and then divides. Put the cast before the operation.

**Two steps when one will not do.** `'42.0'::integer` fails because `42.0` is not how an integer is written. Going through `numeric` works: `'42.0'::numeric::integer` gives 42.

**PostgreSQL is stricter than some databases.** MySQL quietly evaluates `'abc' + 1` as 1, reading unrecognised text as 0. PostgreSQL would rather fail than guess. That feels fussy at first, but it surfaces problems in the data early.

**Booleans.** `true::integer` is 1, and `'yes'::boolean`, `'t'::boolean` and `1::boolean` are all true.

## Common mistakes {#mistakes}

**1. Casting in the wrong place.** See Going deeper: `round((stock / 3)::numeric, 2)` is no better than not casting and still gives 8.00. The cast must wrap a number that takes part in the division.

**2. Casting text with a decimal point straight to integer.**

```sql run error
SELECT '42.0'::integer;
```

Go through `numeric` first.

**3. Expecting PostgreSQL to treat a text column as a number.** Adding a number to a `text` column fails with `operator does not exist`. Data that should be numeric is best stored as a numeric type; for a one-off, cast explicitly.

**4. Comparing numbers as text.** Chapter 1's `'9' > '10'` is true. Convert to numbers before comparing, or store numbers as numbers in the first place.

**5. Expecting decimal-to-integer to truncate.** `19.99::integer` is 20. To truncate, use `trunc(19.99)`.

## Summary {#summary}

- `CAST(x AS type)` is the standard form and `x::type` the PostgreSQL shorthand.
- A cast checks its input and fails if it cannot read it; decimals round when cast to integers.
- Quoted literals take their type from context; columns that already have a type are never silently converted.
- Cast before the operation: `stock::numeric / 3`, not `(stock / 3)::numeric`.
- `to_char`, `to_number` and `to_date` handle formatted text with a template.
