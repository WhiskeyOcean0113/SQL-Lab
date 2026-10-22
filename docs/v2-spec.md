# Template 2: shared spec for the learning-v2 work

The interface every agent on the `learning-v2` branch builds to. Background and
reasons: `docs/learning-review.md`. When the work lands, `CLAUDE.md` becomes the
contract and this file is deleted.

## Opt-in

A lesson opts in with `template: 2` in `meta.yaml`. Lessons without it are
legacy: every new field is optional for them and validated only when present,
and nothing new is required. Template-2 lessons must satisfy every rule marked
**v2 required**. The rollout to all lessons happens later, lesson by lesson.

## meta.yaml

```yaml
template: 2
objectives:                # v2 required: 2–5 items
  - id: group-rows         # kebab-case, unique within the lesson
    zh: 能按一列或多列把行分组，并在每组里分别计算聚合值。
    en: Group rows by one or more columns and compute an aggregate for each group.
reference: [ROLLUP]        # optional: words from `introduces` taught for recognition only
```

- Objectives start with a measurable verb: 能写出 / 能预测 / 能解释 / 能找出, or
  Write / Predict / Explain / Find. Never "understand".
- `reference` must be a subset of `introduces`. Those words are exempt from the
  practice-coverage rule.

## Exercise YAML

```yaml
objective: group-rows          # v2 required: an objective id of this lesson
hints:                         # 1–2 authored levels, general → specific (replaces `hint`)
  - { zh: …, en: … }           # level 1: where to look; no code from the solution
  - { zh: …, en: … }           # level 2: the principle; may show a small fragment
explain: { zh: …, en: … }      # every kind; v2 required
traps:                         # write / debug / parsons; optional
  - sql: |
      SELECT …
    say: { zh: …, en: … }      # what this wrong query does and what to change
```

- `hint` (one `{ zh, en }`) stays valid for legacy files and means
  `hints: [hint]`. A file must not have both.
- `explain` for write / debug / parsons: why the reference solution works,
  clause by clause, and one plausible wrong way. Predict keeps its `explain`.
- `say` never contains the full solution.
- Predict `choices`: each item is a string, `{ zh, en }`, or either form plus
  `why`: `{ text: '5', why: { zh, en } }` or `{ zh, en, why: { zh, en } }`.
  **v2 required**: every choice has `why`.

### Behaviour

- **Hint ladder.** Show hint opens level 1, then a More help button opens the
  next level. After the last authored level comes Show answer (the bottom-out
  hint), available only after at least one submission: it shows the reference
  solution and `explain`. Revealing records an attempt with `revealed: true`
  and `isCorrect: false`, so the exercise enters the mistake bank; it becomes
  solved only by a later correct submission.
- **After a correct answer** (write / debug / parsons): the verdict shows the
  reference solution next to the learner's SQL, followed by `explain`.
- **Traps.** When a submission is wrong, the grader runs each trap with the same
  check spec. If the learner's result would pass with the trap as the reference,
  the grade carries `trap: <index>` (first match) and the UI shows its `say`
  above the usual diff. The engine returns only the index, never prose.
- **Predict.** Run is disabled until an answer has been submitted. After
  submitting, right or wrong, show `explain` and the chosen choice's `why`;
  then Run is enabled so the learner can check.

### validate

Any lesson, whenever the field is present:
- a trap runs without error, and does not pass against the solution;
- `objective` names an objective of the lesson; `reference` ⊆ `introduces`;
  `hints` has 1–2 levels; every `why` has both languages.

**v2 required**: 2–5 objectives; every exercise has `objective`, `explain` and
`hints`; every predict choice has `why`; each objective has at least two
exercises, at least one of them `write`.

## Lesson Markdown

### ```` ```check ````: an inline checkpoint (predict, then run)

````
```check
query: |
  SELECT status, count(*) FROM orders GROUP BY status;
question: 这条查询会返回几行？
choices: ['1', '5', '24']
answer: 1
explain: 24 行订单分成 5 组，每组输出一行。
verify: { rows: 5 }
```
````

- YAML inside the fence. `query`, `answer`, the number of choices and `verify`
  are identical in zh and en; `question`, `choices` and `explain` are in the
  file's language and may use `{{term:…}}`.
- UI: the learner picks a choice and presses Check; then right / wrong,
  `explain` and the query's result appear, and the query can be run. Formative
  only: not recorded in progress.
- validate: the query runs; `answer` is in range; `verify.rows` matches; the
  shared fields are identical across languages; the vocabulary check covers the
  query.

### ```` ```steps ````: step through intermediate results

````
```steps
- sql: |
    SELECT * FROM orders ORDER BY status;
  say: FROM：24 行订单。按 status 排好，同一组的行挨在一起。
  group: status
- sql: |
    SELECT status, count(*) AS orders FROM orders GROUP BY status;
  say: GROUP BY 之后，每组只剩一行。
```
````

- 2–8 steps. `sql` and `group` are identical across languages, in the same
  order; `say` is in the file's language.
- UI: one panel with Previous / Next and "step i of n", the caption, the step's
  SQL (highlighted) and its result table (run on first view). With `group`,
  rows are tinted by that column's value using `--grp-1` … `--grp-6` (with
  dark-mode values), cycling, plus a non-colour cue for each group.
- validate: every step runs; the vocabulary check covers each step (steps are
  lesson code, so `previews` apply).

### `reference` section

New optional section id `reference`, heading `参考` / `Reference`, placed after
`summary` and rendered collapsed by default. It holds dialect notes and rarely
used forms. Template order: why, core, syntax, example, variants, deeper,
mistakes, summary, reference.

## Audit: `npm run audit` (`scripts/audit.ts`)

A heuristic quality report over every lesson. By default it prints findings
and exits 0. With `--strict` it exits 1 when a template-2 lesson has an
error-level finding; pre-commit runs it after validate. For legacy lessons every
finding is reported as a warning.

| # | Rule | Level (template 2) |
|---|---|---|
| 1 | a write solution's bigram Jaccard against any lesson SQL (`sql`, `sql run`, `check`, `steps`) ≥ 0.6 | error |
| 2 | code in the hints (backticks) covers ≥ 60% of the solution's identifiers | error |
| 3 | a predict prompt contains the answer's number | warning |
| 4 | `explain` missing; a predict choice without `why` | error |
| 5 | a word in `introduces` but not `reference` appears in no exercise | error |
| 5b | … appears in no write exercise | warning |
| 6 | an objective with fewer than two exercises, or with no write exercise | error |
| 7 | numbered items in `mistakes` outnumber traps + debug exercises | warning |
| 8 | `introduces` minus `reference` has more than 8 words | error |
| 9 | `deeper` is longer than `core` (CJK characters in zh, code excluded) | error |
| 10 | forward references in prose (第 N 章会, 后面会, 以后会, 下一篇, 稍后; later chapter, next lesson, Chapter N will) | warning |
| 11 | MySQL, SQLite, Oracle or SQL Server named outside `deeper` and `reference` | error |
| 12 | row-count predicts (`verify.rows`) are more than half of the lesson's predicts | warning |
| 13 | fewer than two `check` blocks | error |
| 13b | no `steps` block | warning |
| 14 | traps on fewer than half of the write + debug exercises | warning |
