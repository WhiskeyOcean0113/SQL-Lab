-- Five items, one of them without a category.
CREATE TABLE items (
  id       integer PRIMARY KEY,
  name     text NOT NULL,
  price    numeric(6, 2) NOT NULL,
  category text
);

INSERT INTO items VALUES
  (1, 'pen',     1.50,   'office'),
  (2, 'desk',    120.00, 'furniture'),
  (3, 'lamp',    35.00,  NULL),
  (4, 'chair',   80.00,  'furniture'),
  (5, 'stapler', 9.00,   'office');
