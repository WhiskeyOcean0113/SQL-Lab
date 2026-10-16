## Why you need it {#why}

Lin Wei's order 22 is still unpaid, and two more Ceramic Mugs (product 8) have just gone into the basket. If the order has no line for this product yet, add one; if it already has, add 2 to the quantity on it.

With the last two lessons, that takes two steps: look first, then choose between `INSERT` and `UPDATE`. If someone else gets in between the steps, or the check is written wrong, you end up with a duplicate line or a primary-key violation. "Change it if it exists, add it if not" is common enough to have a name of its own.

## Core idea {#core}

### Try to insert, and handle the conflict

{{Term:upsert}} is a blend of update and insert. PostgreSQL writes it as an `ON CONFLICT` clause after an `INSERT`: insert as usual, and if a row collides with a primary key or unique constraint, do not fail; carry out the action you specified instead.

```sql run
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (22, 8, 2, 12.50)
ON CONFLICT (order_id, product_id)
DO UPDATE SET quantity = order_items.quantity + EXCLUDED.quantity
RETURNING *;
```

Order 22 already had one Ceramic Mug, so no new row was inserted; the quantity became 3 instead.

### What a conflict can do

- **`DO NOTHING`**: skip the row, quietly, with no error.
- **`DO UPDATE SET …`**: change the existing row as your `SET` says, exactly like the `SET` of an `UPDATE`.

### Two names: the table and `EXCLUDED`

Inside `DO UPDATE`, each column exists in two versions:

| Written | Means |
|---|---|
| `order_items.quantity` | The value in the row already in the table |
| `EXCLUDED.quantity` | The value you tried to insert, held back by the conflict |

"Add 2 to the existing quantity" is `order_items.quantity + EXCLUDED.quantity`.

### What decides a conflict

The columns in the brackets of `ON CONFLICT (order_id, product_id)` are the conflict target, and they must be exactly the columns of a primary key or unique constraint. That constraint is how the database knows "this row already exists". Without a constraint, there is nothing to conflict with.

## Syntax {#syntax}

```syntax
INSERT INTO table_name [ AS alias ] [ ( column_name [, …] ) ]
VALUES ( expression [, …] ) [, …]
ON CONFLICT [ ( column_name [, …] ) ]
{ DO NOTHING | DO UPDATE SET column_name = expression [, …] [ WHERE condition ] }
[ RETURNING { * | expression [ [ AS ] output_name ] } [, …] ]
```

| Part | What goes there | Rule |
|---|---|---|
| `ON CONFLICT ( column_name [, …] )` | The conflict target: the columns of a primary key or unique constraint | Optional with `DO NOTHING`, meaning any unique conflict is skipped; required with `DO UPDATE` |
| `DO NOTHING` | Skip the conflicting row | Skipped rows do not appear in `RETURNING` |
| `DO UPDATE SET` | Change the existing row | Written like the `SET` of `UPDATE`; `EXCLUDED.column` is the held-back new value |
| `WHERE condition` (after `DO UPDATE`) | Change the row only when this holds | Optional; otherwise the row is left alone |
| `AS alias` | An alias for the target table | Optional; handy on the right of `SET` when the table name is long |

The rest of the `INSERT` is exactly as in lesson 1.

Some statements, read against the shape:

- `ON CONFLICT (order_id, product_id) DO UPDATE SET quantity = order_items.quantity + EXCLUDED.quantity`: the target is `order_items`'s composite primary key, and on a conflict the quantities are added.
- `ON CONFLICT DO NOTHING`: no target, so any unique conflict is skipped.
- `ON CONFLICT (id) DO UPDATE SET price = EXCLUDED.price WHERE EXCLUDED.price < products.price`: conflicts on id, updating only when the new price is lower.

## Example {#example}

The task: add two more Ceramic Mugs (product 8, 12.50 each) and one SQL Pocket Guide (product 3, 19.99) to order 22. For products already in the order, add to the quantity; for the others, add a line.

1. **Write the `INSERT` as usual, both rows together.**
2. **Choose the conflict target.** An order can have only one line per product, which is exactly `order_items`'s primary key `(order_id, product_id)`.
3. **Decide what a conflict does.** Add the quantities: the existing `order_items.quantity` plus the held-back `EXCLUDED.quantity`. Leave the unit price alone.
4. **Look at the result with `RETURNING`.**

```sql run
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (22, 8, 2, 12.50),
       (22, 3, 1, 19.99)
ON CONFLICT (order_id, product_id)
DO UPDATE SET quantity = order_items.quantity + EXCLUDED.quantity
RETURNING *;
```

The Ceramic Mug was already in the order, so its quantity went from 1 to 3; the SQL Pocket Guide was not, so it got a new line. One statement, two outcomes, row by row.

## Variations {#variants}

**`DO NOTHING`: skip what is already there.** Import three categories at once, one of which, Books, already exists:

```sql run
INSERT INTO categories (id, name)
VALUES (6, 'Garden'), (1, 'Books'), (7, 'Toys')
ON CONFLICT DO NOTHING
RETURNING *;
```

Only two rows come back; Books was skipped without a fuss. With no conflict target, a conflict on any unique constraint is skipped, and here both `id` and `name` collided.

**Syncing products from a price list.** A supplier sends new prices: products already in the table get the new price, new ones are added:

```sql run
INSERT INTO products (id, name, category_id, price, stock, launched_on)
VALUES (3, 'SQL Pocket Guide', 1, 21.99, 40, '2022-06-20'),
       (17, 'Plant Pot', 3, 9.99, 40, '2024-07-01')
ON CONFLICT (id)
DO UPDATE SET price = EXCLUDED.price
RETURNING id, name, price;
```

Product 3 changed only its price; its stock is still the original 40. Columns not named in `SET` are not overwritten by the `EXCLUDED` values.

**Updating only when it makes sense.** Update only if the new price is lower:

```sql run
INSERT INTO products (id, name, category_id, price, stock, launched_on)
VALUES (3, 'SQL Pocket Guide', 1, 25.00, 40, '2022-06-20')
ON CONFLICT (id)
DO UPDATE SET price = EXCLUDED.price
WHERE EXCLUDED.price < products.price
RETURNING id, price;
```

25.00 is above the current 19.99, so the condition fails, the row is left alone and `RETURNING` is empty. Change the price to 17.99 and run it again to see it update.

## Going deeper {#deeper}

**Why not look first, then decide?** "`SELECT`, then `INSERT` if missing or `UPDATE` if present" works fine for one user. But when two requests arrive together, both may see "missing" and both `INSERT`, and the second fails on the primary key. `ON CONFLICT` puts the check and the write in one statement, and the database guarantees this cannot happen.

**One statement cannot hit the same row twice.**

```sql run error
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (22, 8, 2, 12.50),
       (22, 8, 1, 12.50)
ON CONFLICT (order_id, product_id)
DO UPDATE SET quantity = order_items.quantity + EXCLUDED.quantity;
```

`ON CONFLICT DO UPDATE command cannot affect row a second time`: both proposed rows point at product 8 of order 22. Combine them into one row with a quantity of 3 first.

**Only the target constraint counts.** `ON CONFLICT (id)` handles conflicts on `id` alone. A new category with `id` 6 but the existing name Books collides with the unique constraint on `name` instead, and still fails with a `duplicate key` error.

**`MERGE`.** Since PostgreSQL 15, standard SQL's `MERGE` statement pairs a source table with a target by a condition, running `WHEN MATCHED THEN UPDATE …` for matches and `WHEN NOT MATCHED THEN INSERT …` for the rest. It is more general (it can also delete on a match, for instance), but it does not guarantee conflict-free behaviour under concurrency the way `ON CONFLICT` does. For everyday "change it or add it", `ON CONFLICT` is simpler and safer.

**Other databases.** SQLite uses the same `ON CONFLICT … DO UPDATE`; MySQL writes `INSERT … ON DUPLICATE KEY UPDATE`; SQL Server and Oracle use `MERGE`.

## Common mistakes {#mistakes}

**1. `DO UPDATE` without a conflict target.**

```sql run error
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (22, 8, 2, 12.50)
ON CONFLICT DO UPDATE SET quantity = 5;
```

`ON CONFLICT DO UPDATE requires inference specification or constraint name`, and the HINT gives an example, `ON CONFLICT (column_name)`. Only `DO NOTHING` may leave the target out.

**2. A target that is not a unique constraint.** `ON CONFLICT (country)` fails with `there is no unique or exclusion constraint matching the ON CONFLICT specification`. Countries repeat, so "this country already exists" is not a conflict.

**3. An ambiguous column on the right of `SET`.**

```sql run error
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (22, 8, 2, 12.50)
ON CONFLICT (order_id, product_id)
DO UPDATE SET quantity = quantity + EXCLUDED.quantity;
```

`column reference "quantity" is ambiguous`: both the existing row and `EXCLUDED` have a `quantity`. Write `order_items.quantity`.

**4. Meaning to add, but using `EXCLUDED` alone.** `SET quantity = EXCLUDED.quantity` raises no error, but it sets the quantity to this time's 2 instead of the original 1 plus 2. Decide whether you mean "replace" or "add to".

**5. Expecting `ON CONFLICT` to handle every error.** It handles unique conflicts on its target and nothing else. A missing foreign key, a NOT NULL or a check constraint still fails: inserting a nonexistent product 99 fails with `violates foreign key constraint` even with `DO NOTHING`.

## Summary {#summary}

- `INSERT … ON CONFLICT` tries to insert, and on a primary-key or unique collision carries out the given action instead.
- `DO NOTHING` skips conflicting rows; `DO UPDATE SET` changes the existing row.
- Inside `DO UPDATE`, `table.column` is the existing value and `EXCLUDED.column` the held-back new one.
- The conflict target must match a primary key or unique constraint, and `DO UPDATE` requires one.
- Checking and writing happen in one statement, which is safer than "look, then change"; one statement cannot hit the same row twice.
