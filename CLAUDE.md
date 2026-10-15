# SQL Lab

A personal, local SQL course: bilingual lessons, runnable examples, auto-graded
exercises and a mistake bank. A static site with no backend. PostgreSQL runs
in the browser through PGlite. Agents build the site and write the content;
they are not part of the running product.

Read this file before changing anything. It is the contract that keeps code
and content written in different sessions consistent.

## Commands

```bash
npm run dev        # site at http://localhost:5173, reloads on content/ changes
npm run dev:fixture  # same UI against tests/fixtures/content (a tiny two-lesson course)
npm run review     # port 5177: every lesson unlocked, separate progress database, for checking content
npm test           # engine, grader, content pipeline, progress store
npm run validate   # every content rule below; --verbose lists warnings
npm run typecheck
npm run build      # validate, then build to dist/
```

The pre-commit hook (`.githooks/pre-commit`, enabled by `npm install`) runs
typecheck, validate and tests. Never commit with failures and never bypass it.

## Principles

1. **Strict linear path.** One order, defined only in `content/curriculum.yaml`.
   A lesson unlocks when the previous one is done. No skipping, no "test out".
2. **Lesson first, then exercises.** A lesson is done when every one of its
   exercises has been answered correctly at least once.
3. **Content and state are separate.** Content is files in git, written at
   development time. State is the learner's Postgres database in IndexedDB.
4. **Bilingual, never monolingual.** Both versions mix languages; only the
   primary language differs (see Bilingual rules).
5. **Single source of truth.** Course order, term translations, SQL code and
   the attempt log are each defined in exactly one place. Derive, don't copy.
6. **Grade results, not text.** Compare what queries return, never the SQL.

## Layout

```
content/
  curriculum.yaml          modules → lesson ids, the only place order lives
  glossary.yaml            term id → { en, zh }
  datasets/<name>.sql      practice database: schema + seed rows
  lessons/<lesson-id>/     folder name = lesson id, never numbered
    meta.yaml
    lesson.zh.md
    lesson.en.md
    exercises/<NN-slug>.yaml   NN sets the order within the lesson
scripts/
  validate.ts              all content rules; also used by tests
  lib/build-content.ts     content/ → Course object (src/content/types.ts)
  lib/markdown.ts          lesson Markdown extensions
  lib/vite-content.ts      serves the Course as `virtual:content`
src/
  engine/                  PGlite practice DB, SQL scanner, grader (DOM-free)
  content/                 Course types, SQL highlighter
  state/                   progress schema and store, unlock rules
  i18n/                    UI strings per language
  ui/                      views
tests/                     vitest; fixtures/content is a tiny valid course
```

## Content schema

### curriculum.yaml

```yaml
modules:
  - id: m4
    title: { zh: 多表连接, en: Joining tables }
    summary: { zh: …, en: … }
    lessons: [inner-join, outer-joins]    # written lessons, in order
    planned:                              # announced, not written yet
      - { zh: 自连接, en: Self joins }
```

Move an entry from `planned` to `lessons` only when its folder exists and
validate passes.

### meta.yaml

```yaml
title:   { zh: "{{term:primary-key}}与{{term:foreign-key}}", en: "{{Term:primary-key|Primary keys}} and {{term:foreign-key|foreign keys}}" }
summary: { zh: 一句话说明学完能做什么。, en: One sentence on what you can do afterwards. }
dataset: shop
prereqs: [select-basics, where-filter]    # must come earlier in curriculum
```

### Lesson body: the teaching template

Every `##` heading ends with a fixed id. Sections appear in this order;
`variants` and `deeper` are optional, the rest are required. Both languages
have exactly the same sections. `syntax` is being added lesson by lesson
(`sql-syntax` and `select-basics` are the models); validate warns where it is
missing, and it becomes required once every lesson has it. Lessons before
`sql-syntax`, which teaches the notation, have no `syntax` section.

| id         | zh heading    | en heading       | What goes in it |
|------------|---------------|------------------|-----------------|
| `why`      | 为什么需要它  | Why you need it  | A concrete question from the dataset that you cannot answer yet. |
| `core`     | 核心概念      | Core idea        | The concept and the mental model, tied to the logical processing order where relevant. |
| `syntax`   | 语法          | Syntax           | A ` ```syntax ` block with the lesson's statement shape, then a table: every placeholder, what may go there, whether it can be left out. Then read two or three real queries against the shape. |
| `example`  | 示例          | Example          | A worked example with labelled steps (subgoals): what each clause contributes. Runnable. |
| `variants` | 变体          | Variations       | Related forms and options, each with a runnable example. |
| `deeper`   | 深入          | Going deeper     | Edge cases, NULL behaviour, standard vs. Postgres specifics. |
| `mistakes` | 常见错误      | Common mistakes  | Real novice errors, each with the wrong query, what happens, and the fix. |
| `summary`  | 小结          | Summary          | 3–5 bullets. No new information. |

Markdown extensions:

- `## 核心概念 {#core}`: section id, required on every `##`. No `#` h1.
- `{{term:inner-join}}`: a glossary term. `{{Term:…}}` capitalises the first
  letter. `{{term:row|rows}}` overrides the primary-language text (plurals).
- ` ```sql run `: an editable, runnable example. The zh and en files must
  contain identical `sql run` blocks in the same order, and each must run.
- ` ```sql run error `: a runnable example that is meant to fail, so the learner
  can read the real error. validate checks that it does fail.
- ` ```sql `: a static snippet, e.g. a deliberately wrong query.
- ` ```syntax `: a syntax template in the PostgreSQL manual's notation:
  UPPERCASE keywords, lower-case placeholders (`expression`, `table_name`,
  `output_name`: the manual's own names), `[ ]` optional, `{ a | b }` pick
  one, `[, …]` repeat. Like `sql run` blocks, identical in zh and en.
  Show only the forms the lesson teaches, but never a shape that is wrong;
  the shape grows lesson by lesson towards the full `SELECT`.
- `###` subheadings may divide a long section; they carry no id.

### Exercises

One YAML file per exercise. Kinds, in the order a lesson should use them
(worked example → predict → debug → parsons → write, easy to hard):

```yaml
kind: write            # write | debug | parsons | predict
difficulty: 2          # 1 easy, 2 medium, 3 hard
lesson_ref: core       # the section to revisit when this goes wrong
prompt: { zh: …, en: … }    # Markdown, terms allowed
hint:   { zh: …, en: … }
solution: |            # one shared reference solution
  SELECT …
starter: …             # optional; required for debug (the broken query)
check:                 # all optional
  order_matters: false # true only when the prompt asks for an order
  column_names: false  # true only when the prompt names the output columns
  mode: result         # result | tables (for INSERT / UPDATE / DELETE)
  tables: []           # mode tables: which tables to compare afterwards
```

- `parsons`: the solution's lines become pieces; add `distractors: [ … ]`.
  Graded by running the assembled query, so any valid order passes.
- `predict`: no `solution`; instead `query`, `choices` (list of strings or
  `{ zh, en }`), `answer` (0-based index) and `explain`. When the question is
  about how many rows come back, add `verify: { rows: N }` so validate checks
  the answer key against the data.
- Prompts must state everything the grader checks: the columns, their order,
  whether rows must be sorted. If the prompt does not say it, do not check it.
- At least four exercises per lesson, covering at least three kinds.

### YAML pitfalls

Quote values YAML would otherwise convert: `"NULL"`, `"null"`, `"yes"`,
`"no"`, `"on"`, `"off"`, and anything starting with `*`, `&`, `!`, `{`, `[`,
`` ` `` or `:`. Use `|` blocks for SQL.

## Bilingual rules

- **zh version**: Chinese prose. Key terms come from the glossary and render
  as `内连接 (inner join)`.
- **en version**: English prose. Terms render as `inner join (内连接)`.
- The other-language form shows on the first use in each section; later uses
  show only the primary form, with the other on hover.
- Never type a translation inline; add the term to `glossary.yaml` and use
  `{{term:id}}`. If a term appears in the curriculum, it belongs in the glossary.
- Titles (lesson, module, planned) never carry a full translation. Mark only
  the words a reader could misread with `{{term:…}}` (表, 行, 列, 别名, …);
  every term in a title shows its other-language form. Quote such YAML values.
- Spacing between Chinese and Latin text, digits and brackets is added at
  render time (`src/i18n/autospace.ts`, applied in `mount()`); do not hand-type
  it, and do not remove it where it is already typed. Chinese prose uses
  Chinese quotation marks “…”, never straight quotes.
- SQL code, keywords (`SELECT`, `JOIN`), table and column names are code. They
  are the same in both languages and are never translated.
- The two versions are equivalent, not literal translations. Each should read
  as if written natively in its primary language.
- UI strings live in `src/i18n/`. Terms there follow the same rule.

## Writing lessons: research first

Every lesson is researched before it is written. Check, at minimum:

- The PostgreSQL manual for the feature (behaviour, NULL handling, edge cases).
- Whether the behaviour differs from standard SQL or from SQLite / MySQL; if it
  does and a learner will meet it elsewhere, say so in `deeper`.
- Known novice errors for the topic. Ground `mistakes` in the research:
  Taipalus & Perälä 2019 (persistent errors: missing expressions, wrong
  grouping columns, wrong comparison operators, missing joins, missing ORDER BY
  columns); Miedema et al. 2021 (misconceptions from prior knowledge,
  over-generalisation, natural language, and incomplete mental models).
- Every query in a lesson must use the lesson's dataset and actually run.

Style: short paragraphs, one idea each. Explain why before how. Prefer one
precise sentence to three loose ones. No filler, no exclamation marks.

## Datasets

`content/datasets/shop.sql` is the main dataset (M0–M5). Its header lists the
traps it is built to surface (customers without orders, a product without a
category, NULL cities, a self-referencing column). Keep it small enough to
trace by hand. Change it only with care: every lesson's examples and
exercises depend on it, and validate will catch breakage.

## Engine

- `PracticeDb` runs learner SQL in `BEGIN … ROLLBACK`, so every run starts from
  the same data. Learners cannot use transaction control (`BEGIN`, `COMMIT`,
  `SAVEPOINT`, …); the M7 transactions lesson will need a dedicated sandbox mode.
- Dates and timestamps come back as Postgres text; the session is UTC.
- The grader picks the last statement that returned columns. It reports
  structured issues (`column-count`, `column-order`, `duplicates`,
  `row-explosion`, `order`, …) plus the indexes of missing and extra rows. The
  UI turns codes into localized messages; never put prose in the engine.

## State

Schema in `src/state/schema.ts`. `attempts` records every submission verbatim
(SQL, correctness, error, issues, language) and is the source of truth.
`mistake_bank` is a VIEW: an exercise enters it on its first wrong answer and
is mastered after `mastery_streak` (setting, default 2) correct answers in a
row since its latest wrong one. `Progress.exportAll()` dumps everything as JSON
for a future "analyse my mistakes" workflow, which is not designed yet.

## UI

Vanilla TypeScript, no framework. `src/main.ts` boots the progress store, the
SQL worker and the hash router (`src/ui/app.ts`); each page is one module in
`src/ui/views/` that renders into `#main`.

- Routes: `#/` map, `#/lesson/<id>[/<section>]`, `#/practice/<id>/<n>`,
  `#/mistakes`, `#/glossary`. Locked lessons and their exercises refuse to open.
- Templating: `html\`…\`` from `src/ui/dom.ts` escapes every value; only
  build-time lesson HTML and `t()` output go through `raw()`.
- Every visible string comes from `src/i18n/strings.ts` through `t()`, which
  also expands `{{term:id}}`. Add both languages in the same change.
- Learner SQL runs in a Web Worker (`src/engine/worker.ts`); `Engine` kills and
  restarts it after 8 s, so a runaway query never freezes the page.
- Editor drafts are kept in localStorage per exercise (a convenience only);
  everything that matters is in the progress database.

### Visual design

The approved direction is `design/mockup.html`; `src/styles/app.css` is its
implementation. Simple and modern: cool neutral greys, one muted steel-blue
accent, green for correct, red for wrong. Correct and wrong must stay easy to
tell apart: they differ in hue and lightness, their tints are ΔE ≈ 22 apart,
and wrong states also carry a non-colour cue (strikethrough, stripes, a hollow
ring). Text on a tint uses the matching `--ok-ink` / `--bad-ink`. Latin text in Arial, Chinese
in Noto Sans SC (思源黑体), bundled from `@fontsource/noto-sans-sc` (weight 400,
split by unicode-range so a page loads only the glyphs it uses). Text stays
at regular weight; build hierarchy from size, colour and space. Colours
are CSS variables with a dark-mode set; never hard-code a colour in a view.
The theme follows the system until the learner uses the top-bar switch
(`src/ui/theme.ts`); the choice is kept in localStorage and applied by an
inline script in `index.html` before first paint.
The verdict's diff table is the signature element: missing rows in the accent
tint, extra rows struck through in red.

Two secondary hues add a little colour to content and never mean right or
wrong: violet marks glossary terms (dotted rule, other-language form) and the
"predict" exercise kind; amber marks emphasis (a thick underline stroke, since
there is no bold) and the "debug" kind. Every text colour, secondary and tertiary included, is at least 4.5:1
against page, sheet and well in both themes; empty progress tracks use
`--track` (≥ 2:1). A term's other-language form is the same size as the
text around it and differs only in colour. Type sizes come only from the `--fs-*`
scale in `app.css` (13 / 14 / 15 / 17 / 18 / 20 / 26 / 32 / 44 px); nothing
below 13px except `kbd`. Exercise progress is always drawn the same way:
one segment per exercise, solved green, attempted striped red (`.segs`,
`.steps`). Where the mockup and `app.css` differ, `app.css` is current.
