## Why you need it {#why}

Lin Wei is one of shop's earliest customers. Lin Wei referred some friends, and those friends referred friends of their own. Marketing asks: which customers did Lin Wei bring in, directly or indirectly?

Chapter 4's {{term:self-join}} goes one level at a time: one join finds the people Lin Wei referred, a second join finds the people they referred. You need as many joins as the chain has levels, and you do not know that number in advance; it will grow, too. Data nested level within level to an unknown depth is a {{term:hierarchy}}, and it needs a query that keeps walking on its own and stops when it runs out of road.

## Core idea {#core}

### Two parts: a start and a next step

A {{term:recursive-cte}} is two queries joined by `UNION ALL`:

- **The {{term:non-recursive-term}}** is the starting point and runs once, for example "Lin Wei."
- **The {{term:recursive-term}}** takes the rows found in the previous step and finds the next ones. It refers to the CTE's own name in its `FROM`, for example "the customers referred by the people found last step."

Start with the simplest case, counting from 1 to 5:

```sql run
WITH RECURSIVE n AS (
  SELECT 1 AS i
  UNION ALL
  SELECT i + 1 FROM n WHERE i < 5
)
SELECT i FROM n;
```

### Round after round

The database does not really "call itself"; it loops in rounds. The rows produced by the previous round sit in a {{term:working-table}}:

| Round | Rows in the working table | The recursive term produces |
|---|---|---|
| Start | | `1` (the non-recursive term) |
| Round 1 | `1` | `2` |
| Round 2 | `2` | `3` |
| Round 3 | `3` | `4` |
| Round 4 | `4` | `5` |
| Round 5 | `5` | No rows: `5 < 5` is false |

In each round, the `n` inside the recursive term means **only the rows the previous round produced**, not everything found so far. As soon as a round produces no rows, the loop stops. The final result is the rows of every round together: 1 to 5.

So the recursive term needs a condition that is bound to stop it eventually. Here it is `WHERE i < 5`; in a referral chain, it is reaching people who referred nobody.

## Syntax {#syntax}

```syntax
WITH RECURSIVE cte_name [ ( column_name [, …] ) ] AS (
    select_statement
    UNION [ ALL ]
    select_statement
)
select_statement
```

| Part | What goes there | Rule |
|---|---|---|
| `RECURSIVE` | A fixed keyword | Required as soon as any CTE in the `WITH` refers to itself; written once, right after `WITH` |
| The first `select_statement` | The non-recursive term: the start | May not refer to `cte_name`; its columns fix the names and types of the whole CTE |
| `UNION [ ALL ]` | Joins the two parts | Usually `UNION ALL`; `UNION` drops rows that duplicate rows already found |
| The second `select_statement` | The recursive term: the next step | Refers to `cte_name` once in its `FROM`; no aggregate functions; same number and types of columns as the start |
| The final `select_statement` | The main query | Reads from `cte_name`, as with any CTE |

The query in Core idea, read against the shape: `cte_name` is `n`; the start is `SELECT 1 AS i`, which makes the only column `i`, an integer; the recursive term `SELECT i + 1 FROM n WHERE i < 5` refers to `n`, and its `WHERE` makes it stop; the main query is `SELECT i FROM n`.

## Example {#example}

The question: every customer Lin Wei (customer 1) brought in, directly or indirectly, and how many levels away from Lin Wei each one is.

1. **Start: Lin Wei, at depth 0.** The non-recursive term selects customer 1 and adds a constant column `0 AS depth`.
2. **Next step: customers referred by the people of the last round.** Join `customers` to the CTE itself on `c.referred_by = r.id`: customer `c` was referred by someone `r` from the last round. Depth goes up by 1.
3. **When does it stop?** When a round reaches people who referred nobody, the join finds no rows and the loop ends by itself. No extra `WHERE` is needed here.
4. **The main query sorts by depth.**

```sql run
WITH RECURSIVE referrals AS (
  SELECT id, name, referred_by, 0 AS depth
  FROM customers
  WHERE id = 1
  UNION ALL
  SELECT c.id, c.name, c.referred_by, r.depth + 1
  FROM customers AS c
  JOIN referrals AS r ON c.referred_by = r.id
)
SELECT id, name, referred_by, depth
FROM referrals
ORDER BY depth, id;
```

Round 1 finds Kenji Sato and Chen Yu, round 2 finds Zhang Min and Mei Tanaka, and round 3 finds nobody. If the chain grows a third or fourth level later, this query needs no change at all.

## Variations {#variants}

**Walking up: one person's referral chain.** Turn the join condition round and you start from one person and climb to the referrer's referrer. How did Mei Tanaka (customer 12) arrive?

```sql run
WITH RECURSIVE chain AS (
  SELECT id, name, referred_by, 0 AS steps
  FROM customers
  WHERE id = 12
  UNION ALL
  SELECT c.id, c.name, c.referred_by, ch.steps + 1
  FROM customers AS c
  JOIN chain AS ch ON c.id = ch.referred_by
)
SELECT id, name, steps FROM chain ORDER BY steps;
```

Walking down is `c.referred_by = r.id` ("c's referrer is r"); walking up is `c.id = ch.referred_by` ("c is ch's referrer"). At Lin Wei, `referred_by` is NULL, the join finds nothing and the loop stops.

**Every starting point, with the path.** The start can be more than one row. Begin with every customer who has no referrer and build up the path walked so far as a string:

```sql run
WITH RECURSIVE tree AS (
  SELECT id, name, name AS path
  FROM customers
  WHERE referred_by IS NULL
  UNION ALL
  SELECT c.id, c.name, t.path || ' > ' || c.name
  FROM customers AS c
  JOIN tree AS t ON c.referred_by = t.id
)
SELECT path FROM tree ORDER BY path;
```

Sorting by `path` lays out the whole referral tree level by level, with each person directly below their referrer.

**Generating a sequence.** A recursive CTE need not read a table. Start at January 2024, add a month each round to build a calendar, then `LEFT JOIN` the orders so that months without orders show 0:

```sql run
WITH RECURSIVE months AS (
  SELECT DATE '2024-01-01' AS month
  UNION ALL
  SELECT (month + INTERVAL '1 month')::date
  FROM months
  WHERE month < DATE '2024-08-01'
)
SELECT m.month, count(o.id) AS orders
FROM months AS m
LEFT JOIN orders AS o ON date_trunc('month', o.ordered_at) = m.month
GROUP BY m.month
ORDER BY m.month;
```

In PostgreSQL, Chapter 4's `generate_series` does this more simply; other databases may lack that function, while a recursive CTE works everywhere.

## Going deeper {#deeper}

**The start fixes the column types.** Values computed by the recursive term must fit the types the start defined:

```sql run error
WITH RECURSIVE p AS (
  SELECT id, price FROM products WHERE id = 3
  UNION ALL
  SELECT id, price * 2 FROM p WHERE price < 100
)
SELECT * FROM p;
```

In the table, `price` is `numeric(8, 2)`, but `price * 2` is an unrestricted `numeric`, so the query fails with `column 2 has type numeric(8,2) in non-recursive term but type numeric overall`. The HINT gives the fix: cast in the start, writing `price::numeric`.

**What about a {{term:cycle}}?** shop's referrals never loop back. But if A referred B, B referred C and C "referred" A, `UNION ALL` would walk forever. Two defences:

- Use `UNION` instead of `UNION ALL`. Rows a new round produces that were already found are discarded, and when nothing new is left the loop stops. This works only if whole rows repeat; with a column such as `depth` that keeps growing, no row ever repeats and `UNION` does not help.
- From PostgreSQL 14, write `CYCLE id SET is_cycle USING path` after the CTE. The database records the path walked, stops when it returns to an `id` it has seen, and marks that row's `is_cycle` as true.

**A depth limit.** When you are unsure whether the data has a cycle, a depth limit in the recursive term, such as `WHERE r.depth < 20`, is the simplest insurance.

**Other databases.** `WITH RECURSIVE` is standard SQL, written the same way in MySQL 8.0 and SQLite. SQL Server leaves out `RECURSIVE` and writes just `WITH`; Oracle also has its own `CONNECT BY` syntax.

## Common mistakes {#mistakes}

**1. Forgetting `RECURSIVE`.**

```sql run error
WITH referrals AS (
  SELECT id, name FROM customers WHERE id = 1
  UNION ALL
  SELECT c.id, c.name
  FROM customers AS c
  JOIN referrals AS r ON c.referred_by = r.id
)
SELECT * FROM referrals;
```

`relation "referrals" does not exist`, and the HINT says outright `Use WITH RECURSIVE`. Without `RECURSIVE`, a CTE cannot see its own name while it is being defined.

**2. No stopping condition.** This one counts forever:

```sql
WITH RECURSIVE n AS (
  SELECT 1 AS i
  UNION ALL
  SELECT i + 1 FROM n
)
SELECT i FROM n;
```

Every round produces a new row, so the loop never ends. In SQL Lab the query is stopped after 8 seconds; on a real database it runs until memory runs out or someone cancels it. When writing a recursive term, ask: which round will produce no rows?

**3. The join pointing the wrong way.** To find the people Lin Wei referred you write `c.id = r.referred_by`, which finds Lin Wei's referrer instead. Lin Wei has none, so the result is a single row, Lin Wei, and no error. Read the condition aloud first: "customer c's referrer is r from the last round" is `c.referred_by = r.id`.

**4. Different column counts in the start and the recursive term.** Two columns in the start and three in the recursive term fail with `each UNION query must have the same number of columns`. Line up the two select lists column by column, as with Chapter 5's set operations.

**5. An aggregate in the recursive term.** A `count(*)` in the recursive term fails with `aggregate functions are not allowed in a recursive query's recursive term`. Each round sees only the previous round's rows, so summarising belongs in the main query: walk out all the rows first, then `count` or `max` them.

## Summary {#summary}

- A recursive CTE has a non-recursive term (the start) and a recursive term (the next step), joined by `UNION ALL`, with `RECURSIVE` after `WITH`.
- The database works in rounds: the recursive term sees only the rows the previous round produced, and stops when a round produces none.
- Walking down and walking up differ only in the direction of the join condition.
- The start fixes the column names and types; the recursive term cannot aggregate, so summaries go in the main query.
- Every recursive term needs a condition that stops it; if cycles are possible, use `UNION`, `CYCLE` or a depth limit.
