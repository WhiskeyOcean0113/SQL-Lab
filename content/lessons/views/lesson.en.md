## Why you need it {#why}

The previous lesson said an order's total is better computed when needed than stored. But computing it takes a join and a grouping: join `orders` to `order_items`, group by order, add up `quantity * unit_price`. The monthly report needs it, the support dashboard needs it, and so does the customer leaderboard.

Copy it into each place, and sooner or later one copy is wrong, or the rule changes and only some copies are updated. Support staff also need to see orders but should not see customers' emails. Could the query be stored in the database under a name, so that anyone who needs it queries it like a table?

## Core idea {#core}

### A query with a name

A {{term:view}} is a named query stored in the database. Create it with `CREATE VIEW`, and from then on query it like a table:

```sql run
CREATE VIEW order_totals AS
SELECT o.id AS order_id, o.customer_id, o.status, o.ordered_at,
       sum(i.quantity * i.unit_price) AS total
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
GROUP BY o.id;

SELECT * FROM order_totals WHERE customer_id = 1 ORDER BY ordered_at;
```

### It stores no data

A view stores the query, not its result. Each time the view is queried, the database runs that query afresh, so a view always shows the tables as they are now:

```sql run
CREATE VIEW order_totals AS
SELECT o.id AS order_id, o.customer_id, o.status, o.ordered_at,
       sum(i.quantity * i.unit_price) AS total
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
GROUP BY o.id;

UPDATE order_items SET quantity = 5 WHERE order_id = 1 AND product_id = 8;
SELECT order_id, total FROM order_totals WHERE order_id = 1;
```

Change an item, and order 1's total moves from 67.00 to 104.50 at once. This is exactly the previous lesson's "compute when needed", without rewriting the query every time.

### What views are for

- **Encapsulation**: a complicated join and calculation is written once; users need only the view's name and columns.
- **Consistency**: the rule lives in one place, and changing the view changes it everywhere the view is used.
- **Limiting what is visible**: a view can expose only some columns and rows. The database can also grant someone access to a view without access to the tables beneath it.

Compared with a {{term:cte}}: a CTE lives for one statement, while a view lasts until it is dropped.

## Syntax {#syntax}

```syntax
CREATE [ OR REPLACE ] VIEW view_name [ ( column_name [, …] ) ] AS
select_statement
[ WITH CHECK OPTION ]
```

```syntax
DROP VIEW [ IF EXISTS ] view_name
```

| Part | What goes there | Rule |
|---|---|---|
| `OR REPLACE` | Replace an existing view of the same name | Optional; without it, an existing view is an error; a replacement may only add columns at the end, not drop, rename or reorder them |
| `view_name` | The view's name | Shares one set of names with tables, so it cannot match an existing table |
| `( column_name [, …] )` | The view's column names | Optional; without it, the query's column names are used |
| `select_statement` | Any query | Run afresh each time the view is queried |
| `WITH CHECK OPTION` | Rows written through the view must still satisfy its `WHERE` | Optional; meaningful only for views that can be changed |
| `DROP VIEW` | Removes the view | Removes only the query; the data in the tables is untouched |

Some statements, read against the shapes:

- `CREATE VIEW order_totals AS SELECT … GROUP BY o.id` in Core idea: no column list, so the column names come from the aliases in the query.
- `CREATE VIEW order_counts (customer_id, orders) AS SELECT customer_id, count(*) FROM orders GROUP BY customer_id`: the column list names `count(*)`.
- `CREATE OR REPLACE VIEW v AS SELECT id, name, email FROM customers`: replaces a view that had only `id, name`, adding a column at the end.

## Example {#example}

The task: the three customers who have spent the most, not counting cancelled orders, answered through the view `order_totals`.

1. **Create the view.** Store "each order's total" as `order_totals`, keeping `customer_id` and `status` so it can be filtered by customer and status later.
2. **Use the view as a table.** Join it to `customers` for the names.
3. **Filter, group and sort.** Exactly as with an ordinary table.

```sql run
CREATE VIEW order_totals AS
SELECT o.id AS order_id, o.customer_id, o.status,
       sum(i.quantity * i.unit_price) AS total
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
GROUP BY o.id;

SELECT c.name, count(*) AS orders, sum(t.total) AS spent
FROM order_totals AS t
JOIN customers AS c ON c.id = t.customer_id
WHERE t.status <> 'cancelled'
GROUP BY c.name
ORDER BY spent DESC
LIMIT 3;
```

The main query mentions no item table and no multiplication. If the rule for an order's total ever changes, to include shipping for instance, only the view needs editing.

## Variations {#variants}

**Naming a view's columns.** A list after the name names every column at once, so `count(*)` needs no `AS`:

```sql run
CREATE VIEW order_counts (customer_id, orders) AS
SELECT customer_id, count(*)
FROM orders
GROUP BY customer_id;

SELECT * FROM order_counts ORDER BY customer_id LIMIT 3;
```

**Changing data through a simple view.** A view that only picks columns and rows from one table, without grouping or aggregates, accepts `UPDATE`, `INSERT` and `DELETE` directly, and the change lands in the underlying table:

```sql run
CREATE VIEW canadian_customers AS
SELECT id, name, email, city
FROM customers
WHERE country = 'Canada';

UPDATE canadian_customers
SET city = 'Vancouver'
WHERE id = 6
RETURNING *;
```

**`WITH CHECK OPTION`: no writing outside the view.** Without it, you could insert an Australian customer through the "Canadian customers" view and then not see the row in it. With it, such a write is refused:

```sql run error
CREATE VIEW canadian_customers AS
SELECT id, name, email, city, country, joined_on
FROM customers
WHERE country = 'Canada'
WITH CHECK OPTION;

INSERT INTO canadian_customers (id, name, country, joined_on)
VALUES (13, 'Olivia Brown', 'Australia', '2024-07-01');
```

`new row violates check option for view "canadian_customers"`.

**{{Term:materialized-view|Materialized views}}: keeping the result.** An ordinary view recomputes every time. When the computation is slow and the data need not be up to the second, a materialized view stores the result as a table, refreshed when you ask:

```sql run
CREATE MATERIALIZED VIEW order_count AS
SELECT count(*) AS n FROM orders;

INSERT INTO orders (id, customer_id, ordered_at, status)
VALUES (25, 1, '2024-07-01 10:00', 'pending');

SELECT (SELECT n FROM order_count) AS stored,
       (SELECT count(*) FROM orders) AS actual;
```

The materialized view still holds 24 while the table already has 25 orders. Add the line `REFRESH MATERIALIZED VIEW order_count;` before the last `SELECT` and run it again, and `stored` becomes 25.

## Going deeper {#deeper}

**A view is neither faster nor slower.** When you query a view, PostgreSQL expands its definition and optimises it together with the outer query, just as if you had written the SQL in place. Views organise code; they do not speed it up. When speed is the problem, use a materialized view, or Chapter 9's {{term:index|indexes}}.

**`SELECT *` is expanded when the view is created.** A view made with `CREATE VIEW v AS SELECT * FROM categories` fixes its columns as `id, name` at that moment. A column added to `categories` later does not appear in the view. Name the columns in a view explicitly.

**A view depends on the columns it uses.** If a view uses `customers.city`, that column cannot simply be dropped: the database reports `cannot drop column city of table customers because other objects depend on it`. Before dropping a table or column, deal with the views that depend on it, or say `CASCADE` explicitly to drop them too.

**`ORDER BY` in a view is unreliable.** A view may contain `ORDER BY`, but once the outer query joins, groups or filters, the order is no longer guaranteed. When order matters, put `ORDER BY` in the statement that queries the view.

**Other databases.** Ordinary views are everywhere. Updatable views and `WITH CHECK OPTION` are standard SQL, with broadly similar rules; Oracle has materialized views too, SQL Server calls them indexed views, and MySQL has none.

## Common mistakes {#mistakes}

**1. Expecting a view to hold the data as it was when created.** An ordinary view reruns its query every time and always shows current data. For a snapshot that never changes, use `CREATE TABLE … AS`; for a cache refreshed now and then, a materialized view.

**2. Changing an existing view with `CREATE VIEW`.**

```sql run error
CREATE VIEW customer_contacts AS SELECT id, name FROM customers;
CREATE VIEW customer_contacts AS SELECT id, name, email FROM customers;
```

`relation "customer_contacts" already exists`. To change an existing view, write `CREATE OR REPLACE VIEW`.

**3. Dropping or reordering columns with `OR REPLACE`.**

```sql run error
CREATE VIEW customer_contacts AS SELECT id, name FROM customers;
CREATE OR REPLACE VIEW customer_contacts AS SELECT name, id FROM customers;
```

`cannot change name of view column "id" to "name"`. `OR REPLACE` can only add columns at the end. To drop or reorder columns, `DROP VIEW` first and create it again.

**4. Changing a grouped view.**

```sql run error
CREATE VIEW order_totals AS
SELECT o.id AS order_id, sum(i.quantity * i.unit_price) AS total
FROM orders AS o
JOIN order_items AS i ON i.order_id = o.id
GROUP BY o.id;

UPDATE order_totals SET total = 0 WHERE order_id = 1;
```

`cannot update view "order_totals"`, and the DETAIL says `Views containing GROUP BY are not automatically updatable`. The total is computed, so the database cannot know which item to change. Change the underlying tables instead.

**5. Unnamed computed columns in a view.** In `CREATE VIEW v AS SELECT customer_id, count(*) FROM orders GROUP BY customer_id` the second column is called `count`, and users are left guessing what it counts. A view is an interface for others, and every column deserves a clear name.

## Summary {#summary}

- A view is a named query stored in the database, created with `CREATE VIEW name AS query` and queried like a table.
- A view stores no data; it reruns its query each time, so it always shows current data.
- Views encapsulate complex queries, keep rules in one place, and limit which columns and rows others see.
- Simple views over one table without grouping can be changed through; `WITH CHECK OPTION` forbids writing rows outside the view.
- Change a view with `CREATE OR REPLACE`, which can only add columns at the end; a materialized view stores its result and is updated with `REFRESH`.
