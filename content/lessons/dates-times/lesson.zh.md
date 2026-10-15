## 为什么需要它 {#why}

“每笔订单从下单到发货用了多久？”“哪些顾客注册已经超过一年？”“3 月份有哪些订单？”这些问题都要拿日期和时间做计算。

时间数据看起来像文字，但它有自己的类型和运算规则。用对了很简洁，用错了会在月末、跨年、时区这些地方悄悄出错。

## 核心概念 {#core}

**三种常用的时间类型。**

| 类型 | 含义 | shop 里的例子 |
|---|---|---|
| `date` | 日期，没有时刻 | `customers.joined_on` |
| `timestamp` | 日期 + 时刻 | `orders.ordered_at` |
| `interval` | 一段时长，叫{{term:interval}} | 两个时间戳相减的结果 |

写时间字面量时，可以在前面加上类型名，让意图更清楚：`DATE '2024-07-01'`、`TIMESTAMP '2024-03-01 10:00'`、`INTERVAL '2 days'`。

**时间的加减。**

- `timestamp - timestamp` 得到一个 `interval`，比如 `1 day 04:48:00`。
- `date - date` 得到一个整数，表示相差的天数。
- `date + 整数` 是往后数几天；`+ INTERVAL '1 month'` 是往后一个月。

```sql run
SELECT id, ordered_at, shipped_at, shipped_at - ordered_at AS shipping_time
FROM orders
WHERE shipped_at IS NOT NULL;
```

shop 的数据停在 2024 年 6 月底。为了让结果固定不变，这门课把“今天”当作 `DATE '2024-07-01'`。真实查询里，`current_date` 是今天的日期，`now()` 是现在的{{term:timestamp}}。

## 示例 {#example}

问题：每位顾客到 2024 年 7 月 1 日为止，注册了多少天？

1. **确定两端的时间。** 终点是 `DATE '2024-07-01'`，起点是 `joined_on`。
2. **确认类型。** 两边都是 `date`。
3. **相减。** `date - date` 直接得到整数天数。
4. **起名。** `AS days_as_member`。

```sql run
SELECT name, joined_on, DATE '2024-07-01' - joined_on AS days_as_member
FROM customers;
```

Lin Wei 是 534 天，最新注册的 Mei Tanaka 是 125 天。如果要以“年、月、日”表示，可以用 `age(DATE '2024-07-01', joined_on)`，它会返回 `1 year 5 mons 18 days` 这样的结果。

## 变体 {#variants}

**取出某个部分：`extract`。** 年、月、日、星期几（0 是星期日）、小时：

```sql run
SELECT id, ordered_at,
       extract(year from ordered_at) AS year,
       extract(month from ordered_at) AS month,
       extract(dow from ordered_at) AS weekday,
       extract(hour from ordered_at) AS hour
FROM orders;
```

**截到某个精度：`date_trunc`。** 把时间戳截到月初，同一个月的订单就有了相同的值，第 3 章按月汇总时会用到：

```sql run
SELECT id, ordered_at, date_trunc('month', ordered_at) AS month
FROM orders;
```

**只要日期：`::date`。** `ordered_at::date` 去掉时刻，只留下日期。

**按时间筛选。** 比较时间戳和比较数字一样。注册超过一年的顾客：

```sql run
SELECT name, joined_on
FROM customers
WHERE joined_on < DATE '2024-07-01' - INTERVAL '1 year';
```

**格式化输出：`to_char`。**

```sql run
SELECT id, to_char(ordered_at, 'YYYY-MM-DD HH24:MI') AS short_time,
       to_char(ordered_at, 'Mon DD, YYYY') AS long_date
FROM orders;
```

## 深入 {#deeper}

**加一个月不总是加 30 天。** 月份长短不一，PostgreSQL 会把结果调整到目标月份的最后一天：

```sql run
SELECT DATE '2024-01-31' + INTERVAL '1 month' AS jan31_plus_month,
       DATE '2024-03-31' - INTERVAL '1 month' AS mar31_minus_month,
       DATE '2024-02-28' + 1 AS feb28_plus_day;
```

1 月 31 日加一个月是 2 月 29 日（2024 是闰年）。顺带注意：`date + INTERVAL` 的结果是 `timestamp`，带着 00:00:00。

**不存在的日期会报错。** `'2024-02-30'::date` 会报 `date/time field value out of range`。日期一定要用 ISO 格式 `YYYY-MM-DD`，像 `03/05/2024` 这样的写法，不同地区会读成 3 月 5 日或 5 月 3 日。

**时区。** `timestamp` 不带时区信息，shop 约定所有时间都是 UTC。`timestamptz`（timestamp with time zone）会记住一个确定的时刻，显示时再按会话的{{term:time-zone}}换算。`now()` 返回的就是 `timestamptz`。存放“真实发生的时刻”时，实际项目通常用 `timestamptz`。

**用范围筛选，而不是 `extract`。** `WHERE extract(month from ordered_at) = 3` 能找到 3 月的订单，但它会把每一年的 3 月都算进来，而且数据库没法用索引加速（第 9 章）。更好的写法是第 1 章学过的左闭右开范围：`ordered_at >= '2024-03-01' AND ordered_at < '2024-04-01'`。

## 常见错误 {#mistakes}

**1. 减反了顺序。** `ordered_at - shipped_at` 会得到负数的时长：

```sql run
SELECT id, ordered_at - shipped_at AS wrong_way
FROM orders
WHERE id = 1;
```

`-1 days -04:48:00`。时长是“结束减开始”。

**2. 期待 `date - date` 得到 `interval`。** 两个日期相减得到的是整数天数；两个时间戳相减才得到 `interval`。拿整数去和 `INTERVAL '2 days'` 比较会报错。

**3. 用 `extract(month …)` 却忽略了年份。** 数据跨年以后，“3 月”会混进好几年的订单。要的是某一年的某个月，就用日期范围。

**4. 用非 ISO 格式写日期。** `'05/03/2024'` 含义不明确，`'2024-03-05'` 永远不会被误读。

**5. 用 `BETWEEN` 处理时间戳的终点。** 第 1 章讲过：`BETWEEN '2024-06-01' AND '2024-06-28'` 不包含 28 日零点以后的时刻。

## 小结 {#summary}

- `date` 是日期，`timestamp` 是日期加时刻，`interval` 是时长。
- `timestamp - timestamp` 得到 `interval`，`date - date` 得到整数天数；`+ INTERVAL` 往后推一段时间。
- `extract` 取出年月日等部分，`date_trunc` 截到某个精度，`to_char` 控制显示格式。
- 加减月份会自动调整到月末；日期用 ISO 格式书写。
- 按时间段筛选时，用左闭右开的范围。
