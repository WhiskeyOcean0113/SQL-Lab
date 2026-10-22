import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildContent } from '../scripts/lib/build-content.ts'
import { validate } from '../scripts/validate.ts'

const root = fileURLToPath(new URL('./fixtures/content', import.meta.url))

/** A copy of the fixture course with some files rewritten: `{ 'lessons/x/meta.yaml': text => … }`. */
function fixtureWith(edits: Record<string, (text: string) => string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'sql-lab-'))
  cpSync(root, dir, { recursive: true })
  for (const [file, edit] of Object.entries(edits)) {
    const path = join(dir, file)
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
