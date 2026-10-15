## 为什么需要它 {#why}
不是每一{{term:row}}都需要。

## 核心概念 {#core}
`WHERE` 只保留条件为 true 的{{term:row}}。

## 示例 {#example}
```sql run
SELECT name, age FROM pets WHERE age > 2;
```

## 常见错误 {#mistakes}
- 用 `= NULL` 判断空值。

## 小结 {#summary}
- `WHERE` 过滤行。
