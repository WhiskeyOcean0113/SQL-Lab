## Why you need it {#why}

Real questions rarely have a single condition. "Which products under 50 dollars are in Books or Electronics?" holds three: in Books, in Electronics, priced under 50. And they do not all relate to each other in the same way.

`AND`, `OR` and `NOT` combine conditions. Writing them is easy; the hard part is order. Without parentheses, which one does the database evaluate first?

## Core idea {#core}

Each logical operator combines conditions into a new condition, and the result is still a {{term:boolean}}:

- **`A AND B`** is true only when both conditions are true.
- **`A OR B`** is true when at least one of them is true.
- **`NOT A`** turns true into false and false into true.

```sql run
SELECT name, country
FROM customers
WHERE country = 'China' OR country = 'Japan';
```

**{{Term:operator-precedence}}**: without parentheses, `NOT` is evaluated first, then `AND`, then `OR`. Just as multiplication comes before addition in arithmetic, `AND` binds more tightly than `OR`. So

```sql
WHERE a OR b AND c
```

means `a OR (b AND c)`, not `(a OR b) AND c`.

Comparisons (`=`, `<` and so on) come before all three, so `price < 50 AND stock > 10` needs no parentheses; it already means `(price < 50) AND (stock > 10)`.

## Example {#example}

Task: which products in Books (category 1) or Electronics (category 2) cost less than 50 dollars?

1. **List the individual conditions.** `category_id = 1`, `category_id = 2`, `price < 50`.
2. **Work out how they relate.** The category is either/or, so `OR`; the price is an extra requirement that must also hold, so `AND`.
3. **Wrap the `OR` part in parentheses** so it acts as one unit before `AND` combines it with the price.

```sql run
SELECT name, category_id, price
FROM products
WHERE (category_id = 1 OR category_id = 2) AND price < 50;
```

Three rows: The Pragmatic Programmer, SQL Pocket Guide and USB-C Hub.

Now run it again without the parentheses:

```sql run
SELECT name, category_id, price
FROM products
WHERE category_id = 1 OR category_id = 2 AND price < 50;
```

An extra row appears: Designing Data Apps at 55.50. Because `AND` comes first, this query really means "every book, plus the electronics under 50 dollars", and books stay in however expensive they are.

## Variations {#variants}

**`NOT` for negation.** `NOT (stock > 10)` is equivalent to `stock <= 10`:

```sql run
SELECT name, stock
FROM products
WHERE NOT (stock > 10);
```

When a single comparison says it directly, `stock <= 10` is usually clearer. `NOT` earns its place in front of a whole group of conditions, and in the `NOT IN`, `NOT LIKE` and `IS NOT NULL` you will meet in the next lessons.

**Several `AND`s.** The more conditions you `AND` together, the fewer rows survive:

```sql run
SELECT id, customer_id, status
FROM orders
WHERE customer_id = 1 AND status = 'delivered' AND ordered_at < '2024-03-01';
```

**Always parenthesise when you mix them.** Even if you remember the precedence, the next reader may not. Whenever one condition contains both `AND` and `OR`, add parentheses that state the intent.

## Going deeper {#deeper}

**De Morgan's laws.** Negating a group of conditions swaps `AND` and `OR`:

- `NOT (A AND B)` equals `NOT A OR NOT B`
- `NOT (A OR B)` equals `NOT A AND NOT B`

Customers from neither China nor Japan can be written as `NOT (country = 'China' OR country = 'Japan')` or as `country <> 'China' AND country <> 'Japan'`. A common wrong version is `country <> 'China' OR country <> 'Japan'`: every customer satisfies at least one side, so it returns all 12 of them.

**With NULL, logic has more than true and false.** When a condition cannot be decided because of a NULL, its result is neither true nor false but unknown. `AND`, `OR` and `NOT` have specific rules for unknown, and that is the subject of the lesson after next.

## Common mistakes {#mistakes}

**1. Translating everyday "and" straight into `AND`.** "List the customers from China and Japan" means you want customers of both countries. Written with `AND`:

```sql run
SELECT name
FROM customers
WHERE country = 'China' AND country = 'Japan';
```

0 rows, because no customer's country can equal two values at once. Researchers classify this as a misconception rooted in natural language: where everyday speech says "and", SQL often needs `OR`. To check, ask yourself whether a single row has to satisfy both conditions at the same time.

**2. Dropping the column after `OR`.** We say "the country is China or Japan", but SQL does not allow the shortcut:

```sql run error
SELECT name
FROM customers
WHERE country = 'China' OR 'Japan';
```

Both sides of `OR` must be complete conditions. `'Japan'` on its own is not one; PostgreSQL tries to read it as a Boolean and fails with `invalid input syntax for type boolean`. Write `country = 'China' OR country = 'Japan'`; the `IN` of the next lesson makes this shorter.

**3. Mixing `AND` and `OR` without parentheses.** See the example above: without the parentheses the query still runs and just returns extra rows. Mistakes like this never raise an error; only checking the result catches them.

**4. Using `OR` for "neither A nor B".** See De Morgan's laws above: `<> A OR <> B` is always true.

## Summary {#summary}

- `AND` needs both sides true, `OR` needs one side true, and `NOT` negates.
- Precedence is `NOT` > `AND` > `OR`, and comparisons come before all of them.
- Whenever one condition mixes `AND` and `OR`, add parentheses.
- Everyday "and" often means SQL `OR`, and both sides of `OR` must be complete conditions.
- Negating a group of conditions swaps `AND` and `OR`.
