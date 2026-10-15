## Why you need it {#why}

These two queries differ by one pair of quotes. The first lists the customers in Canada:

```sql run
SELECT name, city
FROM customers
WHERE country = 'Canada';
```

The second swaps the single quotes for double quotes and fails:

```sql run error
SELECT name, city
FROM customers
WHERE country = "Canada";
```

The error says `column "Canada" does not exist`. The database did not read `"Canada"` as the name of a country. It read it as the name of a {{term:column}} and went looking for a column called Canada.

SQL reads a lot like English, but it is a language with strict writing rules. Whether a word is a command, a name or a value depends entirely on how it is written. This lesson sets out those rules once, because every later lesson relies on them. It also teaches you to read syntax blocks: from here on, every lesson uses one to show the shape of what it teaches.

## Core idea {#core}

### Statements and clauses

A SQL {{term:statement}} is one complete command for the database, ended by a semicolon `;`. A query is made of {{term:clause|clauses}}, and each clause starts with a fixed word:

- the `SELECT` clause says which columns you want;
- the `FROM` clause says which {{term:table}} they come from;
- the `WHERE` clause says which {{term:row|rows}} to keep.

Clauses come in a fixed order and cannot be shuffled. The next lesson gives the full order.

### Five kinds of token

To read a statement, the database first cuts it into {{term:token|tokens}}, then checks that they fit together according to the {{term:syntax}}. There are only five kinds:

| Kind | Examples | What it is |
|---|---|---|
| {{Term:keyword}} | `SELECT`, `FROM`, `WHERE`, `AS`, `NULL` | A word whose meaning SQL defines |
| {{Term:identifier}} | `customers`, `country`, `stock_value` | A name: of a table, a column or an alias |
| {{Term:literal}} | `'Canada'`, `42`, `3.5` | A fixed value written into the statement |
| {{Term:operator}} | `=`, `<`, `+`, `*`, `\|\|` | Computes or compares |
| Special character | `,`, `(`, `)`, `.`, `;` | Separates, groups or ends |

When you meet an unfamiliar query, sort its words into these kinds first. Once each word is in the right kind, most of the meaning follows. `*` is the odd one out: alone in a select list it means "every column"; between two values it means multiplication.

### Keywords and names ignore case

`SELECT`, `select` and `Select` are the same keyword. Unquoted names work the same way: PostgreSQL turns them into lower case before looking them up. `CUSTOMERS`, `Customers` and `customers` all mean the same table.

This course writes keywords in upper case and names in lower case. That is for readability only; the database does not care.

### How values are written

How you write a {{term:literal}} depends on its type:

- **Text** (a {{term:string}}) goes in single quotes: `'Canada'`.
- **Numbers** are written bare, without quotes: `42`, `3.5`.
- **Dates** go in single quotes as year-month-day: `'2024-01-01'`.
- **`NULL`, `TRUE` and `FALSE`** are keywords and take no quotes.

**Double quotes are not for values.** Double quotes wrap a name, called a {{term:quoted-identifier}}. That is why the opening query failed: `"Canada"` is a name, so the database looked for a column called Canada.

**Values are case-sensitive.** Only keywords and names ignore case. `'Canada'` and `'canada'` are two different strings.

### Whitespace and comments

Between words, one space, several spaces or a line break all mean the same. A statement written on one line means exactly what it means spread over ten. This course puts each clause on its own line.

A {{term:comment}} is a note for people; the database skips it:

- `--` starts a comment that runs to the end of the line.
- `/* … */` encloses a comment that may span several lines.

## Syntax {#syntax}

From this lesson on, every lesson has a Syntax section that shows the shape of what it teaches in a fixed notation. The notation is the one the PostgreSQL manual uses, so once you can read it, you can read the manual too.

Here is the shape of the simplest query:

```syntax
SELECT { * | expression } [, …]
FROM table_name
```

Read the notation like this:

| Notation | Meaning | Here |
|---|---|---|
| Upper-case words | Keywords: write them as shown | `SELECT`, `FROM` |
| Lower-case italic words | {{Term:placeholder|Placeholders}}: replace them with your own | `table_name` becomes `products` |
| A lower-case word right before a parenthesis | A {{term:function}} name: write it as shown (from Chapter 2 on) | `round` in `round(number)` |
| `[ … ]` | The part in brackets may be left out | `[, …]` can be absent |
| `{ a \| b }` | Pick exactly one of the alternatives | Either `*` or an `expression` |
| `[, …]` | The item before may repeat, separated by commas | The select list can hold several items |
| Anything else | Parentheses, commas, `*` and so on are written as shown | `*` |

Brackets, braces, bars and the ellipsis only describe the shape. They never go into your SQL.

So the block above says: write `SELECT`, then one item or several separated by commas, each either `*` or an {{term:expression}} such as a column name; then write `FROM` and a table name. This query fits the shape, with two column names for `expression` and `products` for `table_name`:

```sql run
SELECT name, price
FROM products;
```

Each lesson's Syntax section comes with a table explaining what every placeholder may hold and whether it can be left out.

## Example {#example}

Task: find the email address and city of the customer Liam O'Brien.

1. **Build the skeleton.** Some columns, from one table, for one row: `SELECT … FROM … WHERE …`, one clause per line.
2. **Write the names.** The columns `email`, `city` and `name` and the table `customers` are identifiers, written bare.
3. **Write the value.** The customer's name is text, so it goes in single quotes. The catch is the apostrophe in the name: the database would take it as the end of the string. The rule is that inside a single-quoted string, two single quotes in a row `''` stand for one quote character. So the value is `'Liam O''Brien'`.
4. **Add a comment and end with a semicolon.** The comment says what the query is for.

```sql run
-- contact details of one customer
SELECT email, city
FROM customers
WHERE name = 'Liam O''Brien';
```

One row comes back: the email is liam.obrien@example.com and the city is NULL, because the data does not record where he lives.

The same statement, token by token:

| Token | Kind |
|---|---|
| `-- contact details of one customer` | Comment, skipped by the database |
| `SELECT`, `FROM`, `WHERE` | Keywords, each starting a clause |
| `email`, `city`, `customers`, `name` | Identifiers |
| `,` | Special character, separating the two select-list items |
| `=` | Operator, comparing both sides for equality |
| `'Liam O''Brien'` | Literal, whose value is Liam O'Brien |
| `;` | Special character, ending the statement |

## Variations {#variants}

**Case and line breaks change nothing.** This query is identical to the one in the example. The value in quotes must stay exactly as it is, though, because values are case-sensitive:

```sql run
select EMAIL, City from CUSTOMERS where NAME = 'Liam O''Brien';
```

**Kinds of literal.** A select list can hold plain values. Run this to see what each kind looks like:

```sql run
SELECT 'Canada' AS text_value,
       42 AS integer_value,
       3.5 AS decimal_value,
       1e3 AS scientific_value,
       DATE '2024-05-01' AS date_value,
       TRUE AS boolean_value,
       NULL AS no_value;
```

- The word after `AS` names the result column; the next lesson covers it properly.
- `1e3` is scientific notation for 1 × 10³, which is 1000.
- `DATE '2024-05-01'` puts a type name before a string to say plainly that it is a date. Chapter 2 returns to this when it covers casts.
- This query has no `FROM`: it computes a few values and reads no table. PostgreSQL allows that (see Going deeper).

**Quoted names.** Double quotes let a name keep its capitals and contain spaces. Their most common use is a readable name for a result column:

```sql run
SELECT name AS "Customer name", joined_on AS "Joined"
FROM customers;
```

Once a name is in double quotes, its case must match exactly. The column is called `name`, all lower case, so `"Name"` is not found:

```sql run error
SELECT "Name"
FROM customers;
```

Below the error, PostgreSQL adds a HINT guessing that you meant `customers.name`. Hints like this are worth reading whenever something fails.

**A dot says which table a column belongs to.** `customers.name` means the `name` column of the `customers` table. With one table it is optional; from Chapter 4, when queries use several tables at once, you will need it:

```sql run
SELECT customers.name, customers.country
FROM customers;
```

**Several statements, and multi-line comments.** You can run several statements at once, separated by semicolons. The runner in this course shows only the result of the last one. With a single statement the final semicolon may be left out, but it is a good habit to write it.

```sql run
/*
  Two statements, run one after the other.
  Only the result of the last one is shown.
*/
SELECT name FROM products WHERE id = 1;
SELECT name FROM customers WHERE id = 1;  -- Lin Wei
```

## Going deeper {#deeper}

**PostgreSQL lower-cases names; standard SQL upper-cases them.** The SQL standard says unquoted names are turned into upper case, and Oracle does exactly that; PostgreSQL turns them into lower case. Usually you cannot tell the difference. But if a table was created with a quoted name such as `"Products"`, every later reference must also be `"Products"`, quotes included. The simple way out is to name everything in lower case with underscores, like `stock_value`, so that nothing ever needs quotes.

**Keywords cannot be used as bare names.** Words such as `order`, `group` and `user` are keywords. A table called order would have to be written `"order"`; without the quotes it is a {{term:syntax-error}}:

```sql run error
SELECT *
FROM order;
```

The shop's order table is called `orders`, so you will not meet this problem here. When you create tables yourself, steer clear of keywords.

**Queries without `FROM`.** PostgreSQL, MySQL and SQLite all accept a query such as `SELECT 2 + 3` that reads no table. Standard SQL requires a `FROM`, and Oracle supplies a one-row table called `dual` for the purpose.

**Quoting rules change between databases.**

- MySQL treats double quotes as string quotes by default and wraps names in backticks: `` `name` ``. So `"Canada"`, which works in MySQL, fails in PostgreSQL.
- SQLite, for compatibility with old programs, treats a double-quoted word as a string when no column has that name. A misspelt column name can therefore turn quietly into a piece of text, with no error at all.
- SQL Server wraps names in square brackets: `[name]`.
- Single quotes for strings work in every database. Whatever the database, write values in single quotes.

**Comments elsewhere.** MySQL only treats `--` as a comment when a space follows it, and it also accepts `#`. In PostgreSQL, `/* */` comments can be nested; in some databases they cannot.

**Another way to write an apostrophe.** PostgreSQL can also enclose a string in `$$` instead of single quotes, as in `$$Liam O'Brien$$`, so the apostrophe need not be doubled. This form is mostly used when writing functions; in queries, `''` is enough.

## Common mistakes {#mistakes}

**1. Double quotes around a text value.** This is the opening query's mistake. Double quotes wrap names, so the error says a column does not exist rather than that a value is wrong. It is especially common among people used to MySQL.

**2. A text value with no quotes at all.**

```sql run error
SELECT name
FROM customers
WHERE country = Canada;
```

Notice that the error mentions `canada`, in lower case. The database took the word as an unquoted name, lower-cased it as the rules say, and looked for that column. When an error says a column does not exist and the "column" is really a value you meant to write, the single quotes are missing.

**3. A single apostrophe inside a string.**

```sql run error
SELECT email
FROM customers
WHERE name = 'Liam O'Brien';
```

The string ends after `O`, and the leftover `Brien` is an extra word, which is where the error points. The fix is to double the apostrophe: `'Liam O''Brien'`.

**4. Curly quotes and other look-alike punctuation.** Word processors, chat apps and slides often replace straight quotes with curly ones, `‘’` and `“”`. A Chinese input method produces full-width commas `，` as well. They look almost the same, but the database does not recognise them; PostgreSQL reads them as part of a name:

```sql run error
SELECT name
FROM customers
WHERE country = ‘Canada’;
```

The error is `column "‘canada’" does not exist`. A full-width comma does the same: `SELECT name，price` is read as one column called `name，price`. Type SQL with a plain English keyboard layout, and check the quotes in any SQL you copy from a chat or a document.

**5. A misspelt keyword, and an error that points elsewhere.**

```sql run error
SELECT name FORM products;
```

The mistake is `FORM`, but the error points at `products`. The database first took `FORM` as an alias for `name` (the next lesson explains that `AS` is optional) and only noticed a problem when it reached the extra word `products`. `syntax error at or near "…"` marks where the database noticed, and the real mistake is often just before it.

**6. Assuming values ignore case too.**

```sql run
SELECT name
FROM customers
WHERE country = 'canada';
```

The query runs and returns 0 rows, because the data says `'Canada'`. No error appears, which makes this one harder to spot. Keywords and names ignore case; values do not.

**7. Habits from other programming languages.** SQL tests equality with a single `=`. Writing `price == 10` fails with `operator does not exist`, and forms such as `&&` and `!` either mean something else in SQL or nothing at all. The `WHERE` lessons introduce SQL's own `AND`, `OR` and `NOT`.

## Summary {#summary}

- A statement is made of clauses and ends with a semicolon; the database cuts it into keywords, names, values, operators and special characters.
- Keywords and unquoted names ignore case (PostgreSQL lower-cases them); values are case-sensitive.
- Text values take single quotes, with any apostrophe doubled; double quotes wrap names, not values.
- In a syntax block, upper case is a keyword, lower-case italic is a placeholder, `[ ]` is optional, `{ | }` means pick one, and `[, …]` may repeat.
- When an error says a column does not exist and the "column" is really a value, the quotes are probably wrong.
