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
npm test           # engine, grader, content pipeline, progress store
npm run validate   # every content rule below; --verbose lists warnings
npm run audit      # teaching-quality heuristics; --lesson <id>, --json, --strict
npm run typecheck
npm run build      # validate, then build to dist/
```

validate checks that content is correct; audit (`scripts/audit.ts`, rules in
`RULES`) estimates whether it teaches well: write solutions close to lesson
SQL, hints that give the solution away, introduced SQL no exercise practises,
objectives without a write exercise, `deeper` longer than `core`, other
databases named in the main text, too few `check` and `steps` blocks, and per
chapter, too few or too narrow challenges (rules 15, 16). A lesson
with `template: 2` gets each rule's own level, a legacy lesson only warnings
(a chapter: its own level once all its lessons are template 2);
`--strict` exits 1 on an error in a template-2 lesson or chapter, so it passes
until lessons opt in.

The pre-commit hook (`.githooks/pre-commit`, enabled by `npm install`) runs
typecheck, validate, tests and `audit --strict`. Never commit with failures and
never bypass it.

## Principles

1. **One recommended path, nothing locked.** One order, defined only in
   `content/curriculum.yaml`. Every lesson and exercise is open at any time; the
   map suggests the first unfinished lesson. Lessons still build on the ones
   before them, so write each as if the learner followed the path.
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
  chapters/<module-id>/    optional chapter sets for one curriculum module
    meta.yaml              optional: dataset, quiz_intro, challenge_intro
    quiz/<NN-slug>.yaml    the chapter quiz: pre- and post-test
    challenge/<NN-slug>.yaml   chapter challenges
scripts/
  validate.ts              all content rules; also used by tests
  lib/build-content.ts     content/ → Course object (src/content/types.ts)
  lib/markdown.ts          lesson Markdown extensions
  lib/vite-content.ts      serves the Course as `virtual:content`
src/
  engine/                  PGlite practice DB, SQL scanner, grader (DOM-free)
  content/                 Course types, SQL highlighter
  state/                   progress schema and store, lesson states
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
introduces: [IS, 'NULL', coalesce()]      # the SQL this lesson teaches (see below)
previews: [GROUP]                         # optional: shown early in the body, see below
```

`introduces` lists every piece of SQL the lesson teaches: keywords in upper
case (`ORDER`, `BY`), functions as `name()`, the operators `::` `||` `<>` `!=`
`>=` `<=` `%` `^`, and system catalogs (`information_schema`, `pg_indexes`).
Each is introduced by exactly one lesson. validate reads every code block and
exercise (query, solution, starter, pieces, probe, attempts) and fails when one
uses something that a later lesson introduces, or that no lesson introduces.
So a learner never meets SQL they have not been taught. A lesson body may show
a later word only if `previews` lists it and the prose says what it is (the
full `SELECT` skeleton in `query-evaluation-order`); exercises never preview.
When validate rejects a word, rewrite the code with what the learner already
knows, or teach the word where it is first used and introduce it there; do not
move the word to an earlier lesson that does not explain it.

### Lesson body: the teaching template

Every `##` heading ends with a fixed id. Sections appear in this order;
`variants`, `deeper` and `reference` are optional, the rest are required. Both
languages have exactly the same sections. `syntax` is required from `sql-syntax`, the
lesson that teaches the notation, onwards; the lessons before it have none.
`select-basics` is the model for a lesson's `syntax` section.

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
| `reference`| 参考          | Reference        | Dialect notes and rarely used forms. Rendered collapsed. |

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
  `output_name`: the manual's own names), function names in lower case
  with no space before the parenthesis (`round(number)`), `[ ]` optional,
  `{ a | b }` pick one, `[, …]` repeat. Like `sql run` blocks, identical in zh and en.
  Show only the forms the lesson teaches, but never a shape that is wrong;
  the shape grows lesson by lesson towards the full `SELECT`.
- ` ```check `: an inline checkpoint, YAML inside the fence: `query`, `question`,
  `choices` (a list of strings), `answer` (0-based), `explain`, optional
  `verify: { rows: N }`. The learner picks, presses Check, then sees right or
  wrong, `explain` and the result, and may run the query. Not recorded in
  progress. `query`, `answer`, the number of choices and `verify` are identical
  in zh and en; the text fields are in the file's language and may use terms.
  validate runs the query and checks `answer` and `verify`.
- ` ```steps `: a step-through of intermediate results, a YAML list of 2–8
  `{ sql, say, group? }`. The page shows one step at a time with its result;
  `group` names a result column whose values tint and number the rows.
  `sql` and `group` are identical in zh and en, in the same order; `say` is in
  the file's language. Every step must run.
- `check` and `steps` SQL is lesson code: the vocabulary check covers it, and
  `previews` apply. Quote YAML values that start with `{{term:…}}`.
- `###` subheadings may divide a long section; they carry no id.

#### Template 2 lessons

A lesson opts in with `template: 2` in `meta.yaml`. Its objectives and the
exercise rules are under Exercises. The body follows these rules too:

- `core` is the main part of the lesson and carries a trace table or a
  `steps` block. `deeper` is not longer than `core`.
- At most 8 new words in `introduces`, not counting those that `meta.yaml`
  lists under `reference` (taught for recognition only); split the lesson if
  it needs more.
- Other databases are named only in `deeper` or `reference`.
- No forward references such as “第 N 章会讲” or "a later chapter".
- At least two `check` blocks: one after `core`, one after `example`.

### Exercises

One YAML file per exercise. Kinds, in the order a lesson should use them
(worked example → predict → debug → parsons → write, easy to hard):

```yaml
kind: write            # write | debug | parsons | predict
difficulty: 2          # 1 easy, 2 medium, 3 hard
lesson_ref: core       # the section to revisit when this goes wrong
objective: group-rows  # the meta.yaml objective this exercise practises
prompt: { zh: …, en: … }    # Markdown, terms allowed
hints:                 # 1–2 levels, general → specific
  - { zh: …, en: … }   # where to look; no code from the solution
  - { zh: …, en: … }   # the principle; may show a small fragment
explain: { zh: …, en: … }   # why the solution works, clause by clause, and one plausible wrong way
solution: |            # one shared reference solution
  SELECT …
starter: …             # optional; required for debug (the broken query)
traps:                 # optional, write / debug / parsons: known wrong answers
  - sql: |
      SELECT …
    say: { zh: …, en: … }   # what this query gets wrong and what to change; never the full solution
check:                 # all optional
  order_matters: false # true only when the prompt asks for an order
  column_names: false  # true only when the prompt names the output columns
  mode: result         # result | tables (for INSERT / UPDATE / DELETE) | probe | attempts
  tables: []           # mode tables: which tables to compare afterwards
  probe: |             # mode probe: a query run after the SQL; its result is graded
    SELECT …           # (for CREATE TABLE / VIEW / INDEX: changes a snapshot cannot see)
  attempts: [ … ]      # mode attempts: statements tried in turn after the SQL; graded on
                       # which succeed and which fail (SQLSTATE), so constraints are
                       # judged by behaviour, not by how they were written
```

- **Objectives.** A template-2 lesson lists 2–5 in meta.yaml, as
  `objectives: [{ id, zh, en }]`: ids kebab-case and unique, each text starting
  with a measurable verb (能写出 / 能预测 / 能解释 / 能找出; Write / Predict /
  Explain / Find), never “understand”. Optional `reference: [ROLLUP]` lists
  words from `introduces` taught for recognition only.
- **Template 2** (`template: 2` in meta.yaml): every exercise has `objective`,
  `hints` and `explain`, every predict choice has `why`, and each objective has
  at least two exercises, one of them `write`. Legacy lessons may omit all of
  these and may keep a single `hint: { zh, en }` (one level); a file never has
  both `hint` and `hints`. validate checks each field wherever it appears.
- Hint ladder: Show hint opens level 1, More help the next; after the last,
  once something has been submitted, Show answer shows `solution` and
  `explain` and is recorded as a reveal (see State). After a correct answer the
  verdict shows the solution next to the learner's SQL, then `explain`.
- `traps`: when a submission is wrong and its result would pass with a trap as
  the reference, the verdict shows that trap's `say` above the diff. Take them
  from the lesson's `mistakes`. validate runs each one: it must run and must
  not pass, and it warns when one gives the same result as an earlier trap,
  whose `say` would always win.
- `parsons`: the solution's lines become pieces; add `distractors: [ … ]`.
  Graded by running the assembled query, so any valid order passes.
- `predict`: no `solution`; instead `query`, `choices`, `answer` (0-based
  index) and `explain`. A choice is a string, `{ zh, en }`, or either plus
  `why`: `{ text: '5', why: { zh, en } }`, `{ zh, en, why: { zh, en } }`.
  After any answer the verdict shows the chosen `why`, then `explain`. When the
  question is about how many rows come back, add `verify: { rows: N }` so
  validate checks the answer key against the data. In template-2 lessons Run
  stays locked until an answer is in, so the prompt asks for a prediction
  ("think first, then run it"); legacy lessons keep Run open, so their prompts
  may say "run the query below".
- Prompts must state everything the grader checks: the columns, their order,
  whether rows must be sorted. If the prompt does not say it, do not check it.
- At least four exercises per lesson, covering at least three kinds.

### Chapter sets

A module may have two sets under `content/chapters/<module-id>/`, in the
exercise YAML format and kinds above. Their ids are `chapter:<module-id>/quiz/<stem>`
and `chapter:<module-id>/challenge/<stem>`, so they never collide with lesson
exercises. `meta.yaml` is optional:

```yaml
dataset: shop                        # default shop
quiz_intro: { zh: …, en: … }         # Markdown, shown above the set
challenge_intro: { zh: …, en: … }
```

- Items follow the template-2 rules: `explain` on every item, `why` on every
  predict choice. `objective` is `<lesson-id>/<objective-id>`. `lesson_ref`
  is optional, as `<lesson-id>/<section-id>` or `<lesson-id>`.
- They may use every word introduced up to and including the chapter's last
  lesson, and nothing later; validate runs the same checks as for lesson
  exercises (solutions, traps, debug starters, `verify`).
- **Quiz**: 6–12 items, or up to one per objective when the chapter's
  template-2 lessons have more than 12 objectives. Each names the objective it measures, of a lesson in
  this chapter, and together they measure every objective of every template-2
  lesson in the chapter. Hints and traps are optional, since a sitting shows
  none. Write items that are isomorphic to the lessons' exercises, not copies.
- **Challenge**: integrative problems that need several lessons of the chapter
  and earlier ones; prompts are business questions in plain language, without
  column hints. Hints are required (the usual ladder). audit wants at least
  three, each solution using words from at least three lessons (rule 15), and
  warns when a write solution is close to SQL in the chapter's lessons (rule 16).
- Neither set affects lesson completion. Challenges enter the mistake bank;
  quiz answers do not.

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
- Every query uses only SQL taught so far (`introduces`, checked by validate).
  "This is explained later" is not an explanation: if a query needs it, teach it
  here or write the query differently.

Style: short paragraphs, one idea each. Explain why before how. Prefer one
precise sentence to three loose ones. No filler, no exclamation marks.

## Datasets

`content/datasets/shop.sql` is the dataset for every chapter. Its header lists the
traps it is built to surface (customers without orders, a product without a
category, NULL cities, a self-referencing column). Keep it small enough to
trace by hand. Change it only with care: every lesson's examples and
exercises depend on it, and validate will catch breakage.

## Engine

- `PracticeDb` runs learner SQL in `BEGIN … ROLLBACK`, so every run starts from
  the same data. A learner's own `BEGIN` / `COMMIT` / `ROLLBACK` becomes a
  savepoint inside that transaction (`compileTransactions` in `sql-scan.ts`),
  so transactions behave as in Postgres within a run, and the run is still
  undone afterwards. `PREPARE` and two-phase commit are refused.
- An exercise in `probe` mode is graded on the result of its probe query, run
  after the SQL inside the same transaction; in `attempts` mode, on whether each
  listed statement succeeds (each in its own savepoint, kept if it works). The
  exercise page shows the probe or the attempts, so the learner knows what is
  checked.
- Dates and timestamps come back as Postgres text; the session is UTC.
- The dataset is `ANALYZE`d once on load, so `EXPLAIN` estimates are the same on
  every run. `ANALYZE` writes row counts in place, outside any transaction, so
  lessons and exercises `ANALYZE` only tables they create in the same run, never
  the dataset's own tables.
- The grader picks the last statement that returned columns. It reports
  structured issues (`column-count`, `column-order`, `duplicates`,
  `row-explosion`, `order`, …) plus the indexes of missing and extra rows. The
  UI turns codes into localized messages; never put prose in the engine.
- `PracticeDb.grade` takes the exercise's trap queries. Only for a wrong
  answer, it runs each one with the same check and isolation and returns
  `trap`: the index of the first whose result the learner's matches. The UI
  looks up its `say`.

## State

Schema in `src/state/schema.ts`. `attempts` records every submission verbatim
(SQL, correctness, error, issues, language) and is the source of truth. A
Show answer is an attempt with `revealed = true` and `is_correct = false`: the
exercise enters the mistake bank and is solved only by a later correct
submission; reveals do not count as submissions.
`mistake_bank` is a VIEW: an exercise enters it on its first wrong answer and
is mastered after `mastery_streak` (setting, default 2) correct answers in a
row since its latest wrong one. `Progress.exportAll()` dumps everything as JSON
for a future "analyse my mistakes" workflow, which is not designed yet.
A chapter quiz is taken in `sittings`: one pass through all items, at most one
unfinished per module. Its answers are attempts with `sitting_id` set; lesson
states, exercise status and the mistake bank read only attempts without one.
A sitting's score (overall and per objective, the latest answer per item,
unanswered items wrong) is derived by `scoreSitting`, and whether it was a
pre- or post-test from how many of the chapter's lessons were done when it
started; neither is stored.
A schema change bumps `SCHEMA_VERSION` and adds a `MIGRATIONS` step, which
`Progress.open` runs on an older database before `SCHEMA_SQL`, so a learner's
history survives; append new view columns at the end (`CREATE OR REPLACE VIEW`).

## UI

Vanilla TypeScript, no framework. `src/main.ts` boots the progress store, the
SQL worker and the hash router (`src/ui/app.ts`); each page is one module in
`src/ui/views/` that renders into `#main`.

- Routes: `#/` map, `#/lesson/<id>[/<section>]`, `#/practice/<id>/<n>`,
  `#/mistakes`, `#/glossary`, and per module with chapter sets
  `#/chapter/<module-id>` (quiz, past sittings, first-vs-latest per objective,
  challenges), `#/chapter/<module-id>/quiz/<n>`, `#/chapter/<module-id>/challenge/<n>`
  and `#/chapter/<module-id>/sitting/<id>` (a finished sitting's results).
  Every lesson and exercise route opens directly; a quiz item needs an open
  sitting, started from the chapter page.
- `src/ui/views/exercise.ts` serves lesson exercises, challenges and quiz items.
  In quiz mode it shows no hints, traps, diff or explain, only "answer
  recorded", and keeps Run locked on predict items; the results page shows
  the score, every item right or wrong, its solution and `explain`.
- The map lists a chapter's sets after its lessons, with the challenges'
  segments, and on its first lesson suggests the quiz until one is taken.
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
