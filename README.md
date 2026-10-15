# SQL Lab

**English** · [中文](README.zh-CN.md)

A bilingual SQL course that runs entirely in the browser. Each lesson explains one idea with examples you can edit and run, then asks you to prove it with exercises that are graded automatically. A real PostgreSQL database runs on the page through [PGlite](https://pglite.dev), so there is no server to set up and nothing leaves your machine.

## What it does

- **One path, in order.** Lessons unlock one at a time. A lesson is finished when every one of its exercises has been answered correctly.
- **Lesson first, then practice.** Every lesson follows the same template: why you need it, the core idea, a worked example, variations, going deeper, common mistakes, and a summary.
- **Runnable examples.** Every SQL block in a lesson can be edited and run against the practice database. Examples that are meant to fail show the real PostgreSQL error.
- **Four kinds of exercise**, from easy to hard: predict the output, find the bug, arrange the pieces, and write the query.
- **Grading by result, not by text.** Your query's result is compared with the reference answer's. When they differ, you see which rows are missing or extra, whether the column count or order is wrong, and whether a join multiplied the rows.
- **Mistake bank.** An exercise you get wrong is collected automatically, and counts as mastered after two correct answers in a row (by default).
- **Truly bilingual.** The Chinese and English versions are written separately rather than translated. Key terms carry their other-language form, such as 内连接 (inner join), so you learn both vocabularies.
- **Light and dark themes**, and a layout that works on a phone.

The mistakes each lesson covers are drawn from research on novice SQL errors (Taipalus & Perälä 2019; Miedema et al. 2021), and every result a lesson cites has been run on PostgreSQL 18.

## Course

| Chapter | Topic | Status |
|---|---|---|
| 0 | The relational model | 3 lessons |
| 1 | Querying one table | 7 lessons |
| 2 | Expressions and functions | 5 lessons |
| 3 | Aggregation | 4 lessons |
| 4 | Joining tables | 5 lessons |
| 5 | Subqueries and set operations | 4 lessons |
| 6 | Advanced queries (CTEs, window functions) | planned |
| 7 | Changing data and transactions | planned |
| 8 | Database design | planned |
| 9 | Performance basics | planned |

So far: 28 lessons and 164 exercises, all on `shop`, a small online-store dataset designed to surface the classic traps (customers without orders, a product without a category, NULL cities, a self-referencing column).

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
| `npm run review` | Port 5177 with every lesson unlocked and a separate progress database, for checking content |
| `npm run dev:fixture` | The same interface against a tiny two-lesson test course |
| `npm test` | Tests for the SQL engine, grader, content pipeline and progress store |
| `npm run validate` | Checks every content rule: both languages match, every example runs, every reference answer and answer key agrees with the data |
| `npm run typecheck` | TypeScript type check |
| `npm run build` | Validate, then build the static site into `dist/` |

A pre-commit hook, enabled by `npm install`, runs the type check, validation and tests before every commit.

## How it works

- **Content and progress are separate.** Lessons, exercises, the glossary and datasets are plain files under `content/`, kept in git. Progress is the learner's own PostgreSQL database in IndexedDB.
- **Every run starts from the same data.** Each query runs inside a transaction that is rolled back, and in a Web Worker that is restarted if a query runs longer than 8 seconds.
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
