## 为什么需要它 {#why}

`order_items` 记录了每种商品买了几件、单价多少，却没有记录这一行一共多少钱。“订单 3 里每一行的金额是多少？”答案要你自己算：数量乘以单价。

SQL 能直接在查询里算数。难点不在加减乘除本身，而在于结果的类型：同样是除法，`7 / 2` 和 `7.0 / 2` 给出的答案并不一样。

## 核心概念 {#core}

**四则运算和取余。** `+`、`-`、`*`、`/` 和数学里一样；`%` 是{{term:modulo}}，求除法的余数。先乘除后加减，需要改变顺序时加括号。

```sql run
SELECT order_id, product_id, quantity, unit_price,
       quantity * unit_price AS line_total
FROM order_items
WHERE order_id = 3;
```

**三类数值。** PostgreSQL 的数字主要分三种，算出来的结果由参与运算的类型决定：

| 类型 | 例子 | 特点 |
|---|---|---|
| 整数：`integer`、`bigint` | `stock`、`quantity` | 只有整数 |
| {{term:exact-numeric}}：`numeric(p, s)` | `price`、`unit_price` | 小数完全精确，适合金额 |
| {{term:floating-point}}：`real`、`double precision` | 科学计算 | 近似值，速度快，但会有微小误差 |

**整数除以整数，结果还是整数。** 这叫{{term:integer-division}}，小数部分直接截掉（向零取整），不会四舍五入：

```sql run
SELECT 7 / 2 AS a, 7 / 2.0 AS b, 7 % 2 AS c, -7 / 2 AS d;
```

`7 / 2` 是 3，`7 / 2.0` 才是 3.5。只要有一边带小数（或是 `numeric` 类型），结果就是精确小数。

## 语法 {#syntax}

算术表达式可以写在任何能写表达式的地方：选择列表、`WHERE`、`ORDER BY`。

```syntax
expression { + | - | * | / | % | ^ } expression
- expression
( expression )
function_name ( [ argument [, …] ] )
```

| 形状 | 意思 | 例子 |
|---|---|---|
| `expression + expression` 等 | 两个数相加、减、乘、除、取余、乘方 | `quantity * unit_price` |
| `- expression` | 取相反数 | `-price` |
| `( expression )` | 先算括号里的 | `(price - 5) * stock` |
| `function_name ( … )` | 调用一个{{term:function}}，括号里是参数，用逗号隔开 | `round(price, 1)` |

和 `condition` 一样，每个形状的结果**本身又是一个 `expression`**，所以可以层层嵌套：`round(price * 1.1, 2)` 里，`price * 1.1` 是一个表达式，它又成了 `round` 的第一个参数。

这一课用到的数值函数，格式如下。函数名紧跟着括号，表示照原样写：

```syntax
round(number [, decimal_places ])
trunc(number [, decimal_places ])
ceil(number)
floor(number)
abs(number)
power(base, exponent)
mod(dividend, divisor)
```

| 占位符 | 填什么 |
|---|---|
| `number` | 任何数值表达式 |
| `decimal_places` | 保留几位小数，整数；不写就是 0；可以是负数，表示取整到十位、百位 |
| `base`、`exponent` | 底数和指数 |
| `dividend`、`divisor` | 被除数和除数；`mod(a, b)` 和 `a % b` 相同 |

运算的先后，从高到低：

| 优先级 | 运算符 |
|---|---|
| 1 | `-`（取相反数） |
| 2 | `^`（乘方） |
| 3 | `*`、`/`、`%` |
| 4 | `+`、`-` |

同一级的运算从左往右算。这和数学课上的规则有两处不同，见“深入”。

## 示例 {#example}

问题：所有商品加价 10% 以后，新价格是多少？保留两位小数，列命名为 `new_price`。

1. **写出计算式。** 加价 10% 就是乘以 1.1：`price * 1.1`。
2. **检查结果的类型和位数。** `price` 是 `numeric(8, 2)`，乘以 1.1 后会有三位小数（46.200）。
3. **用{{term:function}}取整。** `round(x, 2)` 四舍五入到两位小数。
4. **起名。** `AS new_price`。

```sql run
SELECT name, price, round(price * 1.1, 2) AS new_price
FROM products;
```

SQL Pocket Guide 的 19.99 × 1.1 = 21.989，四舍五入成 21.99。函数的写法是“名字(参数)”，它对每一行计算一次，返回一个值，可以用在任何能写表达式的地方。

## 变体 {#variants}

**其他取整函数。** `ceil` 向上取整，`floor` 向下取整，`trunc` 直接截掉小数，`abs` 取绝对值：

```sql run
SELECT ceil(4.1) AS ceil, floor(4.9) AS floor, trunc(4.99) AS trunc, abs(-3) AS abs;
```

**整除和取余配合使用。** 每箱装 4 件，库存能装满几箱，还剩几件？

```sql run
SELECT name, stock, stock / 4 AS full_boxes, stock % 4 AS leftover
FROM products;
```

这里的整数除法正好是我们想要的：The Pragmatic Programmer 有 25 件，装满 6 箱，剩 1 件。

**乘方、取余的函数写法。** `power(2, 10)` 和 `2 ^ 10` 相同，`mod(17, 5)` 和 `17 % 5` 相同：

```sql run
SELECT power(2, 10) AS power, mod(17, 5) AS mod, sqrt(16) AS sqrt;
```

**取整到十位、百位。** `round` 的第二个参数可以是负数：

```sql run
SELECT name, price * stock AS stock_value, round(price * stock, -2) AS rounded
FROM products;
```

The Pragmatic Programmer 的库存总价 1050.00 取整到百位，正好一半，远离零取整成 1100。

**同一行的几列一起算。** 库存总价 `price * stock`、单件利润、折后价，都是把同一行里的列组合起来。

## 深入 {#deeper}

**精确小数和浮点数的差别。** `numeric` 的 0.1 + 0.2 正好等于 0.3；而浮点数存的是二进制近似值：

```sql run
SELECT 0.1 + 0.2 = 0.3 AS numeric_equal,
       0.1::float8 + 0.2::float8 = 0.3::float8 AS float_equal,
       0.1::float8 + 0.2::float8 AS float_sum;
```

所以金额一定要用 `numeric`，不要用 `real` 或 `double precision`。（`0.1::float8` 里的 `::` 把左边的值转换成右边的类型，`float8` 就是 `double precision`。类型转换在本章最后一篇细讲。）

**两种四舍五入。** `numeric` 的 `round` 在正好一半时远离零取整：`round(2.5)` 是 3，`round(-2.5)` 是 -3。浮点数的 `round` 则取最近的偶数：`round(2.5::float8)` 是 2。又一个金额不要用浮点数的理由。

**除以零和溢出。** `1 / 0` 会报 `division by zero`；`integer` 最大约 21 亿，超出会报 `integer out of range`，需要更大的数时用 `bigint`。如果除数可能是 0，可以用 `NULLIF(stock, 0)` 把 0 变成 NULL，结果就是 NULL 而不是报错（本章讲 CASE 的那一篇会再介绍它）。

**NULL 参与运算。** NULL 加、减、乘、除任何数，结果都是 NULL。

**和数学课不一样的两处优先级。** 第一，取相反数比乘方先算，所以 `-2 ^ 2` 是 (-2)² = 4，而数学里 −2² 是 −4。第二，`^` 从左往右算，`2 ^ 3 ^ 2` 是 (2³)² = 64，而数学里是 2⁹ = 512：

```sql run
SELECT -2 ^ 2 AS a, 2 ^ 3 ^ 2 AS b, -(2 ^ 2) AS c, 2 ^ (3 ^ 2) AS d;
```

遇到乘方，加括号写明意图最稳妥。另外，`^` 在 MySQL 里是按位异或，不是乘方；需要可移植的写法时用 `power`。

**`numeric` 除法的小数位数。** `7.0 / 2` 的结果是 3.5000000000000000：`numeric` 相除时，PostgreSQL 会保留足够多的小数位，保证精度。需要固定位数时，在最后用 `round`。

## 常见错误 {#mistakes}

**1. 没注意到整数除法。** 想把库存平均分成 3 份：

```sql run
SELECT name, stock, round(stock / 3, 2) AS a, round(stock / 3.0, 2) AS b
FROM products;
```

`a` 列里 25 / 3 得到 8.00，因为整数除法在 `round` 之前就把小数截掉了。把其中一边写成 3.0，或者转换成 `numeric`，才能得到 8.33。计算器和大多数编程语言里 7 / 2 是 3.5，这个习惯在 SQL 里会出错。

**2. 运算顺序写错。** `price - 5 * stock` 是先算 `5 * stock`。想先做减法，要写 `(price - 5) * stock`。

**3. 用浮点数存金额。** 见“深入”：浮点数会产生 0.30000000000000004 这样的误差，累计起来就对不上账。

**4. 把浮点数交给两个参数的 `round`。** `sqrt`、`^` 和 `power` 对整数参数返回浮点数，而 `round(x, n)` 只接受 `numeric`：

```sql run error
SELECT round(sqrt(2), 2);
```

报错是 `function round(double precision, integer) does not exist`。先把值转换成 `numeric`：`round(sqrt(2)::numeric, 2)`。`::` 的用法在本章最后一篇讲。

**5. 过早取整。** 先把每一行四舍五入再相加，和先相加再四舍五入，结果可能差几分钱。一般在最后一步再 `round`。

## 小结 {#summary}

- `+ - * / %` 用法和数学一样，先乘除后加减；`%` 求余数。
- 整数除以整数还是整数，小数部分直接截掉；要小数结果，让一边带小数。
- 金额用 `numeric`，它精确；浮点数是近似值。
- `round(x, n)` 四舍五入到 n 位小数；`ceil`、`floor`、`trunc`、`abs` 处理其他取整需求。
- 除以零会报错，NULL 参与运算结果为 NULL。
