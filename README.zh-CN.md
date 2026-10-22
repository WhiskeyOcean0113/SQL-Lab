# SQL Lab

[English](README.md) · **中文**

一门完全在浏览器里运行的中英双语 SQL 课程。每篇讲解只讲一个概念，配上可以直接修改、运行的示例，然后用自动判题的练习检验你是否真的掌握了。页面里通过 [PGlite](https://pglite.dev) 运行着一个真正的 PostgreSQL 数据库，不需要搭建服务器，数据也不会离开你的电脑。

## 功能

- **推荐的顺序，不设门槛。** 讲解有一条推荐的学习顺序，课程地图会指出下一篇，但任何一篇随时都能打开。一篇的所有练习都做对，才算学完。
- **先讲解，后练习。** 每篇讲解都用同一个结构：为什么需要它、核心概念、语法、示例、变体、深入、常见错误、小结。
- **看得懂的语法。** 从第 3 篇开始，每篇都用 PostgreSQL 手册的记法写出语句的格式，逐个解释其中的占位符，再拿真实的查询对照着读。
- **示例可以运行。** 讲解里的每段 SQL 都能直接修改，并在练习数据库上运行。故意写错的示例会显示 PostgreSQL 真实的报错。
- **四种题型**，由易到难：预测输出、找错、拼排、写查询。
- **按结果判题，不比对文字。** 系统比较你的查询结果和参考答案的结果。不一致时会告诉你缺了哪些行、多了哪些行、列数或列的顺序是否不对，以及是不是 join 让行数暴增了。修改数据的题按修改后表里的数据判；设计表的题按行为判：你的约束接受了哪些插入、拒绝了哪些。
- **错题本。** 做错的题会自动收进来，之后连续做对两次（默认值）才算掌握。
- **真正的双语。** 中文版和英文版分别撰写，而不是互相翻译。关键术语会附上另一种语言，比如“内连接 (inner join)”，两套术语一起学会。
- **浅色和深色主题**，手机上也能正常使用。

每篇“常见错误”都依据关于 SQL 初学者错误的研究来写（Taipalus & Perälä 2019；Miedema et al. 2021），讲解里引用的每个结果都在 PostgreSQL 18 上实际运行过。

## 课程

共 10 章、43 篇讲解、323 道练习，全部基于 `shop` 数据集。这是一家小网店的数据，专门设计来暴露经典的陷阱：没下过单的顾客、没有分类的商品、城市为 NULL 的顾客、引用自身的列。

| 章节 | 主题 | 讲解 |
|---|---|---|
| 0 | 关系模型 | 表、行与列 · SQL 语句的写法 · 查询的逻辑执行顺序 · 主键与外键 |
| 1 | 单表查询 | SELECT · WHERE · AND、OR、NOT · IN、BETWEEN、LIKE · NULL · ORDER BY 与 LIMIT · DISTINCT |
| 2 | 表达式与函数 | 算术 · 字符串 · 日期与时间 · CASE · 类型转换 |
| 3 | 聚合 | 聚合函数 · GROUP BY · HAVING 与 WHERE · 聚合与 NULL |
| 4 | 多表连接 | INNER JOIN · 外连接 · 自连接 · CROSS JOIN · 连接与聚合 |
| 5 | 子查询与集合运算 | 标量子查询与派生表 · IN 与 EXISTS · 关联子查询 · UNION、INTERSECT、EXCEPT |
| 6 | 进阶查询 | WITH 与 CTE · 递归 CTE · 窗口函数：排名 · 偏移与累计 |
| 7 | 修改数据 | INSERT · UPDATE 与 DELETE · ON CONFLICT 插入或更新 · 事务与 ACID |
| 8 | 数据库设计 | 数据类型 · 约束 · 范式化（到 3NF） · 视图 |
| 9 | 性能入门 | 索引 · 用 EXPLAIN 读执行计划 |

## 快速开始

需要 Node.js 22 或更新的版本。

```bash
npm install
npm run dev
```

然后打开 http://localhost:5173。学习进度保存在浏览器的 IndexedDB 里。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器，端口 5173，内容改动后自动刷新 |
| `npm run dev:fixture` | 同样的界面，加载一门只有两篇讲解的测试课程 |
| `npm test` | 测试 SQL 引擎、判题器、内容管线和进度存储 |
| `npm run validate` | 检查所有内容规则：两种语言结构一致、每个示例都能运行、每份参考答案和答案选项都与数据相符 |
| `npm run audit` | 检查内容好不好学：练习是否照抄课文示例、提示是否泄露答案、教过的 SQL 是否从没练过。`--strict` 只在使用模板 2 的课出现 error 时失败 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run build` | 先校验，再把静态站点构建到 `dist/` |

`npm install` 会启用一个 pre-commit 钩子，每次提交前都会运行类型检查、内容校验和测试。

## 工作原理

- **内容和进度分开存放。** 讲解、练习、术语表和数据集都是 `content/` 下的普通文件，用 git 管理。进度是学习者自己的 PostgreSQL 数据库，存在 IndexedDB 里。
- **每次运行都从同一份数据开始。** 每条查询都在一个最后会回滚的事务里执行，并运行在 Web Worker 中；查询超过 8 秒，Worker 会被重启。你自己写的 `BEGIN`、`COMMIT`、`ROLLBACK` 和保存点在一次运行里和 PostgreSQL 的行为一样，因为它们会变成这个事务里的保存点。
- **提交记录是唯一的事实来源。** 每次提交都会记下 SQL、结果和报错。错题本是这份记录上的一个视图，所有数据都可以导出为 JSON。

```
content/      课程大纲、术语表、数据集、讲解和练习（Markdown + YAML）
scripts/      内容构建和校验
src/engine/   PGlite 练习数据库、SQL 扫描器、结果判题器
src/state/    进度的表结构和存储
src/i18n/     两种语言的界面文字，以及中英文之间的自动空格
src/ui/       各个页面（原生 TypeScript，不用框架）
tests/        Vitest 测试和一门小型测试课程
design/       确认过的视觉稿
```

撰写讲解的完整约定（内容格式、讲解模板、双语规则、设计规则）见 [CLAUDE.md](CLAUDE.md)。

## 部署

构建产物是一个静态站点。在 Cloudflare Pages 上连接这个仓库，并填写：

| 设置 | 值 |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |

`.nvmrc` 里已经固定为 Node 22。页面跳转用的是 URL 的 hash，所以不需要配置重定向规则。每位访问者的进度只保存在自己的浏览器里。

## 用到的开源项目

[PGlite](https://pglite.dev)（Apache-2.0）、[CodeMirror 6](https://codemirror.net)（MIT）、[markdown-it](https://github.com/markdown-it/markdown-it)（MIT）、[Vite](https://vite.dev)（MIT），以及通过 Fontsource 打包的 [思源黑体 Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) 字体（SIL Open Font License 1.1）。
