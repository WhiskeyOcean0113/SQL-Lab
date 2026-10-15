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

## Syntax {#syntax}

`ORDER BY`, `LIMIT` and `OFFSET` all come at the end of a query, in a fixed order:

```syntax
SELECT select_list
FROM table_name
[ WHERE condition ]
[ ORDER BY expression [ ASC | DESC ] [ NULLS { FIRST | LAST } ] [, …] ]
[ LIMIT { count | ALL } ]
[ OFFSET start ]
```

| Part | What goes there | Optional? |
|---|---|---|
| `expression` | A sort key: a column, an alias from `SELECT`, or a calculation | With `ORDER BY`, at least one is required |
| `ASC` / `DESC` | This key's direction | Yes; the default is `ASC` |
| `NULLS FIRST` / `NULLS LAST` | Which end this key's NULLs go to (see Going deeper) | Yes; by default `NULLS LAST` ascending, `NULLS FIRST` descending |
| `[, …]` | More sort keys, each consulted only when the previous ones tie | Yes |
| `count` | The most rows to return; `ALL` means no limit | The whole `LIMIT` can go |
| `start` | How many rows to skip first | The whole `OFFSET` can go; the default is 0 |

The shape shows two things that are easy to miss:

- **`ASC | DESC` and `NULLS …` sit inside `[, …]`.** They belong to each sort key, not to `ORDER BY` as a whole. In `ORDER BY country, name DESC`, `DESC` applies to `name` only.
- **`LIMIT` and `ORDER BY` are separate clauses.** The shape allows `LIMIT` without `ORDER BY`. That is valid syntax, but the result is unpredictable (see Common mistakes, number 1).

Some clauses, read against the shape:

- `ORDER BY price DESC LIMIT 3`: one key, `DESC`, then 3 rows.
- `ORDER BY country, name`: two keys, both directions left out, so both ascending.
- `ORDER BY city NULLS FIRST`: one key, direction left out, NULL position given.

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

**The standard `FETCH FIRST`, and ties.** In standard SQL, taking the first rows is written `FETCH FIRST`, in this shape:

```syntax
FETCH FIRST count ROWS { ONLY | WITH TIES }
```

`ONLY` behaves like `LIMIT`; `WITH TIES` also brings along every row tied with the last one. Sorting by country and taking the first 2:

```sql run
SELECT name, country
FROM customers
ORDER BY country
FETCH FIRST 2 ROWS WITH TIES;
```

Three rows come back: the 2nd row is a customer in Canada, and the other Canadian customer ties with it, so it comes too. With `LIMIT 2` only two rows would remain, and which Canadian stays would be arbitrary. `WITH TIES` needs an `ORDER BY`; without one there is no way to say what ties with what.

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

**Sorting by column position.** PostgreSQL lets a number stand for a column of the select list: `ORDER BY 2, 1` sorts by the second column, then the first. It is short, but add or remove a column in `SELECT` later and the number points at a different column; the query still runs, quietly sorted wrong. This course does not use it.

**`LIMIT ALL`.** `LIMIT ALL` is the same as no `LIMIT`. It helps when a program builds the SQL: the page size can be a number, or `ALL` for no paging, without deleting the whole clause.

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

**6. A clause in the wrong place.** `ORDER BY` must come before `LIMIT`. Writing `... LIMIT 3 ORDER BY price` fails with `syntax error at or near "ORDER"`. Write the clauses top to bottom in the order of the syntax, and this never happens.

## Summary {#summary}

- `ORDER BY` sorts ascending by default and descending with `DESC`; keys apply left to right in priority, each with its own direction.
- `LIMIT n` keeps n rows and `OFFSET m` skips m; they come last in the logical order.
- Every `LIMIT` needs an `ORDER BY`, ideally one that also breaks ties.
- PostgreSQL puts NULLs last in ascending order by default; write `NULLS FIRST` / `NULLS LAST` when it matters.
