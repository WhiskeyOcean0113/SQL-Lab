# SQL Lab

**English** · [中文](README.zh-CN.md)

A bilingual SQL course that runs entirely in the browser. Each lesson explains one idea with examples you can edit and run, then asks you to prove it with exercises that are graded automatically. A real PostgreSQL database runs on the page through [PGlite](https://pglite.dev), so there is no server to set up and nothing leaves your machine.

## What it does

- **One suggested path, nothing locked.** The lessons follow a recommended order and the map points to your next one, but you can open any lesson at any time. A lesson is finished when every one of its exercises has been answered correctly.
- **Lesson first, then practice.** Every lesson follows the same template: why you need it, the core idea, the syntax, a worked example, variations, going deeper, common mistakes, and a summary.
- **Syntax you can read.** From the third lesson on, each lesson shows its statement's shape in the PostgreSQL manual's notation, explains every placeholder, and reads real queries against it.
- **Runnable examples.** Every SQL block in a lesson can be edited and run against the practice database. Examples that are meant to fail show the real PostgreSQL error.
- **Four kinds of exercise**, from easy to hard: predict the output, find the bug, arrange the pieces, and write the query.
- **Grading by result, not by text.** Your query's result is compared with the reference answer's. When they differ, you see which rows are missing or extra, whether the column count or order is wrong, and whether a join multiplied the rows. Data changes are graded by the tables they leave behind, and table designs by behaviour: which inserts your constraints accept and which they refuse.
- **Mistake bank.** An exercise you get wrong is collected automatically, and counts as mastered after two correct answers in a row (by default).
- **Truly bilingual.** The Chinese and English versions are written separately rather than translated. Key terms carry their other-language form, such as 内连接 (inner join), so you learn both vocabularies.
- **Light and dark themes**, and a layout that works on a phone.

The mistakes each lesson covers are drawn from research on novice SQL errors (Taipalus & Perälä 2019; Miedema et al. 2021), and every result a lesson cites has been run on PostgreSQL 18.

## Course

43 lessons and 323 exercises in ten chapters, all on `shop`, a small online-store dataset designed to surface the classic traps (customers without orders, a product without a category, NULL cities, a self-referencing column).

| Chapter | Topic | Lessons |
|---|---|---|
| 0 | The relational model | Tables, rows and columns · keys · how a SQL statement is written · the logical processing order |
| 1 | Querying one table | SELECT · WHERE · AND, OR, NOT · IN, BETWEEN, LIKE · NULL · ORDER BY and LIMIT · DISTINCT |
| 2 | Expressions and functions | Arithmetic · strings · dates and times · CASE · type casts |
| 3 | Aggregation | Aggregate functions · GROUP BY · HAVING vs WHERE · aggregates and NULL |
| 4 | Joining tables | INNER JOIN · outer joins · self joins · CROSS JOIN · joins with aggregation |
| 5 | Subqueries and set operations | Scalar subqueries and derived tables · IN and EXISTS · correlated subqueries · UNION, INTERSECT, EXCEPT |
| 6 | Advanced queries | WITH and CTEs · recursive CTEs · window functions: ranking · offsets and running totals |
| 7 | Changing data | INSERT · UPDATE and DELETE · upserts with ON CONFLICT · transactions and ACID |
| 8 | Database design | Data types · constraints · normalization up to 3NF · views |
| 9 | Performance basics | Indexes · reading query plans with EXPLAIN |

## Getting started

You need Node.js 22 or later.

```bash
npm install
npm run dev
```

Then open http://localhost:5173. Your progress is stored in your browser's IndexedDB.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server on port 5173, reloading when content changes |
| `npm run dev:fixture` | The same interface against a tiny two-lesson test course |
| `npm test` | Tests for the SQL engine, grader, content pipeline and progress store |
| `npm run validate` | Checks every content rule: both languages match, every example runs, every reference answer and answer key agrees with the data |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Validate, then build the static site into `dist/` |

A pre-commit hook, enabled by `npm install`, runs the type check, validation and tests before every commit.

## How it works

- **Content and progress are separate.** Lessons, exercises, the glossary and datasets are plain files under `content/`, kept in git. Progress is the learner's own PostgreSQL database in IndexedDB.
- **Every run starts from the same data.** Each query runs inside a transaction that is rolled back, and in a Web Worker that is restarted if a query runs longer than 8 seconds. Your own `BEGIN`, `COMMIT`, `ROLLBACK` and savepoints work as in PostgreSQL within a run, because they become savepoints inside that transaction.
- **The attempt log is the source of truth.** Every submission is recorded with its SQL, result and error. The mistake bank is a view over that log, and everything can be exported as JSON.

```
content/      curriculum, glossary, datasets, lessons and exercises (Markdown + YAML)
scripts/      content build and validation
src/engine/   PGlite practice database, SQL scanner, result grader
src/state/    progress schema and store
src/i18n/     interface strings in both languages, Chinese–Latin spacing
src/ui/       views (vanilla TypeScript, no framework)
tests/        Vitest suites and a small fixture course
design/       the approved visual mockup
```

The full contract for writing lessons (content schema, the teaching template, bilingual rules, design rules) is in [CLAUDE.md](CLAUDE.md).

## Deploying

The build is a static site. On Cloudflare Pages, connect this repository and use:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |

Node 22 is pinned in `.nvmrc`. Navigation uses URL hashes, so no redirect rules are needed. Every visitor's progress stays in their own browser.

## Built with

[PGlite](https://pglite.dev) (Apache-2.0), [CodeMirror 6](https://codemirror.net) (MIT), [markdown-it](https://github.com/markdown-it/markdown-it) (MIT), [Vite](https://vite.dev) (MIT), and the [Noto Sans SC](https://fonts.google.com/noto/specimen/Noto+Sans+SC) typeface (SIL Open Font License 1.1), bundled through Fontsource.
