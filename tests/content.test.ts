import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildContent } from '../scripts/lib/build-content.ts'
import { validate } from '../scripts/validate.ts'

const root = fileURLToPath(new URL('./fixtures/content', import.meta.url))

/**
 * A copy of the fixture course with some files rewritten: `{ 'lessons/x/meta.yaml': text => … }`.
 * An edit of `null` deletes the file.
 */
function fixtureWith(edits: Record<string, ((text: string) => string) | null>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sql-lab-'))
  cpSync(root, dir, { recursive: true })
  for (const [file, edit] of Object.entries(edits)) {
    const path = join(dir, file)
    if (edit === null) { rmSync(path); continue }
    const before = readFileSync(path, 'utf8')
    const after = edit(before)
    if (after === before) throw new Error(`edit of ${file} changed nothing`)
    writeFileSync(path, after)
  }
  return dir
}

describe('buildContent', () => {
  const { course, problems } = buildContent(root)
  const lesson = course.lessons.basics!

  it('builds the fixture without problems', () => {
    expect(problems).toEqual([])
    expect(course.path).toEqual(['basics', 'filtering'])
    expect(course.modules[0]!.planned.map(p => p.title)).toEqual([{ zh: '以后再写', en: 'Coming later' }])
  })

  it('annotates terms in titles and keeps a plain-text form', () => {
    expect(course.modules[0]!.title).toEqual({ zh: '基础表', en: 'Basic tables' })
    expect(course.modules[0]!.titleHtml.zh).toBe('基础<dfn class="term" data-term="table" title="table">表<span class="term-alt" lang="en"> (table)</span></dfn>')
  })

  it('splits lessons into template sections with plain headings', () => {
    expect(lesson.body.en.map(s => s.id)).toEqual(['why', 'core', 'example', 'mistakes', 'summary'])
    expect(lesson.body.zh[0]!.heading).toBe('为什么需要它')
  })

  it('expands terms with the primary language first and annotates only the first use per section', () => {
    const why = lesson.body.zh[0]!.html
    expect(why).toContain('<dfn class="term" data-term="table" title="table">表<span class="term-alt" lang="en"> (table)</span></dfn>')
    expect(why.match(/class="term term-repeat" data-term="row"/g)).toHaveLength(1)
    const core = lesson.body.zh[1]!.html
    expect(core).toContain('class="term" data-term="table"') // new section, annotated again
  })

  it('supports display overrides and capitalisation in English', () => {
    expect(lesson.body.en[0]!.html).toContain('>rows<span class="term-alt" lang="zh-Hans"> (行)</span>')
    expect(lesson.body.en[1]!.html).toContain('>Table<span')
  })

  it('marks runnable examples', () => {
    expect(lesson.body.en[2]!.html).toContain('class="sql-run" data-sql="SELECT name FROM pets;"')
  })

  it('builds each exercise kind', () => {
    const [write, debug, parsons, predict] = lesson.exercises
    expect(write!.id).toBe('basics/01-names')
    expect(debug!.kind === 'debug' && debug!.starter).toBe('SELECT nam FROM pets')
    expect(parsons!.kind === 'parsons' && [...parsons!.pieces!].sort()).toEqual(['FROM pets', 'ORDER BY age', 'SELECT name', 'WHERE age'])
    expect(predict!.kind === 'predict' && predict!.choices[1]).toMatchObject({ zh: '2', en: '2' })
  })
})

describe('buildContent: objectives and exercise feedback', () => {
  const { course } = buildContent(root)
  const basics = course.lessons.basics!
  const filtering = course.lessons.filtering!

  it('reads template, objectives and reference from meta.yaml', () => {
    expect(basics.template).toBe(2)
    expect(basics.objectives.map(o => o.id)).toEqual(['pick-columns', 'order-rows', 'predict-filter'])
    expect(basics.objectives[0]!.text.zh).toContain('<dfn class="term" data-term="table" title="table">表')
    expect(basics.reference).toEqual([])
    expect(filtering).toMatchObject({ template: 1, objectives: [], reference: [] })
  })

  it('reads hints, explain, objective and traps', () => {
    const write = basics.exercises[0]!
    expect(write.objective).toBe('pick-columns')
    expect(write.hints.map(h => h.en)).toEqual(['<p>Which column holds the names?</p>\n', '<p>The columns you want go after <code>SELECT</code>; the table goes after <code>FROM</code>.</p>\n'])
    expect(write.explain?.en).toContain('<code>SELECT name</code> picks')
    expect(write.kind !== 'predict' && write.traps).toEqual([{
      sql: 'SELECT * FROM pets',
      say: expect.objectContaining({ zh: expect.stringContaining('<dfn class="term" data-term="column"') }),
    }])
    expect(basics.exercises[1]!.kind !== 'predict' && basics.exercises[1]!.traps).toEqual([])
  })

  it('turns a legacy `hint` into one level and leaves explain and objective out', () => {
    const [, write] = filtering.exercises
    expect(write!.hints).toEqual([{ zh: '<p>用 <code>WHERE age &gt; 5</code>。</p>\n', en: '<p>Use <code>WHERE age &gt; 5</code>.</p>\n' }])
    expect(write!.explain).toBeUndefined()
    expect(write!.objective).toBeUndefined()
  })

  it('reads predict choices as strings, { zh, en } and either with why', () => {
    const predict = basics.exercises[3]!
    if (predict.kind !== 'predict') throw new Error('expected a predict exercise')
    expect(predict.choices.map(c => [c.zh, c.en])).toEqual([['1', '1'], ['2', '2'], ['3', '3']])
    expect(predict.choices[1]!.why!.en).toBe("<p>Mochi and Tofu match; Bean's age is NULL, so it is left out.</p>\n")
    expect(predict.choices[2]!.why!.zh).toContain('<code>NULL &gt; 2</code>')
    const legacy = filtering.exercises[0]!
    expect(legacy.kind === 'predict' && legacy.choices[0]).toEqual({ zh: '1', en: '1' })
  })

  it('reports malformed feedback fields', () => {
    const dir = fixtureWith({
      'lessons/filtering/exercises/02-old.yaml': t => t.replace('hint:', 'hints: [{ zh: 一, en: one }, { zh: 二, en: two }, { zh: 三, en: three }]\nhint:'),
      'lessons/basics/exercises/02-fix.yaml': t => t.replace(/hints:\n.*\n/, 'hint: { zh: 看列名。, en: Check the column name. }\n'),
      'lessons/basics/exercises/04-predict.yaml': t => t
        .replace("    en: '3'\n", "    en: '3'\n    text: '3'\n")
        .replace('why: { zh: Mochi 3 岁，Tofu 7 岁，两只都大于 2。, en: "Mochi is 3 and Tofu is 7: both are over 2." }', 'why: { en: Both are over 2. }'),
      'lessons/basics/meta.yaml': t => t.replace('id: order-rows', 'id: Order_Rows'),
    })
    expect(buildContent(dir).problems).toEqual([
      'lesson basics: objectives[1]: id "Order_Rows" is not kebab-case',
      'exercise basics/02-fix: template-2 lessons use `hints`, not `hint`',
      'exercise basics/04-predict: choices[0].why: missing zh',
      'exercise basics/04-predict: choices[2]: use either `text` or `zh` / `en`, not both',
      'exercise filtering/02-old: has both `hint` and `hints`; keep only `hints`',
      'exercise filtering/02-old: hints has 3 levels; it needs 1 or 2',
    ])
  })
})

describe('validate', () => {
  it('passes the fixture course', async () => {
    const { problems } = await validate(root)
    expect(problems).toEqual([])
  }, 30_000)
})

describe('validate: predict answers', () => {
  it('flags a verify.rows that does not match the data', async () => {
    const { cpSync, mkdtempSync, writeFileSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'sql-lab-'))
    cpSync(root, dir, { recursive: true })
    const file = join(dir, 'lessons/basics/exercises/04-predict.yaml')
    writeFileSync(file, readFileSync(file, 'utf8').replace('verify: { rows: 2 }', 'verify: { rows: 3 }'))
    const { problems } = await validate(dir)
    expect(problems).toEqual(['exercise basics/04-predict: verify.rows is 3 but the query returns 2 rows'])
  }, 30_000)
})

describe('validate: traps', () => {
  it('flags a trap that passes, one that fails, and one that gives away the solution', async () => {
    const dir = fixtureWith({
      // Row order is not checked, so this "wrong" query is right.
      'lessons/basics/exercises/01-names.yaml': t => t.replace('- sql: SELECT * FROM pets', '- sql: SELECT name FROM pets ORDER BY id DESC'),
      'lessons/basics/exercises/05-youngest.yaml': t => t.replace('- sql: SELECT name, age FROM pets ORDER BY name', '- sql: SELECT name, agee FROM pets'),
      'lessons/basics/exercises/06-older.yaml': t => t.replace('题目只要名字。', '写成 `SELECT name FROM pets WHERE age > 2`。'),
    })
    const { problems } = await validate(dir)
    expect(problems).toEqual([
      'exercise basics/01-names: trap 1 passes against the solution',
      'exercise basics/05-youngest: trap 1 fails: column "agee" does not exist',
      'exercise basics/06-older: trap 1.say.zh contains the full solution',
    ])
  }, 30_000)

  it('warns when a trap can never show because an earlier one has the same result', async () => {
    const dir = fixtureWith({
      'lessons/basics/exercises/05-youngest.yaml': t => t.replace('- sql: SELECT name, age FROM pets ORDER BY name', '- sql: SELECT name, age FROM pets ORDER BY id'),
    })
    const { problems, warnings } = await validate(dir)
    expect(problems).toEqual([])
    expect(warnings).toContain('exercise basics/05-youngest: trap 2 gives the same result as trap 1, so its `say` never shows')
  }, 30_000)
})

describe('validate: objectives and template 2', () => {
  it('requires explain and why in a template-2 lesson', async () => {
    const dir = fixtureWith({
      'lessons/basics/exercises/02-fix.yaml': t => t.replace(/explain:\n.*\n.*\n/, ''),
      'lessons/basics/exercises/04-predict.yaml': t => t.replace(/    why: \{ zh: Mochi 3 岁.*\n/, ''),
    })
    const { problems } = await validate(dir)
    expect(problems).toEqual([
      'exercise basics/02-fix: template 2 needs `explain`',
      'exercise basics/04-predict: template 2 needs a `why` on every choice',
    ])
  }, 30_000)

  it('flags an unknown objective, an objective without a write exercise and a reference outside introduces', async () => {
    const dir = fixtureWith({
      'lessons/basics/meta.yaml': t => t.replace('introduces:', 'reference: [ROLLUP]\nintroduces:'),
      'lessons/basics/exercises/02-fix.yaml': t => t.replace('objective: pick-columns', 'objective: pick-colums'),
      // predict-filter keeps two exercises, a parsons and a predict, but loses its write.
      'lessons/basics/exercises/03-order.yaml': t => t.replace('objective: order-rows', 'objective: predict-filter'),
      'lessons/basics/exercises/06-older.yaml': t => t.replace('objective: predict-filter', 'objective: order-rows'),
    })
    const { problems } = await validate(dir)
    expect(problems).toEqual([
      'lesson basics: reference lists ROLLUP, which is not in introduces',
      'lesson basics: objective "pick-columns" needs at least two exercises, one of them write (has 1: write)',
      'lesson basics: objective "predict-filter" needs at least two exercises, one of them write (has 2: parsons, predict)',
      'exercise basics/02-fix: objective "pick-colums" is not an objective of basics',
    ])
  }, 30_000)

  it('needs 2–5 objectives in a template-2 lesson', async () => {
    const dir = fixtureWith({
      'lessons/basics/meta.yaml': t => t.replace(/objectives:[\s\S]*?dataset:/, 'dataset:'),
    })
    const { problems } = await validate(dir)
    expect(problems).toContain('lesson basics: template 2 needs 2–5 objectives (has 0)')
  }, 30_000)
})

describe('validate: nothing used before it is taught', () => {
  it('flags a keyword used before the lesson that introduces it', async () => {
    const { cpSync, mkdtempSync, writeFileSync, readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const { tmpdir } = await import('node:os')
    const dir = mkdtempSync(join(tmpdir(), 'sql-lab-'))
    cpSync(root, dir, { recursive: true })
    const meta = (lesson: string) => join(dir, `lessons/${lesson}/meta.yaml`)
    writeFileSync(meta('basics'), readFileSync(meta('basics'), 'utf8').replace('FROM, WHERE,', 'FROM,'))
    writeFileSync(meta('filtering'), readFileSync(meta('filtering'), 'utf8').replace('[IS,', '[WHERE, IS,'))
    const { problems } = await validate(dir)
    expect(problems).toEqual(['lesson basics: uses WHERE in exercise basics/03-order, exercise basics/04-predict, exercise basics/06-older, but it is introduced later, by filtering'])
  }, 30_000)
})

describe('chapter sets', () => {
  const { course, problems } = buildContent(root)
  const m1 = course.modules[0]!
  const quizFile = (n: string) => `chapters/m1/quiz/${n}.yaml`

  it('parses the quiz and the challenges onto their module, with ids no lesson can use', () => {
    expect(problems).toEqual([])
    expect(m1.dataset).toBe('tiny')
    expect(m1.quiz.map(e => e.id)).toEqual([
      'chapter:m1/quiz/01-write-columns', 'chapter:m1/quiz/02-predict-columns', 'chapter:m1/quiz/03-write-sorted',
      'chapter:m1/quiz/04-parsons-sorted', 'chapter:m1/quiz/05-predict-filter', 'chapter:m1/quiz/06-debug-null',
    ])
    expect(m1.challenge.map(e => e.id)).toEqual(['chapter:m1/challenge/01-write-known-ages', 'chapter:m1/challenge/02-write-not-old', 'chapter:m1/challenge/03-predict-first'])
    expect(m1.quiz[0]).toMatchObject({ lesson: 'chapter:m1', set: { module: 'm1', kind: 'quiz' }, objective: 'basics/pick-columns', hints: [], lessonRef: '' })
    expect(m1.challenge[1]).toMatchObject({ set: { module: 'm1', kind: 'challenge' }, lessonRef: 'filtering/core', objective: undefined })
    expect(m1.challenge[0]!.kind !== 'predict' && m1.challenge[0]!.traps).toHaveLength(1)
    expect(m1.intro.quiz?.en).toBe('<p>Six questions, one or more for each objective of <code>basics</code>.</p>\n')
    // Lessons and other modules are untouched; a module without a folder has empty sets.
    expect(course.lessons.basics!.exercises.every(e => e.set === undefined)).toBe(true)
  })

  it('gives a module without a chapter folder empty sets', () => {
    const dir = fixtureWith({ 'chapters/m1/meta.yaml': null })
    const built = buildContent(dir)
    expect(built.course.modules[0]!.dataset).toBe('shop')
    expect(built.problems).toContain('chapter m1: unknown dataset "shop"')
  })

  it('needs hints on challenges but not on quiz items, and flags stray meta keys', () => {
    const dir = fixtureWith({
      'chapters/m1/challenge/02-write-not-old.yaml': t => t.replace(/hints:\n.*\n/, ''),
      'chapters/m1/meta.yaml': t => t.replace('dataset: tiny', 'dataset: tiny\nquizz_intro: oops'),
    })
    expect(buildContent(dir).problems).toEqual([
      'chapter m1: meta.yaml: unknown key "quizz_intro" (allowed: dataset, quiz_intro, challenge_intro)',
      'exercise chapter:m1/challenge/02-write-not-old: missing hints',
    ])
  })

  it('runs the same exercise checks as for lessons', async () => {
    const dir = fixtureWith({
      'chapters/m1/quiz/06-debug-null.yaml': t => t.replace('starter: SELECT name FROM pets WHERE age = NULL', 'starter: SELECT name FROM pets WHERE age IS NULL'),
      'chapters/m1/quiz/05-predict-filter.yaml': t => t.replace('verify: { rows: 1 }', 'verify: { rows: 2 }'),
      'chapters/m1/challenge/01-write-known-ages.yaml': t => t.replace('- sql: SELECT name FROM pets ORDER BY age DESC', '- sql: SELECT name FROM pets WHERE age IS NOT NULL ORDER BY age DESC, id'),
    })
    expect((await validate(dir)).problems).toEqual([
      'exercise chapter:m1/quiz/05-predict-filter: verify.rows is 2 but the query returns 1 rows',
      'exercise chapter:m1/quiz/06-debug-null: the broken starter query already passes',
      'exercise chapter:m1/challenge/01-write-known-ages: trap 1 passes against the solution',
    ])
  }, 30_000)

  it('needs an objective and explain on every quiz item, and the objective must exist', async () => {
    const dir = fixtureWith({
      [quizFile('01-write-columns')]: t => t.replace('objective: basics/pick-columns\n', '').replace(/explain:\n.*\n.*\n/, ''),
      [quizFile('02-predict-columns')]: t => t.replace('objective: basics/pick-columns', 'objective: basics/pick-colums'),
      [quizFile('03-write-sorted')]: t => t.replace('objective: basics/order-rows', 'objective: order-rows'),
      'chapters/m1/challenge/02-write-not-old.yaml': t => t.replace('lesson_ref: filtering/core', 'lesson_ref: filtering/nope'),
    })
    expect((await validate(dir)).problems).toEqual([
      'exercise chapter:m1/quiz/01-write-columns: quiz items need `objective`: the lesson objective the item measures',
      'exercise chapter:m1/quiz/01-write-columns: chapter set items need `explain`',
      'exercise chapter:m1/quiz/02-predict-columns: objective "basics/pick-colums" is not an objective of a lesson in this chapter (write <lesson-id>/<objective-id>)',
      'exercise chapter:m1/quiz/03-write-sorted: objective "order-rows" is not an objective of a lesson in this chapter (write <lesson-id>/<objective-id>)',
      'exercise chapter:m1/challenge/02-write-not-old: lesson_ref "filtering/nope": "nope" is not a section of filtering',
      'chapter m1: the quiz does not measure objective basics/pick-columns',
    ])
  }, 30_000)

  it('needs a quiz that measures every objective of the chapter\'s template-2 lessons', async () => {
    const dir = fixtureWith({
      [quizFile('05-predict-filter')]: t => t.replace('objective: basics/predict-filter', 'objective: basics/order-rows'),
      [quizFile('06-debug-null')]: t => t.replace('objective: basics/predict-filter', 'objective: basics/order-rows'),
    })
    expect((await validate(dir)).problems).toEqual(['chapter m1: the quiz does not measure objective basics/predict-filter'])
  }, 30_000)

  it('needs 6–12 quiz items', async () => {
    const dir = fixtureWith({ [quizFile('03-write-sorted')]: null })
    expect((await validate(dir)).problems).toEqual(['chapter m1: the quiz has 5 items; it needs 6–12'])
  }, 30_000)

  it('allows words up to the chapter\'s last lesson and nothing from a later chapter', async () => {
    // Move `filtering` (IS, NULL, NOT, DESC) into a chapter of its own, after m1.
    const dir = fixtureWith({
      'curriculum.yaml': t => t.replace('lessons: [basics, filtering]', 'lessons: [basics]')
        + '  - id: m2\n    title: { zh: 筛选, en: Filtering }\n    summary: { zh: 第二步。, en: Second steps. }\n    lessons: [filtering]\n',
    })
    const { problems } = await validate(dir)
    const later = (word: string, items: string[]) =>
      `chapter m1: uses ${word} in ${items.map(i => `exercise chapter:m1/${i}`).join(', ')}, but it is introduced later, by filtering`
    expect(problems.filter(p => p.startsWith('chapter m1: uses'))).toEqual([
      later('IS', ['quiz/06-debug-null', 'challenge/01-write-known-ages', 'challenge/03-predict-first']),
      later('NULL', ['quiz/06-debug-null', 'challenge/01-write-known-ages', 'challenge/03-predict-first']),
      later('NOT', ['challenge/01-write-known-ages', 'challenge/02-write-not-old', 'challenge/03-predict-first']),
      later('DESC', ['challenge/01-write-known-ages', 'challenge/03-predict-first']),
    ])
    expect(problems).toContain('exercise chapter:m1/challenge/02-write-not-old: lesson_ref "filtering/core" names no lesson of this chapter or an earlier one (write <lesson-id>/<section-id>)')
  }, 30_000)

  it('rejects a chapter folder that matches no module', () => {
    const dir = fixtureWith({ 'curriculum.yaml': t => t.replace('id: m1', 'id: m9') })
    expect(buildContent(dir).problems).toContain('chapter m1: content/chapters/m1/ matches no module in curriculum.yaml')
  })
})

describe('sqlWords', () => {
  it('classifies keywords, functions and names, and skips strings and comments', async () => {
    const { sqlWords } = await import('../scripts/lib/vocabulary.ts')
    const lex = {
      keywords: new Map([['select', 'R'], ['from', 'R'], ['as', 'R'], ['order', 'R'], ['by', 'U'], ['coalesce', 'C'], ['name', 'U'], ['first', 'U'], ['nulls', 'U'], ['limit', 'R']]),
      functions: new Set(['count', 'upper']),
      names: new Set(['name', 'pets']),
    }
    const sql = "select count(*), coalesce(name, 'LIMIT x') AS first, upper(NAME) -- LIMIT\nFROM pets ORDER BY 1 NULLS FIRST"
    expect([...sqlWords(sql, lex)].sort()).toEqual(['AS', 'BY', 'COALESCE', 'FIRST', 'FROM', 'NULLS', 'ORDER', 'SELECT', 'count()', 'first', 'name', 'pets', 'upper()'].sort())
  })
})

describe('syntax blocks', () => {
  it('marks keywords, placeholders and notation, and leaves literal symbols alone', async () => {
    const { highlightSyntax } = await import('../src/content/highlight.ts')
    expect(highlightSyntax('SELECT { * | expression } [, …]')).toBe(
      '<span class="tk-keyword">SELECT</span> <span class="syn-meta">{</span> * <span class="syn-meta">|</span> '
      + '<span class="syn-ph">expression</span> <span class="syn-meta">}</span> <span class="syn-meta">[</span>, '
      + '<span class="syn-meta">…</span><span class="syn-meta">]</span>',
    )
    expect(highlightSyntax('string || string')).toBe('<span class="syn-ph">string</span> || <span class="syn-ph">string</span>')
    expect(highlightSyntax('round(number)')).toBe('<span class="tk-fn">round</span>(<span class="syn-ph">number</span>)')
    expect(highlightSyntax('function_name ( x )')).toBe('<span class="syn-ph">function_name</span> ( <span class="syn-ph">x</span> )')
  })
})
