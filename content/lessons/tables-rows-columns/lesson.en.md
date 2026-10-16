## Why you need it {#why}

Every exercise in this course runs against the data of a small online store, a dataset called shop. Before you filter, sort or join anything, you need to know what is in it: which products does the store sell, and what does it record about each one?

A database keeps that information in {{term:table|tables}}. This lesson does one thing: it teaches you to read a table.

## Core idea {#core}

A table is made of {{term:row|rows}} and {{term:column|columns}}:

- **Each row is one {{term:record}}** describing one specific thing. Each row of `products` is one product.
- **Each column is one attribute**, with a name and a {{term:data-type}}. Every value in `price` is a price of type `numeric`; every value in `name` is text of type `text`.
- **All values in a column share its type.** You cannot put a sentence into `price`.

The names of all the tables, their columns and their types together form the database's {{term:schema}}: the manual for the data.

To see everything in a table, run this {{term:query}}:

```sql run
SELECT * FROM categories;
```

`SELECT *` means "every column", and `FROM categories` says which table to read. The answer is itself a table, called a {{term:result-set}}.

One more essential point: **the rows of a table have no fixed order.** A relational database treats a table as a set of rows, so the order you see is simply the order the database happened to produce this time. It may differ next time. If you need an order, you have to ask for it (`ORDER BY`, in chapter 1).

## Example {#example}

Task: which columns does `products` have, what type is each, and how many products are there?

Step by step:

1. **Look at the whole table.** Run `SELECT * FROM products;` and count the rows.
2. **Recognise what a row stands for.** Each row is one product, so the row count is the product count.
3. **Look up the column types.** Every PostgreSQL database carries tables that describe its own structure. One of them, `information_schema.columns`, lists every column of every table.

```sql run
SELECT * FROM products;
```

That is 16 rows, so 16 products. Now the column types:

```sql run
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'products'
ORDER BY ordinal_position;
```

| Column | Type | Meaning |
|---|---|---|
| `id` | integer | product number |
| `name` | text | product name |
| `category_id` | integer | number of the product's category |
| `price` | numeric | price in US dollars, to the cent |
| `stock` | integer | units in stock |
| `launched_on` | date | date the product went on sale |

The `WHERE` and `ORDER BY` in that second query each get their own lesson later. For now, it is simply a way to see a table's structure.

## Variations {#variants}

**All five shop tables.** The same trick lists every table in the database:

```sql run
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

| Table | One row is | Rows |
|---|---|---|
| `categories` | a product category | 5 |
| `customers` | a customer | 12 |
| `products` | a product | 16 |
| `orders` | an order | 24 |
| `order_items` | one product within an order, and how many were bought | 42 |

`order_items` is the one people misread: a row is not an order but "this product in that order". Order 3 contains three different products, so it takes three rows in `order_items`.

**Upper and lower case in names.** Unquoted table and column names are case-insensitive in PostgreSQL. `SELECT * FROM Products;` is the same as `SELECT * FROM products;`, because the database folds unquoted names to lower case first. Double quotes make a name case-sensitive, so `"Products"` refers to a different table, one that does not exist.

**Just some columns.** Replace `*` with a comma-separated list of column names and the result has only those columns, in the order you wrote them:

```sql run
SELECT name, price FROM products;
```

Still 16 rows; each now has two columns. The first lesson of Chapter 1 covers this in detail.

## Going deeper {#deeper}

**{{Term:null}} is not 0 and not an empty string.** Some cells show NULL, which means "no value here" or "unknown":

```sql run
SELECT * FROM customers;
```

The `city` of Liam O'Brien and of Lucas Silva is NULL: the city is unknown, not a city called nothing. NULL follows special rules in comparisons and arithmetic, and chapter 1 gives it a whole lesson.

**A table is not a spreadsheet.** If you have used Excel, it is tempting to picture a table as a grid. There are fundamental differences:

- A table has no "row 3". Rows have no fixed position.
- A column holds one type only. One cell cannot be a number and the next a sentence.
- A cell holds a single value: no merged cells, no formulas. Calculations belong in queries.

**Common column types.** shop uses only five types:

| Type | Holds | Examples in shop |
|---|---|---|
| `integer` | Whole numbers | `id`, `stock`, `quantity` |
| `numeric(8, 2)` | Exact decimals: up to 8 digits, 2 of them after the point | `price`, `unit_price` |
| `text` | Text of any length | `name`, `city`, `status` |
| `date` | A date without a time | `joined_on`, `launched_on` |
| `timestamp` | A date and a time | `ordered_at`, `shipped_at` |

`information_schema` also tells you which columns may be NULL:

```sql run
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'customers'
ORDER BY ordinal_position;
```

A column whose `is_nullable` is `NO` must always have a value: every customer has a name and a country. One marked `YES` may be empty, like `email` and `city`. `timestamp` shows up here as `timestamp without time zone`, meaning it carries no {{term:time-zone}}; Chapter 2 comes back to this with dates.

**Naming conventions.** shop uses plural table names (`orders`) and lower-case column names with underscores (`customer_id`), a style called snake_case. Nothing enforces it, but it is common and never needs quoting.

## Common mistakes {#mistakes}

**1. A singular table name.** The table is `customers`; writing `customer` fails:

```sql run error
SELECT * FROM customer;
```

A relation, in `relation "customer" does not exist`, is a table. When you see this error, check the spelling, singular or plural included.

**2. Trusting the row order.** The result looks sorted by `id`, but that is luck, not a promise. Today's first row may not be first with a different query or once the data grows.

**3. Mixing up table names and column names.** `name` is a column of `customers`, not a table, so `SELECT * FROM name;` fails with the same `does not exist` error. Before you write a query, decide whether what you need is a table or a column inside one.

**4. Double quotes around a table name.** `SELECT * FROM "Products";` fails because quoting makes the name case-sensitive, and the real table is the lower-case `products`. In SQL, double quotes wrap names and single quotes wrap text. Chapter 1 comes back to this.

**5. Reading NULL as 0 or an empty string.** A customer whose `city` is NULL does not live in a city called "". NULL means the value is missing, and it is equal to nothing at all.

## Summary {#summary}

- A table is rows and columns: each row is one record, each column one attribute, and every value in a column has the same type.
- `SELECT * FROM table;` shows a whole table, and the answer is itself a table.
- Rows have no fixed order; ask for one explicitly when you need it.
- NULL means a missing value, not 0 and not an empty string.
- Unquoted names are case-insensitive; a misspelled table name fails with `does not exist`.
