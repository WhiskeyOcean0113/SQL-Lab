## 为什么需要它 {#why}
不是每一{{term:row}}都需要。

## 核心概念 {#core}
`WHERE` 只保留条件为 true 的{{term:row}}。

```steps
- sql: |
    SELECT name, age FROM pets ORDER BY age;
  say: 先看全部三{{term:row}}，按 age 排好，age 相同的行是一组。
  group: age
- sql: |
    SELECT name, age FROM pets WHERE age > 2 ORDER BY age;
  say: WHERE 只留下 `age > 2` 为 true 的行，age 是 NULL 的 Bean 不见了。
```

```check
query: |
  SELECT name FROM pets WHERE age > 2;
question: 这条查询返回几{{term:row}}？
choices: ['1', '2', '3']
answer: 1
explain: Bean 的 age 是 NULL，`NULL > 2` 的结果不是 true，所以只剩 Mochi 和 Tofu。
verify: { rows: 2 }
```

## 示例 {#example}
```sql run
SELECT name, age FROM pets WHERE age > 2;
```

## 常见错误 {#mistakes}
- 用 `= NULL` 判断空值。

## 小结 {#summary}
- `WHERE` 过滤行。

## 参考 {#reference}
- SQL 标准里，条件的结果有 true、false 和 unknown 三种，`WHERE` 只留下 true。
