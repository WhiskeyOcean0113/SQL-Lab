## Why you need it {#why}

`order_items` records how many units of each product were bought and at what unit price, but not what each line comes to. "What is each line of order 3 worth?" is yours to calculate: quantity times unit price.

SQL does arithmetic right inside a query. The arithmetic itself is easy; the type of the result is where the surprises are. Both are division, yet `7 / 2` and `7.0 / 2` give different answers.

## Core idea {#core}

**The four operations and the remainder.** `+`, `-`, `*` and `/` work as in mathematics, and `%` is {{term:modulo}}, the remainder of a division. Multiplication and division come before addition and subtraction; use parentheses to change that.

```sql run
SELECT order_id, product_id, quantity, unit_price,
       quantity * unit_price AS line_total
FROM order_items
WHERE order_id = 3;
```

**Three kinds of number.** PostgreSQL numbers come in three main families, and the operand types decide the result:

| Type | Example | Character |
|---|---|---|
| Integer: `integer`, `bigint` | `stock`, `quantity` | whole numbers only |
| {{Term:exact-numeric}}: `numeric(p, s)` | `price`, `unit_price` | exact decimals, right for money |
| {{Term:floating-point}}: `real`, `double precision` | scientific work | approximate and fast, with tiny errors |

**An integer divided by an integer is an integer.** This is {{term:integer-division}}: the fractional part is simply dropped (rounded toward zero), not rounded to nearest:

```sql run
SELECT 7 / 2 AS a, 7 / 2.0 AS b, 7 % 2 AS c, -7 / 2 AS d;
```

`7 / 2` is 3, and only `7 / 2.0` is 3.5. As soon as one side has a decimal point (or is `numeric`), the result is an exact decimal.

## Syntax {#syntax}

Arithmetic expressions can go anywhere an expression can: the select list, `WHERE`, `ORDER BY`.

```syntax
expression { + | - | * | / | % | ^ } expression
- expression
( expression )
function_name ( [ argument [, …] ] )
```

| Shape | Meaning | Example |
|---|---|---|
| `expression + expression` and so on | Add, subtract, multiply, divide, take the remainder, raise to a power | `quantity * unit_price` |
| `- expression` | Negate | `-price` |
| `( expression )` | Evaluate the inside first | `(price - 5) * stock` |
| `function_name ( … )` | Call a {{term:function}}, with comma-separated arguments in the parentheses | `round(price, 1)` |

As with `condition`, each shape **is itself an `expression`**, so they nest: in `round(price * 1.1, 2)`, `price * 1.1` is an expression that becomes `round`'s first argument.

The numeric functions in this lesson look like this. A name right before a parenthesis is written as shown:

```syntax
round(number [, decimal_places ])
trunc(number [, decimal_places ])
ceil(number)
floor(number)
abs(number)
power(base, exponent)
mod(dividend, divisor)
```

| Placeholder | What goes there |
|---|---|
| `number` | Any numeric expression |
| `decimal_places` | How many decimals to keep, as an integer; 0 if omitted; negative values round to tens, hundreds and so on |
| `base`, `exponent` | The base and the power |
| `dividend`, `divisor` | What is divided and what it is divided by; `mod(a, b)` is the same as `a % b` |

Operators are evaluated in this order, highest first:

| Precedence | Operators |
|---|---|
| 1 | `-` (negation) |
| 2 | `^` (power) |
| 3 | `*`, `/`, `%` |
| 4 | `+`, `-` |

Operators of the same level are evaluated left to right. That differs from school mathematics in two places; see Going deeper.

## Example {#example}

Task: what is every product's price after a 10% increase? Round to two decimal places and name the column `new_price`.

1. **Write the calculation.** A 10% increase is multiplying by 1.1: `price * 1.1`.
2. **Check the type and the decimal places.** `price` is `numeric(8, 2)`, and multiplying by 1.1 gives three decimal places (46.200).
3. **Round with a {{term:function}}.** `round(x, 2)` rounds to two decimal places.
4. **Name it.** `AS new_price`.

```sql run
SELECT name, price, round(price * 1.1, 2) AS new_price
FROM products;
```

SQL Pocket Guide's 19.99 × 1.1 = 21.989 rounds to 21.99. A function is written name(arguments); it is computed once per row, returns one value, and can go anywhere an expression can.

## Variations {#variants}

**Other rounding functions.** `ceil` rounds up, `floor` rounds down, `trunc` cuts off the decimals and `abs` gives the absolute value:

```sql run
SELECT ceil(4.1) AS ceil, floor(4.9) AS floor, trunc(4.99) AS trunc, abs(-3) AS abs;
```

**Integer division and remainder together.** With 4 units per box, how many full boxes does each stock make, and how many units are left?

```sql run
SELECT name, stock, stock / 4 AS full_boxes, stock % 4 AS leftover
FROM products;
```

Here integer division is exactly what we want: The Pragmatic Programmer has 25 units, filling 6 boxes with 1 left over.

**Powers and remainders as functions.** `power(2, 10)` is the same as `2 ^ 10`, and `mod(17, 5)` the same as `17 % 5`:

```sql run
SELECT power(2, 10) AS power, mod(17, 5) AS mod, sqrt(16) AS sqrt;
```

**Rounding to tens or hundreds.** `round`'s second argument can be negative:

```sql run
SELECT name, price * stock AS stock_value, round(price * stock, -2) AS rounded
FROM products;
```

The Pragmatic Programmer's stock value of 1050.00, rounded to hundreds, is exactly half-way and rounds away from zero to 1100.

**Combining columns of the same row.** Stock value `price * stock`, profit per unit, discounted price: all of them combine columns from one row.

## Going deeper {#deeper}

**Exact decimals versus floating point.** In `numeric`, 0.1 + 0.2 is exactly 0.3. Floating-point numbers store binary approximations:

```sql run
SELECT 0.1 + 0.2 = 0.3 AS numeric_equal,
       0.1::float8 + 0.2::float8 = 0.3::float8 AS float_equal,
       0.1::float8 + 0.2::float8 AS float_sum;
```

So money always belongs in `numeric`, never `real` or `double precision`. (In `0.1::float8`, `::` converts the value on its left to the type on its right; `float8` is `double precision`. Type casts are covered in the last lesson of this chapter.)

**Two ways of rounding.** `round` on `numeric` rounds exact halves away from zero: `round(2.5)` is 3 and `round(-2.5)` is -3. `round` on floating-point values rounds halves to the nearest even number: `round(2.5::float8)` is 2. One more reason to keep money out of floating point.

**Division by zero and overflow.** `1 / 0` fails with `division by zero`. `integer` tops out at about 2.1 billion and fails with `integer out of range` beyond that; use `bigint` for larger numbers. When a divisor might be 0, `NULLIF(stock, 0)` turns 0 into NULL so the result is NULL instead of an error (the CASE lesson in this chapter comes back to it).

**NULL in arithmetic.** NULL plus, minus, times or divided by anything is NULL.

**Two precedence rules that differ from school.** First, negation comes before powers, so `-2 ^ 2` is (−2)² = 4, where mathematics reads −2² as −4. Second, `^` is evaluated left to right, so `2 ^ 3 ^ 2` is (2³)² = 64, where mathematics gives 2⁹ = 512:

```sql run
SELECT -2 ^ 2 AS a, 2 ^ 3 ^ 2 AS b, -(2 ^ 2) AS c, 2 ^ (3 ^ 2) AS d;
```

With powers, parentheses that state the intent are the safe choice. Note too that in MySQL `^` means bitwise exclusive or, not a power; for portable SQL use `power`.

**Decimal places in `numeric` division.** `7.0 / 2` gives 3.5000000000000000: when dividing `numeric` values, PostgreSQL keeps enough decimal places to stay precise. For a fixed number of places, `round` at the end.

## Common mistakes {#mistakes}

**1. Missing integer division.** Splitting the stock into three equal parts:

```sql run
SELECT name, stock, round(stock / 3, 2) AS a, round(stock / 3.0, 2) AS b
FROM products;
```

In column `a`, 25 / 3 gives 8.00, because integer division dropped the fraction before `round` ever saw it. Write 3.0, or convert to `numeric`, to get 8.33. On a calculator and in most programming languages 7 / 2 is 3.5, and that habit misleads you in SQL.

**2. The wrong order of operations.** `price - 5 * stock` computes `5 * stock` first. To subtract first, write `(price - 5) * stock`.

**3. Money in floating point.** See Going deeper: floating point produces errors like 0.30000000000000004, and they add up until the books do not balance.

**4. Floating point into two-argument `round`.** With integer arguments, `sqrt`, `^` and `power` return floating-point numbers, but `round(x, n)` only accepts `numeric`:

```sql run error
SELECT round(sqrt(2), 2);
```

The error is `function round(double precision, integer) does not exist`. Convert the value to `numeric` first: `round(sqrt(2)::numeric, 2)`. `::` is explained in this chapter's last lesson.

**5. Rounding too early.** Rounding every row and then adding can differ by a few cents from adding and then rounding. Round as the last step.

## Summary {#summary}

- `+ - * / %` work as in mathematics, multiplication and division first; `%` is the remainder.
- An integer divided by an integer is an integer with the fraction dropped; for a decimal result, give one side a decimal point.
- Money belongs in exact `numeric`; floating point is approximate.
- `round(x, n)` rounds to n decimal places; `ceil`, `floor`, `trunc` and `abs` cover the other cases.
- Division by zero is an error, and NULL in arithmetic gives NULL.
