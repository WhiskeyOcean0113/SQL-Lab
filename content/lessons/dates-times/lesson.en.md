## Why you need it {#why}

"How long did each order take to ship?" "Which customers joined more than a year ago?" "Which orders came in during March?" Each of these calculates with dates and times.

Time values look like text, but they have their own types and arithmetic. Used well they are concise; used carelessly they go quietly wrong at month ends, year boundaries and time zones.

## Core idea {#core}

**Three everyday time types.**

| Type | Meaning | In shop |
|---|---|---|
| `date` | a calendar day, no time of day | `customers.joined_on` |
| `timestamp` | a date plus a time of day | `orders.ordered_at` |
| `interval` | a length of time, an {{term:interval}} | what subtracting two timestamps gives |

Time literals can carry their type name in front, which makes the intent clear: `DATE '2024-07-01'`, `TIMESTAMP '2024-03-01 10:00'`, `INTERVAL '2 days'`.

**Adding and subtracting time.**

- `timestamp - timestamp` gives an `interval`, such as `1 day 04:48:00`.
- `date - date` gives an integer, the number of days between them.
- `date + integer` moves forward that many days; `+ INTERVAL '1 month'` moves forward a month.

```sql run
SELECT id, ordered_at, shipped_at, shipped_at - ordered_at AS shipping_time
FROM orders
WHERE shipped_at IS NOT NULL;
```

shop's data ends in late June 2024. To keep results fixed, this course treats "today" as `DATE '2024-07-01'`. In real queries, `current_date` is today's date and `now()` is the current {{term:timestamp}}.

## Syntax {#syntax}

Time literals, time arithmetic and this lesson's functions:

```syntax
{ DATE | TIMESTAMP | INTERVAL } 'text'
date - date
date { + | - } integer
timestamp - timestamp
timestamp { + | - } interval
extract(field FROM source)
date_trunc('field', source)
age(end_value, start_value)
to_char(value, 'format')
```

| Shape | Result type | Example |
|---|---|---|
| `DATE 'text'` and the like | A typed time literal | `DATE '2024-07-01'`, `INTERVAL '2 days'` |
| `date - date` | An integer: the days between | `DATE '2024-07-01' - joined_on` |
| `date + integer` | A date, that many days later | `joined_on + 30` |
| `timestamp - timestamp` | An `interval` | `shipped_at - ordered_at` |
| `timestamp + interval` | A timestamp | `ordered_at + INTERVAL '2 days'` |

| Placeholder | What goes there |
|---|---|
| `text` (after `INTERVAL`) | Numbers with units, which can be combined: `'90 minutes'`, `'1 day 6 hours'`, `'1 month'` |
| `field` | The part to extract or truncate to: `year`, `month`, `day`, `hour`, `minute`, `dow` (day of week), `epoch` (seconds) and others |
| `source` | A date, a timestamp or an interval |
| `format` | A display template: `YYYY` year, `MM` month, `DD` day, `HH24` hour, `MI` minute, `Mon` abbreviated month |

The easiest thing to mix up is how `field` is written. In `extract(month FROM …)`, `month` takes no quotes; it works like a keyword. In `date_trunc('month', …)`, `'month'` is an ordinary argument, a piece of text, so it needs single quotes. The shapes above show the quotes where they belong.

Two expressions, read against the shapes:

- `DATE '2024-07-01' - joined_on`: `date - date`, giving an integer.
- `date_trunc('month', ordered_at)`: the text `'month'`, then a timestamp; the result is midnight on the 1st of that month.

## Example {#example}

Task: how many days had each customer been a member as of 1 July 2024?

1. **Pin down both ends.** The end is `DATE '2024-07-01'`; the start is `joined_on`.
2. **Check the types.** Both are `date`.
3. **Subtract.** `date - date` gives a whole number of days directly.
4. **Name it.** `AS days_as_member`.

```sql run
SELECT name, joined_on, DATE '2024-07-01' - joined_on AS days_as_member
FROM customers;
```

Lin Wei comes to 534 days and the newest customer, Mei Tanaka, to 125. To express it in years, months and days, use `age(DATE '2024-07-01', joined_on)`, which returns values such as `1 year 5 mons 18 days`.

## Variations {#variants}

**Pulling out a part: `extract`.** Year, month, day, day of week (0 is Sunday), hour:

```sql run
SELECT id, ordered_at,
       extract(year from ordered_at) AS year,
       extract(month from ordered_at) AS month,
       extract(dow from ordered_at) AS weekday,
       extract(hour from ordered_at) AS hour
FROM orders;
```

**Cutting to a precision: `date_trunc`.** Truncating a timestamp to the start of its month gives every order in a month the same value, which chapter 3 uses to total by month:

```sql run
SELECT id, ordered_at, date_trunc('month', ordered_at) AS month
FROM orders;
```

**Just the date: `::date`.** `ordered_at::date` drops the time of day.

**Filtering by time.** Timestamps compare just like numbers. Customers who joined more than a year ago:

```sql run
SELECT name, joined_on
FROM customers
WHERE joined_on < DATE '2024-07-01' - INTERVAL '1 year';
```

**Intervals compare and calculate too.** An `interval` can be compared with another `interval`, or multiplied by a number. Orders that took more than a day and a half to ship:

```sql run
SELECT id, shipped_at - ordered_at AS shipping_time
FROM orders
WHERE shipped_at - ordered_at > INTERVAL '1 day 12 hours';
```

**Converting an interval to hours.** `extract(epoch FROM …)` turns an interval into seconds; dividing by 3600 gives hours, which are easier to sort and calculate with:

```sql run
SELECT id,
       shipped_at - ordered_at AS shipping_time,
       round(extract(epoch FROM shipped_at - ordered_at) / 3600, 1) AS hours
FROM orders
WHERE shipped_at IS NOT NULL;
```

Order 1 took `1 day 04:48:00`, which is 28.8 hours.

**Formatting for display: `to_char`.**

```sql run
SELECT id, to_char(ordered_at, 'YYYY-MM-DD HH24:MI') AS short_time,
       to_char(ordered_at, 'Mon DD, YYYY') AS long_date
FROM orders;
```

## Going deeper {#deeper}

**Adding a month is not adding 30 days.** Months differ in length, so PostgreSQL clamps the result to the last day of the target month:

```sql run
SELECT DATE '2024-01-31' + INTERVAL '1 month' AS jan31_plus_month,
       DATE '2024-03-31' - INTERVAL '1 month' AS mar31_minus_month,
       DATE '2024-02-28' + 1 AS feb28_plus_day;
```

31 January plus a month is 29 February (2024 is a leap year). Note too that `date + INTERVAL` gives a `timestamp`, with 00:00:00 attached.

**Impossible dates are errors.** `'2024-02-30'::date` fails with `date/time field value out of range`. Always write dates in ISO form, `YYYY-MM-DD`: something like `03/05/2024` reads as 5 March in some places and 3 May in others.

**Time zones.** `timestamp` carries no time zone, and shop's convention is that every time is UTC. `timestamptz` (timestamp with time zone) records an exact instant and converts it to the session's {{term:time-zone}} for display; `now()` returns a `timestamptz`. Real projects usually store moments that actually happened as `timestamptz`.

**`to_char` pads names with spaces.** `to_char(DATE '2024-07-01', 'Day')` returns `Monday` followed by three spaces, because day names are padded to 9 characters. Prefix the template with `FM` (fill mode), as in `'FMDay'`, and the padding goes.

**Other databases differ a lot on time.** Dates and times are among the least portable parts of SQL. MySQL counts days with `DATEDIFF(a, b)`, and SQLite has no date type at all, storing times as text or numbers. `extract`, `INTERVAL` and `current_date` are standard SQL and the most likely to work everywhere.

**Filter with a range, not `extract`.** `WHERE extract(month from ordered_at) = 3` finds March orders, but it includes March of every year, and the database cannot use an index for it (chapter 9). Prefer the half-open range from chapter 1: `ordered_at >= '2024-03-01' AND ordered_at < '2024-04-01'`.

## Common mistakes {#mistakes}

**1. Subtracting the wrong way round.** `ordered_at - shipped_at` gives a negative duration:

```sql run
SELECT id, ordered_at - shipped_at AS wrong_way
FROM orders
WHERE id = 1;
```

`-1 days -04:48:00`. A duration is end minus start.

**2. Expecting `date - date` to give an `interval`.** Two dates give a whole number of days; only two timestamps give an `interval`. Comparing that integer with `INTERVAL '2 days'` is an error.

**3. `extract(month …)` without the year.** Once the data spans more than one year, "March" mixes orders from several years. For a month of a particular year, use a date range.

**4. Non-ISO date formats.** `'05/03/2024'` is ambiguous; `'2024-03-05'` can never be misread.

**5. `BETWEEN` for the end of a timestamp range.** As chapter 1 showed, `BETWEEN '2024-06-01' AND '2024-06-28'` excludes every moment after midnight on the 28th.

**6. No quotes around `date_trunc`'s first argument.**

```sql run error
SELECT date_trunc(month, ordered_at)
FROM orders;
```

That fails with `column "month" does not exist`: the unquoted `month` was read as a column name. `date_trunc` wants the text `'month'`. `extract(month FROM …)` takes no quotes, the exact opposite, so write from the syntax shapes.

## Summary {#summary}

- `date` is a day, `timestamp` a day plus a time, `interval` a duration.
- `timestamp - timestamp` gives an `interval`, `date - date` an integer number of days, and `+ INTERVAL` moves forward in time.
- `extract` pulls out parts, `date_trunc` cuts to a precision, and `to_char` controls display.
- Month arithmetic clamps to the end of the month; write dates in ISO form.
- To filter a period, use a half-open range.
