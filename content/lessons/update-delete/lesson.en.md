## Why you need it {#why}

Data does not stay as it was written. Order 15 shipped today, so its status must change from paid to shipped and its shipping time must be recorded. Discontinued products have to go, and cancelled orders need clearing out.

The previous lesson could only add rows. This one changes and deletes existing rows. Both are far more dangerous than `INSERT`: one wrong `UPDATE` can rewrite a whole table in an instant.

## Core idea {#core}

### UPDATE: which rows, and what to

`UPDATE` answers two questions: `WHERE` picks the rows to change, and `SET` gives the new values.

```sql run
UPDATE orders
SET status = 'shipped', shipped_at = '2024-07-02 09:00'
WHERE id = 15
RETURNING id, status, shipped_at;
```

A value after `SET` can be an expression using the row's **old** values: `SET stock = stock + 20` means "20 more than before". Every expression in one `SET` sees the values as they were before the change.

### DELETE: which rows

`DELETE` answers one question: which rows to remove. It always removes whole rows; there is no "deleting a column" from a row. To empty one cell, use `UPDATE … SET column = NULL`.

```sql run
DELETE FROM orders
WHERE id = 24
RETURNING *;
```

### WHERE decides everything

The `WHERE` of `UPDATE` and `DELETE` works exactly as in a query: it tests each row, and only rows for which it is true are changed or deleted. **Without `WHERE`, that is every row in the table.** The database will not ask whether you are sure.

So before changing data, get into a habit: write a `SELECT` with the same `WHERE`, see exactly which rows it picks, then replace the `SELECT` with `UPDATE` or `DELETE`.

### Constraints still apply

Every changed row must pass the constraints: stock cannot become negative, and a category id cannot point at a missing category. When deleting, a {{term:foreign-key}} stops you removing rows that other rows still reference, such as an order that still has items.

## Syntax {#syntax}

```syntax
UPDATE table_name [ [ AS ] alias ]
SET column_name = { expression | DEFAULT } [, …]
[ FROM from_item [, …] ]
[ WHERE condition ]
[ RETURNING { * | expression [ [ AS ] output_name ] } [, …] ]
```

```syntax
DELETE FROM table_name [ [ AS ] alias ]
[ USING from_item [, …] ]
[ WHERE condition ]
[ RETURNING { * | expression [ [ AS ] output_name ] } [, …] ]
```

| Part | What goes there | Rule |
|---|---|---|
| `table_name` | The table to change or delete from | One table per statement |
| `SET column_name = expression` | A column and its new value | Several separated by commas; no table name or alias before the column; expressions see old values |
| `FROM from_item` (`UPDATE`) | Other tables used to compute values or to filter | Optional; a PostgreSQL extension, with the conditions in `WHERE` |
| `USING from_item` (`DELETE`) | Other tables used to filter | Optional; also a PostgreSQL extension |
| `WHERE condition` | Picks the rows to change or delete | Optional in the grammar, but leaving it out means the whole table |
| `RETURNING` | The columns to see afterwards | Optional; `UPDATE` returns new values, `DELETE` returns the deleted rows |

Some statements, read against the shapes:

- `UPDATE orders SET status = 'shipped', shipped_at = '…' WHERE id = 15`: two `column_name = expression` pairs, separated by a comma.
- `UPDATE products SET stock = stock + 20 WHERE stock < 10`: the new value is computed from the old one, and `WHERE` picks several rows.
- `DELETE FROM orders WHERE id = 24 RETURNING *`: no `USING`; deletes one row by primary key and returns it.

## Example {#example}

The task: order 15 shipped at 2024-07-02 09:00. Change its status to shipped and record the shipping time.

1. **Find the row with a `SELECT` first.** Locate it by primary key, `id = 15`, confirm it is a single row, and look at it as it is now.
2. **Replace the `SELECT` with `UPDATE`, keeping the `WHERE` exactly.**
3. **Write both new values in `SET`, separated by a comma.**
4. **Check the result with `RETURNING`.**

```sql run
SELECT id, status, shipped_at FROM orders WHERE id = 15;
```

```sql run
UPDATE orders
SET status = 'shipped',
    shipped_at = '2024-07-02 09:00'
WHERE id = 15
RETURNING id, status, shipped_at;
```

`RETURNING` shows the values after the change. The run also reports "1 rows affected"; if that number is bigger than you expected, your `WHERE` was too broad.

## Variations {#variants}

**New values from old ones.** Ten percent off Books, rounded to two decimals:

```sql run
UPDATE products
SET price = round(price * 0.9, 2)
WHERE category_id = 1
RETURNING id, name, price;
```

**Several rows at once.** Add 20 to the stock of every product with fewer than 10:

```sql run
UPDATE products
SET stock = stock + 20
WHERE stock < 10
RETURNING name, stock;
```

**Changing rows using another table: `UPDATE … FROM`.** Order 22 is still unpaid; set each of its items' unit price to the product's current price. `FROM` brings in `products`, and `WHERE` holds the join condition:

```sql run
UPDATE order_items AS i
SET unit_price = p.price
FROM products AS p
WHERE p.id = i.product_id
  AND i.order_id = 22
RETURNING i.order_id, i.product_id, i.unit_price;
```

**A subquery decides which rows to delete.** Delete the customers who never placed an order:

```sql run
DELETE FROM customers AS c
WHERE NOT EXISTS (
  SELECT 1 FROM orders AS o WHERE o.customer_id = c.id
)
RETURNING id, name;
```

This is Chapter 5's `NOT EXISTS` in a new shell: the rows a `SELECT` would find are the rows `DELETE` removes.

**Items first, then the orders.** Clear out every cancelled order. The orders are still referenced by their items, so the items go first:

```sql run
DELETE FROM order_items
WHERE order_id IN (SELECT id FROM orders WHERE status = 'cancelled');

DELETE FROM orders
WHERE status = 'cancelled'
RETURNING id;
```

The first statement could also be `DELETE FROM order_items AS i USING orders AS o WHERE o.id = i.order_id AND o.status = 'cancelled'`; `USING` does for `DELETE` what `FROM` does for `UPDATE`.

## Going deeper {#deeper}

**`SET` sees only old values.** In `UPDATE products SET stock = stock - 1, price = price + 1`, both expressions use `stock` and `price` as they were before. That is why `SET a = b, b = a` swaps two columns without a temporary variable.

**`UPDATE … FROM` with several matches is unpredictable.** If several rows of the `FROM` table match the row being updated, PostgreSQL uses an arbitrary one of them, without any error. When using `FROM`, make sure the join matches at most one row for each row being changed, for instance by joining on a primary key.

**`TRUNCATE` empties a table.** `TRUNCATE order_items` is much faster than a `DELETE` without `WHERE`, because it does not process rows one by one. It takes no condition, and cannot be used on a table that a foreign key references, unless the referencing tables are truncated with it.

**Data-changing CTEs.** `DELETE`, `UPDATE` and `INSERT` can all go inside `WITH`, passing their rows to the main query through `RETURNING`. For example, summarising the rows you just deleted:

```sql run
WITH gone AS (
  DELETE FROM order_items
  WHERE order_id IN (5, 12)
  RETURNING *
)
SELECT count(*) AS deleted, sum(quantity * unit_price) AS value
FROM gone;
```

**Other databases.** `UPDATE … FROM` and `DELETE … USING` are PostgreSQL's forms; MySQL writes `UPDATE a JOIN b ON … SET …`, and SQL Server also supports `FROM`. Standard SQL has only subqueries, as in `SET unit_price = (SELECT price FROM products WHERE id = order_items.product_id)`. MySQL clients often run in safe-updates mode, which refuses an `UPDATE` or `DELETE` without a key condition; PostgreSQL offers no such guard.

## Common mistakes {#mistakes}

**1. Forgetting `WHERE`.**

```sql run
UPDATE products SET price = 10;
SELECT count(*) AS now_ten FROM products WHERE price = 10;
```

All 16 products now cost 10 dollars, without a single warning. It is the most common and most expensive mistake in changing data. On a real database, only a backup or a {{term:transaction}} can undo it (lesson 4).

**2. Joining columns in `SET` with `AND`.**

```sql run error
UPDATE products SET name = 'Clay Pot' AND price = 15 WHERE id = 8;
```

`invalid input syntax for type boolean: "Clay Pot"`: the database reads `name = ('Clay Pot' AND price = 15)` and tries to compute a Boolean. Separate columns with commas: `SET name = 'Clay Pot', price = 15`.

**3. A table name or alias on a `SET` column.**

```sql run error
UPDATE products AS p SET p.price = 1 WHERE p.id = 1;
```

`column "p" of relation "products" does not exist`, and the HINT is blunt: `SET target columns cannot be qualified with the relation name`. Write the bare column name on the left of `SET`; the alias is fine on the right and in `WHERE`.

**4. Picking rows with `= NULL`.** `UPDATE customers SET city = 'Unknown' WHERE city = NULL` changes nothing, because `city = NULL` is never true. As in queries, write `WHERE city IS NULL`.

**5. Deleting referenced rows first.**

```sql run error
DELETE FROM orders WHERE status = 'cancelled';
```

`violates foreign key constraint "order_items_order_id_fkey"`, and the DETAIL says order 5 `is still referenced from table "order_items"`. Delete the referencing items first, then the orders: the reverse of the order you insert them in.

**6. A new value that breaks a constraint.** `UPDATE products SET stock = stock - 50 WHERE id = 1` fails with `violates check constraint "products_stock_check"`: the stock is only 25, and taking 50 would make it negative. Constraints are checked on `UPDATE` just as on `INSERT`.

## Summary {#summary}

- `UPDATE table SET column = value, … WHERE condition` changes the chosen rows; expressions in `SET` use old values.
- `DELETE FROM table WHERE condition` removes whole rows.
- No `WHERE` means the whole table; run a `SELECT` with the same `WHERE` before you act.
- `UPDATE … FROM` and `DELETE … USING` consult other tables; a subquery can also decide which rows change.
- Constraints still apply: delete referenced rows last, and new values must pass check constraints.
