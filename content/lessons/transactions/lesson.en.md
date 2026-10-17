## Why you need it {#why}

Priya Nair (customer 7) buys two USB-C Hubs. The system has three things to do: create the order in `orders`, record the item in `order_items`, and take 2 off the stock in `products`.

What if the server loses power after step two? The order and its item are written, but the stock was never reduced, so the warehouse thinks it still has goods that are already sold. The other way round, the stock goes down but no order is written, and two hubs vanish into thin air. The three steps must all happen or not happen at all; they cannot stop halfway.

## Core idea {#core}

### Binding statements into one unit

A {{term:transaction}} is a group of statements treated as one unit. `BEGIN` starts it and `COMMIT` confirms it; all the changes in between take effect together or are undone together:

```sql run
BEGIN;
INSERT INTO orders (id, customer_id, ordered_at, status)
VALUES (25, 7, '2024-07-01 10:00', 'paid');
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (25, 6, 2, 35.00);
UPDATE products SET stock = stock - 2 WHERE id = 6;
COMMIT;

SELECT o.id, o.status, i.quantity, p.stock
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
JOIN products AS p ON p.id = i.product_id
WHERE o.id = 25;
```

### Changing your mind: `ROLLBACK`

Until `COMMIT`, `ROLLBACK` undoes every change in the transaction and puts the data back as it was before `BEGIN`:

```sql run
BEGIN;
DELETE FROM order_items;
SELECT count(*) AS inside FROM order_items;
ROLLBACK;
SELECT count(*) AS after_rollback FROM order_items;
```

Inside the transaction, after the `DELETE`, there really are 0 rows; after `ROLLBACK`, all 42 are back.

### An error spoils the whole transaction

Once any statement in a transaction fails, the transaction cannot go on. PostgreSQL refuses every further statement until you end it:

```sql
BEGIN;
INSERT INTO orders (id, customer_id, ordered_at, status) VALUES (25, 7, '2024-07-01 10:00', 'paid');
SELECT 1 / 0;              -- division by zero
SELECT * FROM orders;      -- current transaction is aborted, commands ignored until end of transaction block
COMMIT;                    -- actually performs a ROLLBACK
```

Even though it says `COMMIT`, the database performs a `ROLLBACK`: order 25 is not kept. A failed transaction can only be undone as a whole.

### Without `BEGIN`

Without `BEGIN`, each statement is a transaction of its own, committed as soon as it succeeds. This is {{term:autocommit}}. Every `INSERT`, `UPDATE` and `DELETE` in the last three lessons worked this way: within one statement, everything succeeds or nothing does, but separate statements have no bond between them.

### In SQL Lab

SQL Lab puts each run inside a transaction of its own and undoes it when the run ends. Your `BEGIN`, `COMMIT` and `ROLLBACK` behave exactly as on a real database during the run; afterwards, even committed changes are undone, and the next run starts again from the original data.

## Syntax {#syntax}

```syntax
BEGIN
statement; [ … ]
{ COMMIT | ROLLBACK }
```

```syntax
SAVEPOINT savepoint_name
ROLLBACK TO [ SAVEPOINT ] savepoint_name
RELEASE [ SAVEPOINT ] savepoint_name
```

| Part | Does | Rule |
|---|---|---|
| `BEGIN` | Starts a transaction | Can also be written `START TRANSACTION` |
| `statement` | A statement in the transaction | Any number, each ending with a semicolon |
| `COMMIT` | Confirms; makes every change take effect | Can also be written `END`; after an error it actually rolls back |
| `ROLLBACK` | Undoes the whole transaction | Without `TO`, back to before `BEGIN` |
| `SAVEPOINT savepoint_name` | Marks a point inside the transaction | Only inside a transaction |
| `ROLLBACK TO savepoint_name` | Undoes only the changes after the mark | The transaction goes on, and earlier changes stay |
| `RELEASE savepoint_name` | Removes the mark | Changes stay; you just cannot return there any more |

In the first shape, `statement; [ … ]` means one or more statements. Unlike the `[, …]` seen before, they are separated by semicolons, not commas.

Some transactions, read against the shapes:

- The first example in Core idea: `BEGIN`, three `statement`s, `COMMIT`.
- The second: `BEGIN`, two `statement`s, `ROLLBACK`, and every change is undone.
- `SAVEPOINT before_discount` … `ROLLBACK TO SAVEPOINT before_discount`: undoes only what happened between the two lines; see Variations.

## Example {#example}

The task: Chen Yu's (customer 5) order 15, three USB-C Hubs with status paid, is to be cancelled. Its status becomes cancelled and the three hubs go back into stock. Both must happen together.

1. **Start the transaction with `BEGIN`.**
2. **Change the order's status.** Update one row by primary key.
3. **Put the item quantities back into stock.** Use last lesson's `UPDATE … FROM`, adding each of the order's item quantities back to its product.
4. **Confirm with `COMMIT`.** If either `UPDATE` fails, the transaction is spoilt, and the order can never end up "cancelled, but with its stock not returned".
5. **Look at the result.**

```sql run
BEGIN;

UPDATE orders
SET status = 'cancelled'
WHERE id = 15;

UPDATE products AS p
SET stock = p.stock + i.quantity
FROM order_items AS i
WHERE i.product_id = p.id
  AND i.order_id = 15;

COMMIT;

SELECT o.id, o.status, p.name, p.stock
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
JOIN products AS p ON p.id = i.product_id
WHERE o.id = 15;
```

The USB-C Hub's stock went from 60 to 63.

## Variations {#variants}

**An experiment with `ROLLBACK`.** You want to see what the dearest product would cost after a 10% rise everywhere, without really changing anything:

```sql run
BEGIN;
UPDATE products SET price = round(price * 1.1, 2);
SELECT max(price) AS new_max FROM products;
ROLLBACK;
SELECT max(price) AS real_max FROM products;
```

Inside the transaction it is 438.90; after the rollback it is still 399.00.

**Savepoints: undoing part of the way.** Restock the 4K Monitor with 10 units, then try half price; change your mind and undo only the discount, keeping the restock:

```sql run
BEGIN;
UPDATE products SET stock = stock + 10 WHERE id = 7;
SAVEPOINT before_discount;
UPDATE products SET price = price * 0.5 WHERE id = 7;
ROLLBACK TO SAVEPOINT before_discount;
COMMIT;

SELECT name, price, stock FROM products WHERE id = 7;
```

The price is still 399.00 and the stock went from 0 to 10. A {{term:savepoint}} is like a save point in a game: `ROLLBACK TO` returns to it, earlier changes are untouched, and the transaction carries on.

## Going deeper {#deeper}

**ACID.** A database makes four promises about transactions, known by their initials as ACID:

| Letter | Name | Guarantees | Example from this lesson |
|---|---|---|---|
| A | {{term:atomicity|Atomicity}} | A transaction's changes take effect entirely or not at all | The two `UPDATE`s that cancel an order never happen by halves |
| C | {{term:consistency|Consistency}} | When a transaction ends, every constraint holds | A transaction that makes stock negative cannot commit |
| I | {{term:isolation|Isolation}} | Concurrent transactions do not interfere, as if they ran one after another | Nobody else sees your uncommitted changes |
| D | {{term:durability|Durability}} | Once committed, changes are not lost, even if the power fails at once | When `COMMIT` returns, order 25 is safe |

**Isolation comes in degrees.** Complete isolation is expensive, so databases offer several {{term:isolation-level|isolation levels}} that trade correctness against speed. PostgreSQL's default is `read committed`. The `current_setting` function reads one of the database's current settings, named in the parentheses:

```sql run
SELECT current_setting('transaction_isolation');
```

| Isolation level | Sees new data others have committed? | Notes |
|---|---|---|
| `READ COMMITTED` (default) | Yes, as of the start of each statement | Two queries in one transaction may disagree |
| `REPEATABLE READ` | No; the whole transaction sees a snapshot from its start | Two queries in one transaction agree |
| `SERIALIZABLE` | No, and transactions that cannot be put in some serial order are refused | Safest; refused transactions must be retried |

At no level does PostgreSQL let you read data others have **not yet committed**. A level is chosen with `BEGIN ISOLATION LEVEL SERIALIZABLE`. SQL Lab has only your one connection, so these differences cannot show here; they matter in systems where many people change the same data at once.

**Keep transactions short.** Once a transaction has changed a row, any other transaction wanting to change that row must wait until it commits. The longer a transaction stays open, the longer the others wait. Never wait for user input in the middle of one.

**`now()` stands still in a transaction.** `now()` returns the time the transaction started, however often you call it within that transaction. For the real current time, use `clock_timestamp()`.

## Common mistakes {#mistakes}

**1. Expecting earlier changes to survive an error after `BEGIN`.** When a statement in a transaction fails, the whole transaction is spoilt. In SQL Lab the run stops at the first error; on a real database, later statements are refused and the final `COMMIT` actually rolls back:

```sql run error
BEGIN;
UPDATE products SET stock = stock - 30 WHERE id = 1;
INSERT INTO order_items (order_id, product_id, quantity, unit_price)
VALUES (22, 1, 30, 42.00);
COMMIT;
```

The very first `UPDATE` breaks the check constraint, since only 25 are in stock. That is exactly what we want: with too little stock, the order item should not be written either.

**2. Forgetting `COMMIT`.** After `BEGIN` with no `COMMIT`, your own connection sees the changes but nobody else does, and when the connection closes they are all lost. Every `BEGIN` needs a matching `COMMIT` or `ROLLBACK`.

**3. Rolling back to a savepoint that does not exist.**

```sql run error
BEGIN;
UPDATE products SET stock = 0 WHERE id = 3;
ROLLBACK TO SAVEPOINT before_change;
```

`savepoint "before_change" does not exist`: you must set the mark with `SAVEPOINT before_change` before you can return to it. A savepoint that has been `RELEASE`d cannot be returned to either.

**4. A savepoint outside a transaction.** `SAVEPOINT a` without `BEGIN` fails with `SAVEPOINT can only be used in transaction blocks`. Savepoints are marks inside a transaction.

**5. Expecting `ROLLBACK` to undo a committed transaction.** A `ROLLBACK` after `COMMIT` does nothing; PostgreSQL just warns that there is no transaction in progress. Committed changes can only be reversed with new statements, or restored from a backup.

## Summary {#summary}

- A transaction binds statements into one unit: `BEGIN` starts it, `COMMIT` makes it take effect, `ROLLBACK` undoes it.
- If any statement in a transaction fails, the whole transaction is spoilt and can only be rolled back.
- Without `BEGIN`, each statement is its own transaction, committed automatically when it succeeds.
- `SAVEPOINT` and `ROLLBACK TO` undo part of a transaction.
- ACID: atomicity, consistency, isolation, durability; PostgreSQL's default isolation level is read committed.
