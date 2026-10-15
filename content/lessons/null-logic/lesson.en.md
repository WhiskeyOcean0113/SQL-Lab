## Why you need it {#why}

shop has 12 customers, 2 of whom live in Shanghai. So how many customers do not live in Shanghai?

```sql run
SELECT name, city
FROM customers
WHERE city <> 'Shanghai';
```

8, not 10. Liam O'Brien and Lucas Silva are missing because their `city` is {{term:null}}. No error, no warning: two rows simply vanish. NULL is one of the most confusing ideas in SQL, and this lesson takes it apart.

## Core idea {#core}

NULL means "unknown" or "no value". The crucial point: **comparing anything with NULL gives neither true nor false, but unknown.**

- `'Shanghai' <> NULL` is unknown: if the city is unknown, you cannot say it is not Shanghai.
- `NULL = NULL` is unknown too: whether two unknown values are equal is itself unknown.

So SQL logic has not two values (true, false) but three: {{term:three-valued-logic}} with true, false and unknown.

**`WHERE` keeps only rows where the condition is true.** False and unknown are both dropped. That is why the two customers above disappeared.

To test whether a value is NULL you cannot use `=`. Use the dedicated `IS NULL` and `IS NOT NULL`, which only ever return true or false:

```sql run
SELECT name, email
FROM customers
WHERE email IS NULL;
```

## Syntax {#syntax}

The conditions built for NULL:

```syntax
expression IS [ NOT ] NULL
expression IS [ NOT ] DISTINCT FROM expression
condition IS [ NOT ] { TRUE | FALSE | UNKNOWN }
```

| Shape | True when | Can it be unknown? |
|---|---|---|
| `expression IS NULL` | The value is NULL | No |
| `expression IS NOT NULL` | The value is not NULL | No |
| `a IS DISTINCT FROM b` | The two differ; NULL against a value counts as different, and two NULLs count as the same | No |
| `a IS NOT DISTINCT FROM b` | The two are the same, two NULLs included | No |
| `condition IS TRUE` | The condition is true | No |
| `condition IS UNKNOWN` | The condition is unknown | No |

What they share is the last column: the result is only ever true or false, never unknown. In `WHERE`, they always behave predictably.

Mind the spelling: `IS NULL` is one unit, and `NULL` here is a keyword without quotes. `NOT` goes after `IS`: `IS NOT NULL`.

Some conditions, read against the shapes:

- `email IS NULL`: the first line, without `NOT`.
- `city IS DISTINCT FROM 'Shanghai'`: the second line, with a literal as the right-hand `expression`.
- `(city <> 'Shanghai') IS NOT FALSE`: the third line, where the `condition` is a comparison, with `FALSE` picked and `NOT` added.

## Example {#example}

Task: which orders have been placed or paid for but not yet shipped? (Cancelled orders do not count.)

1. **Find the column that means "not shipped yet".** A NULL `shipped_at` means there is no shipping time yet.
2. **Test it with `IS NULL`, not `= NULL`.**
3. **Exclude cancelled orders.** Cancelled orders also have a NULL `shipped_at`, so they need a second condition.
4. **Combine with `AND`.**

```sql run
SELECT id, status, shipped_at
FROM orders
WHERE shipped_at IS NULL AND status <> 'cancelled';
```

8 orders, every one of them paid or pending.

**The {{term:truth-table}} for three values.** When a condition is unknown, `AND`, `OR` and `NOT` follow these rules (U stands for unknown):

| A | B | A AND B | A OR B |
|---|---|---|---|
| true | U | U | true |
| false | U | false | U |
| U | U | U | U |

`NOT U` is still U. To remember it, think of unknown as "could be true, could be false". `false AND U` is false whatever U turns out to be; `true OR U` is true whatever U is; every other case cannot be settled, so it stays unknown.

```sql run
SELECT NULL = NULL AS equal, NULL AND false AS and_false, NULL OR true AS or_true, 1 + NULL AS plus;
```

The last column shows that **arithmetic with NULL gives NULL.**

## Variations {#variants}

**Counting NULL as "not equal".** To get the customers who do not live in Shanghai, including those whose city is unknown, either write:

```sql run
SELECT name, city
FROM customers
WHERE city <> 'Shanghai' OR city IS NULL;
```

or use `IS DISTINCT FROM`, which compares NULL as if it were an ordinary value:

```sql run
SELECT name, city
FROM customers
WHERE city IS DISTINCT FROM 'Shanghai';
```

Both return 10 rows. `IS DISTINCT FROM` is part of standard SQL, and `IS NOT DISTINCT FROM` is the matching "equal, treating two NULLs as equal".

**Testing a condition's outcome: `IS NOT FALSE`.** "Customers not in Shanghai, counting those whose city is unknown" can also be put this way: keep the row unless "not in Shanghai" is false.

```sql run
SELECT name, city
FROM customers
WHERE (city <> 'Shanghai') IS NOT FALSE;
```

Again 10 rows. True and unknown are both "not false", so both stay. Here are the outcomes side by side:

```sql run
SELECT name,
       city,
       city <> 'Shanghai' AS not_shanghai,
       (city <> 'Shanghai') IS UNKNOWN AS is_unknown
FROM customers;
```

In the `not_shanghai` column, the two rows with a NULL city show NULL: that is what unknown looks like in a result. The `is_unknown` column holds only true and false.

**`IS NOT NULL`**: only rows that have a value.

```sql run
SELECT name, city
FROM customers
WHERE city IS NOT NULL;
```

## Going deeper {#deeper}

**`NOT IN` meets NULL.** The question left over from the last lesson:

```sql run
SELECT name, city
FROM customers
WHERE city NOT IN ('Shanghai', NULL);
```

0 rows. `city NOT IN ('Shanghai', NULL)` means `city <> 'Shanghai' AND city <> NULL`. The second half is always unknown, so the whole condition can at best be unknown and is never true. In chapter 5, a `NOT IN` over a subquery that returns a NULL falls into exactly the same trap.

**NULL, unique constraints and foreign keys.** Chapter 0 noted that a unique constraint allows several NULLs and that a foreign key column may be NULL. Same reason: two NULLs are not "equal".

**Why not `= NULL`.** The PostgreSQL manual says it plainly: do not write `expression = NULL`, because NULL is not "equal to" NULL. A compatibility setting, `transform_null_equals`, rewrites `= NULL` into `IS NULL` for old applications, but it is off by default and nothing should rely on it.

**NULL is not an empty string.** The empty string `''` is a definite value: text of length zero. NULL is the absence of a value. In PostgreSQL and standard SQL they are entirely different. Oracle is the exception: it treats an empty string as NULL, so in Oracle `WHERE city = ''` never finds a row.

**Replacing NULL with a default.** When displaying results, you often want NULL to show as something like "unknown". The `coalesce` function from Chapter 2 does exactly that: `coalesce(city, 'unknown')` returns `'unknown'` when `city` is NULL.

**NULL in other clauses.** In `ORDER BY`, PostgreSQL puts NULLs last in ascending order by default (next lesson); in `DISTINCT`, all NULLs count as one value (the lesson after); aggregate functions ignore NULLs (chapter 3). Each clause has its own rule; learn each where you meet it.

## Common mistakes {#mistakes}

**1. Looking for NULL with `= NULL`.** A habit from programming languages, and in SQL it finds nothing:

```sql run
SELECT name
FROM customers
WHERE email = NULL;
```

0 rows, no error. Always use `IS NULL`.

**2. Expecting `<>` to include NULL.** See the opening example: `city <> 'Shanghai'` leaves out customers whose city is unknown. If the question means to include them, add `OR city IS NULL` or use `IS DISTINCT FROM`.

**3. Treating NULL as 0 or an empty string.** A NULL `stock` is not "zero in stock" but "stock unknown". NULL plus any number is NULL, not that number.

**4. Putting NULL in a `NOT IN` list.** The result is always empty.

**5. Forgetting that NULL can appear at all.** Before writing a condition, ask whether the column can hold NULL. In a table definition, any column without a `NOT NULL` constraint can.

**6. Putting NULL in quotes.** `WHERE city = 'NULL'` looks for a city spelt N, U, L, L and returns 0 rows. `'NULL'` is a piece of text; `NULL` is the absence of a value, and testing for it takes `IS NULL`.

## Summary {#summary}

- NULL means unknown, and comparing anything with NULL gives unknown.
- SQL uses three-valued logic, true, false and unknown, and `WHERE` keeps only true.
- Test for NULL with `IS NULL` / `IS NOT NULL`, never `= NULL`.
- `<>` excludes NULL; add `OR ... IS NULL` or use `IS DISTINCT FROM` when you need it.
- A `NOT IN` list that contains NULL always gives an empty result.
