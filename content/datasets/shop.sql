-- shop: a small online store. The practice dataset for every chapter.
--
-- Small enough to trace by hand, but built to surface the classic traps:
--   * customers 11 and 12 have never ordered        (LEFT JOIN, NOT EXISTS)
--   * product 16 has never been ordered              (anti-join)
--   * product 15 has no category                     (INNER vs LEFT JOIN)
--   * some cities and emails are NULL                (three-valued logic, COUNT(col) vs COUNT(*))
--   * customers.referred_by points at customers      (self join)
--   * order 24 has no items                          (LEFT JOIN + aggregation)
--   * Liam O'Brien has an apostrophe                 (string literals)
-- Prices are in US dollars. Timestamps are UTC.

CREATE TABLE categories (
  id    integer PRIMARY KEY,
  name  text    NOT NULL UNIQUE
);

CREATE TABLE customers (
  id           integer PRIMARY KEY,
  name         text    NOT NULL,
  email        text    UNIQUE,
  city         text,
  country      text    NOT NULL,
  joined_on    date    NOT NULL,
  referred_by  integer REFERENCES customers (id)
);

CREATE TABLE products (
  id           integer       PRIMARY KEY,
  name         text          NOT NULL,
  category_id  integer       REFERENCES categories (id),
  price        numeric(8, 2) NOT NULL CHECK (price > 0),
  stock        integer       NOT NULL CHECK (stock >= 0),
  launched_on  date          NOT NULL
);

CREATE TABLE orders (
  id           integer   PRIMARY KEY,
  customer_id  integer   NOT NULL REFERENCES customers (id),
  ordered_at   timestamp NOT NULL,
  status       text      NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
  shipped_at   timestamp
);

CREATE TABLE order_items (
  order_id    integer       NOT NULL REFERENCES orders (id),
  product_id  integer       NOT NULL REFERENCES products (id),
  quantity    integer       NOT NULL CHECK (quantity > 0),
  unit_price  numeric(8, 2) NOT NULL,
  PRIMARY KEY (order_id, product_id)
);

INSERT INTO categories (id, name) VALUES
  (1, 'Books'),
  (2, 'Electronics'),
  (3, 'Home'),
  (4, 'Stationery'),
  (5, 'Outdoor');

INSERT INTO customers (id, name, email, city, country, joined_on, referred_by) VALUES
  (1,  'Lin Wei',       'lin.wei@example.com',      'Shanghai',  'China',     '2023-01-14', NULL),
  (2,  'Ava Thompson',  'ava.t@example.com',        'Toronto',   'Canada',    '2023-02-03', NULL),
  (3,  'Kenji Sato',    'kenji@example.com',        'Osaka',     'Japan',     '2023-02-20', 1),
  (4,  'Sofia Rossi',   'sofia.rossi@example.com',  'Milan',     'Italy',     '2023-03-11', 2),
  (5,  'Chen Yu',       'chenyu@example.com',       'Shanghai',  'China',     '2023-04-02', 1),
  (6,  'Noah Martin',   NULL,                       'Toronto',   'Canada',    '2023-05-18', 2),
  (7,  'Priya Nair',    'priya.nair@example.com',   'Bengaluru', 'India',     '2023-06-07', NULL),
  (8,  'Liam O''Brien', 'liam.obrien@example.com',  NULL,        'Ireland',   '2023-07-22', 4),
  (9,  'Zhang Min',     'zhang.min@example.com',    'Beijing',   'China',     '2023-09-01', 5),
  (10, 'Emma Dubois',   'emma.d@example.com',       'Lyon',      'France',    '2023-10-15', 4),
  (11, 'Lucas Silva',   'lucas.silva@example.com',  NULL,        'Brazil',    '2024-01-09', NULL),
  (12, 'Mei Tanaka',    NULL,                       'Osaka',     'Japan',     '2024-02-27', 3);

INSERT INTO products (id, name, category_id, price, stock, launched_on) VALUES
  (1,  'The Pragmatic Programmer',  1, 42.00,  25, '2022-11-01'),
  (2,  'Designing Data Apps',       1, 55.50,  12, '2023-03-15'),
  (3,  'SQL Pocket Guide',          1, 19.99,  40, '2022-06-20'),
  (4,  'Noise-Cancelling Headphones', 2, 249.00, 8, '2023-01-10'),
  (5,  'Mechanical Keyboard',       2, 129.00, 15, '2022-09-05'),
  (6,  'USB-C Hub',                 2, 35.00,  60, '2023-05-01'),
  (7,  '4K Monitor',                2, 399.00,  0, '2023-08-12'),
  (8,  'Ceramic Mug',               3, 12.50, 100, '2022-04-18'),
  (9,  'Desk Lamp',                 3, 48.00,  20, '2023-02-28'),
  (10, 'Linen Throw',               3, 65.00,   7, '2023-10-02'),
  (11, 'Fountain Pen',              4, 28.00,  30, '2022-12-12'),
  (12, 'Dot Grid Notebook',         4,  9.50, 150, '2022-03-03'),
  (13, 'Camping Lantern',           5, 39.00,  18, '2023-04-22'),
  (14, 'Trail Water Bottle',        5, 22.00,  45, '2023-06-30'),
  (15, 'Gift Card',              NULL, 50.00, 999, '2022-01-01'),
  (16, 'Folding Chair',             5, 58.00,   5, '2024-03-01');

INSERT INTO orders (id, customer_id, ordered_at, status, shipped_at) VALUES
  (1,  1,  '2024-01-05 09:12:00', 'delivered', '2024-01-06 14:00:00'),
  (2,  2,  '2024-01-08 18:40:00', 'delivered', '2024-01-10 10:30:00'),
  (3,  3,  '2024-01-15 07:05:00', 'delivered', '2024-01-16 09:00:00'),
  (4,  1,  '2024-02-02 21:30:00', 'delivered', '2024-02-04 11:15:00'),
  (5,  4,  '2024-02-14 12:00:00', 'cancelled', NULL),
  (6,  5,  '2024-02-20 08:45:00', 'delivered', '2024-02-21 16:20:00'),
  (7,  6,  '2024-03-01 15:10:00', 'delivered', '2024-03-03 09:40:00'),
  (8,  7,  '2024-03-09 10:25:00', 'delivered', '2024-03-11 13:05:00'),
  (9,  2,  '2024-03-18 19:55:00', 'shipped',   '2024-03-20 08:30:00'),
  (10, 8,  '2024-03-22 11:11:00', 'delivered', '2024-03-25 10:00:00'),
  (11, 9,  '2024-04-03 14:35:00', 'delivered', '2024-04-04 15:45:00'),
  (12, 3,  '2024-04-10 06:50:00', 'cancelled', NULL),
  (13, 10, '2024-04-21 20:05:00', 'delivered', '2024-04-23 12:10:00'),
  (14, 1,  '2024-05-02 13:15:00', 'shipped',   '2024-05-03 09:20:00'),
  (15, 5,  '2024-05-12 09:00:00', 'paid',      NULL),
  (16, 4,  '2024-05-19 17:45:00', 'delivered', '2024-05-21 10:50:00'),
  (17, 7,  '2024-05-28 22:10:00', 'shipped',   '2024-05-30 07:35:00'),
  (18, 9,  '2024-06-04 10:40:00', 'paid',      NULL),
  (19, 2,  '2024-06-09 16:20:00', 'pending',   NULL),
  (20, 6,  '2024-06-15 08:05:00', 'paid',      NULL),
  (21, 10, '2024-06-18 12:30:00', 'pending',   NULL),
  (22, 1,  '2024-06-22 19:00:00', 'pending',   NULL),
  (23, 8,  '2024-06-25 09:50:00', 'paid',      NULL),
  (24, 3,  '2024-06-28 11:25:00', 'pending',   NULL);

INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES
  (1,  1, 1,  42.00), (1,  8, 2,  12.50),
  (2,  4, 1, 249.00),
  (3,  3, 2,  19.99), (3, 12, 3,   9.50), (3, 11, 1, 28.00),
  (4,  5, 1, 129.00), (4,  6, 2,  35.00),
  (5,  7, 1, 399.00),
  (6,  2, 1,  55.50), (6,  3, 1,  19.99),
  (7,  9, 1,  48.00), (7,  8, 4,  12.50),
  (8, 13, 2,  39.00), (8, 14, 2,  22.00),
  (9, 10, 1,  65.00), (9, 15, 1,  50.00),
  (10, 1, 1,  42.00), (10, 2, 1,  55.50), (10, 3, 1, 19.99),
  (11, 4, 1, 239.00), (11, 6, 1,  35.00),
  (12, 5, 1, 129.00),
  (13, 11, 2, 28.00), (13, 12, 5,  9.50),
  (14, 14, 1, 22.00), (14, 13, 1, 39.00), (14, 9, 1, 48.00),
  (15, 6, 3,  35.00),
  (16, 8, 6,  12.50), (16, 10, 1, 65.00),
  (17, 1, 1,  42.00), (17, 12, 2,  9.50),
  (18, 15, 2, 50.00),
  (19, 5, 1, 129.00), (19, 4, 1, 249.00),
  (20, 3, 1,  19.99),
  (21, 9, 2,  48.00),
  (22, 2, 1,  55.50), (22, 11, 1, 28.00), (22, 8, 1, 12.50),
  (23, 14, 3, 22.00);
