## Why you need it {#why}

Chapter 0 said that the rows of a table have no fixed order. Yet many questions are about order: "Which is the most expensive product?" "What are the 5 most recent orders?" "Give me the customer list sorted by country."

Questions like these need `ORDER BY` to sort, then `LIMIT` and `OFFSET` to take a slice.

## Core idea {#core}

`ORDER BY` is followed by what to sort on, the sort key:

```sql run
SELECT name, price
FROM products
ORDER BY price;
```

- The default is {{term:ascending}} (`ASC`, smallest first); add `DESC` for {{term:descending}}.
- Numbers sort by size, text alphabetically, dates by time.
- You can give several sort keys separated by commas: rows are sorted by the first, and by the second only where the first is equal.

`LIMIT n` keeps the first n rows, and `OFFSET m` skips m rows first:

```sql run
SELECT name, price
FROM products
ORDER BY price DESC
LIMIT 3;
```

Recall the logical order: `ORDER BY` comes after `SELECT`, and `LIMIT` and `OFFSET` come last. So `LIMIT` always takes rows from the sorted result, and `ORDER BY` can use aliases defined in `SELECT`.

The PostgreSQL manual is emphatic: with `LIMIT`, use an `ORDER BY` that puts the rows in a unique order, or you get "an unpredictable subset of the query's rows".

## Example {#example}

Task: list the customers sorted by country, and by name within each country.

1. **Pick the main sort key.** Country, ascending.
2. **Decide how to break ties.** Name, ascending.
3. **Write them left to right in order of priority.** `ORDER BY country, name`.

```sql run
SELECT name, country
FROM customers
ORDER BY country, name;
```

China's three customers, Chen Yu, Lin Wei and Zhang Min, appear together in name order. Each key has its own direction: `ORDER BY country DESC, name` sorts countries descending and names still ascending.

## Variations {#variants}

**Paging.** Showing 5 products per page sorted by name, page 2 skips the first 5 rows and takes the next 5. This is {{term:pagination}}:

```sql run
SELECT name
FROM products
ORDER BY name
LIMIT 5 OFFSET 5;
```

For page n, `OFFSET` is `(n − 1) × rows per page`.

**Sorting by an expression or alias.** A sort key can be a computed value:

```sql run
SELECT name, price * stock AS stock_value
FROM products
ORDER BY stock_value DESC
LIMIT 3;
```

**The most recent records.** Times sort too; newest first is `DESC`:

```sql run
SELECT id, ordered_at
FROM orders
ORDER BY ordered_at DESC
LIMIT 5;
```

## Going deeper {#deeper}

**Where NULLs go.** PostgreSQL treats NULL as larger than any value: last in ascending order, first in descending order. `NULLS FIRST` or `NULLS LAST` changes that:

```sql run
SELECT name, city
FROM customers
ORDER BY city NULLS FIRST;
```

Other databases do the opposite by default: MySQL and SQLite put NULLs first in ascending order. When the position matters, spell out `NULLS FIRST` or `NULLS LAST`.

**Ties.** When two rows have the same sort key, their relative order is undefined. Sorting by `city`, the two Osaka customers may come out either way round from one run to the next. If the order matters to you, add a key that tells them apart, such as `ORDER BY city, name`. Ending with `id` as the last key makes the order fully determined.

**Ties and `LIMIT`.** "The 3 most expensive products" is unambiguous when there are no ties. But if the 3rd and 4th cost the same, `LIMIT 3` keeps one of them arbitrarily. The standard `FETCH FIRST 3 ROWS WITH TIES` includes every tied row. `LIMIT` itself is PostgreSQL and MySQL syntax; the standard equivalent is `FETCH FIRST 3 ROWS ONLY`.

**Large `OFFSET`s are slow.** Rows skipped by `OFFSET` still have to be computed and then thrown away. Skipping millions of rows makes each page slower than the last. Real systems often remember the last value on the previous page and start the next page after it instead.

## Common mistakes {#mistakes}

**1. `LIMIT` without `ORDER BY`.** `SELECT name FROM products LIMIT 3` is not "the top three" but whichever three rows the database produces first. Whenever a question says "most", "top", "first" or "latest", it needs `ORDER BY`. Research lists a missing ordering column among the errors novices are least likely to catch themselves.

**2. Sort keys in the wrong priority.** For "by country, then by name within each country", writing `ORDER BY name, country` sorts mainly by name:

```sql run
SELECT name, country
FROM customers
ORDER BY name, country;
```

The leftmost key wins.

**3. Expecting `DESC` to apply to every key.** `ORDER BY country, name DESC` makes only `name` descending; `country` stays ascending. Give each key its own direction.

**4. Relying on the default NULL position.** Move to another database and the NULLs may jump to the other end. Write `NULLS FIRST` / `NULLS LAST` when the position matters.

**5. An off-by-one `OFFSET`.** Page 1 is `OFFSET 0`, not `OFFSET 1`; `OFFSET 1` skips the first row.

## Summary {#summary}

- `ORDER BY` sorts ascending by default and descending with `DESC`; keys apply left to right in priority, each with its own direction.
- `LIMIT n` keeps n rows and `OFFSET m` skips m; they come last in the logical order.
- Every `LIMIT` needs an `ORDER BY`, ideally one that also breaks ties.
- PostgreSQL puts NULLs last in ascending order by default; write `NULLS FIRST` / `NULLS LAST` when it matters.
