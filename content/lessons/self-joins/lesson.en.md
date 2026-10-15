## Why you need it {#why}

"Who referred each customer?" Chapter 0 showed that `customers.referred_by` is a {{term:self-reference}}: it stores the referrer's customer id, and the referrer is in `customers` too.

```sql run
SELECT id, name, referred_by
FROM customers
ORDER BY id;
```

Kenji Sato's `referred_by` is 1, but who is 1? Turning the id into a name means looking in the same table a second time. Every join so far connected two different tables; this time both sides are the same one.

## Core idea {#core}

A {{term:self-join}} joins a table to itself. The syntax is nothing new; the key is **using one table as if it were two**: give it two different {{term:alias|aliases}}, each standing for one role.

```sql run
SELECT c.name AS customer, r.name AS referred_by
FROM customers AS c
JOIN customers AS r ON r.id = c.referred_by
ORDER BY c.id;
```

`c` is "the referred customer" and `r` is "the referrer". Read the join condition as: the referrer's id equals the referrer id this customer recorded. The database reads `customers` twice and pairs the rows as if they were two tables.

Eight rows: 4 of the 12 customers have a NULL `referred_by`, find no partner in the inner join, and are dropped.

The aliases are required. With both sides called `customers`, the database could not tell which side `customers.id` means.

## Example {#example}

Task: list every customer with the name of their referrer, including customers nobody referred.

1. **Name the two roles.** `c` is the customer, `r` the referrer.
2. **Write the join condition.** `c.referred_by` points at the referrer's `id`: `r.id = c.referred_by`. The direction of the condition decides who is who; written the other way round, it means something else entirely.
3. **Decide who is kept.** Every customer must appear, so use the previous lesson's `LEFT JOIN`.
4. **Tell the same-named columns apart.** Both sides have `name`; alias them `customer` and `referred_by`.

```sql run
SELECT c.name AS customer, r.name AS referred_by
FROM customers AS c
LEFT JOIN customers AS r ON r.id = c.referred_by
ORDER BY c.id;
```

Twelve rows; Lin Wei, Ava Thompson, Priya Nair and Lucas Silva have a NULL referrer.

## Variations {#variants}

**The other way round: how many customers each referrer brought in.** Same direction, now grouped by referrer and counted with chapter 3's `GROUP BY`:

```sql run
SELECT r.name AS referrer, count(*) AS referrals
FROM customers AS c
JOIN customers AS r ON r.id = c.referred_by
GROUP BY r.id, r.name
ORDER BY referrals DESC, r.name;
```

**One more step along the chain.** The referrer's referrer: join `customers` once more, under a third alias:

```sql run
SELECT c.name AS customer, r.name AS referrer, rr.name AS referrers_referrer
FROM customers AS c
JOIN customers AS r ON r.id = c.referred_by
JOIN customers AS rr ON rr.id = r.referred_by;
```

To follow the chain all the way to its start, when the number of steps is not fixed, you need chapter 6's recursive CTEs.

**Pairing rows of the same table.** A self join need not follow a foreign key. Which pairs of customers live in the same city?

```sql run
SELECT a.name, b.name, a.city
FROM customers AS a
JOIN customers AS b ON a.city = b.city AND a.id < b.id
ORDER BY a.city;
```

Three pairs. `a.id < b.id` does two jobs: it removes each customer's pairing with themselves, and it makes each pair appear once.

## Going deeper {#deeper}

**Why `a.id < b.id`?** With only `a.city = b.city`, every customer pairs with themselves, and each pair of customers appears twice, as (A, B) and (B, A):

```sql run
SELECT count(*) AS pairs
FROM customers AS a
JOIN customers AS b ON a.city = b.city;
```

Sixteen rows: the 10 customers with a known city pair once with themselves, and the 3 pairs appear twice each. `a.id <> b.id` removes the self-pairs but still leaves two rows per pair, 6 in all; `a.id < b.id` gives 3. The two customers with a NULL city never pair, not even with themselves, because `NULL = NULL` is not true.

**Comparing two rows of the same table.** Put a condition in `WHERE` and you can compare the two rows of each pair. Customers who live in the same country as their referrer:

```sql run
SELECT c.name AS customer, r.name AS referrer, c.country
FROM customers AS c
JOIN customers AS r ON r.id = c.referred_by
WHERE c.country = r.country;
```

**Self joins are everywhere.** Employees and managers, categories and parent categories, the departure and arrival cities of a flight: whenever a column points into its own table, or two rows of one table must be compared side by side, a self join is the tool.

## Common mistakes {#mistakes}

**1. No aliases.**

```sql run error
SELECT name
FROM customers
JOIN customers ON customers.id = customers.referred_by;
```

PostgreSQL reports `table name "customers" specified more than once`. When a table appears twice, two different aliases must tell the occurrences apart.

**2. The same alias on both sides.** `ON c.id = c.referred_by` is valid syntax but asks "which customer referred themselves". The result is zero rows, and there is no error. The two sides of the condition must come from different aliases.

**3. The direction reversed.** `ON r.referred_by = c.id` runs too, but now `r` is someone `c` referred, and `SELECT c.name, r.name` lists "referrer → referred". Before writing, state in one sentence who each alias stands for, then check the condition says the same.

**4. Duplicate pairs, or pairs with oneself.** Forget `a.id < b.id` when pairing, and the result contains self-pairs and every pair twice.

**5. Forgetting customers without a referrer in an inner join.** `JOIN` drops rows whose `referred_by` is NULL. When the task says "every customer", use `LEFT JOIN`.

## Summary {#summary}

- A self join joins a table to itself; give the table two aliases, each standing for one role.
- Along a self-referencing foreign key, the condition's direction decides who is who: `r.id = c.referred_by` means `r` referred `c`.
- To keep rows with no counterpart, use `LEFT JOIN`; to go one level further, join the table once more.
- When pairing rows, `a.id < b.id` removes self-pairs and makes each pair appear once.
- Missing aliases give an error; the same alias on both sides of the condition gives no error but the wrong meaning.
