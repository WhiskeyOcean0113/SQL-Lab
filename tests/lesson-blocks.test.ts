import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildContent } from '../scripts/lib/build-content.ts'
import { checkBlocks, parseCheck, parseSteps, renderSections, stepBlocks } from '../scripts/lib/markdown.ts'
import { validate } from '../scripts/validate.ts'

// ```check and ```steps blocks and the reference section, against the
// `filtering` fixture lesson.

const root = fileURLToPath(new URL('./fixtures/content', import.meta.url))
const glossary = new Map([['row', { id: 'row', en: 'row', zh: '行' }]])

describe('parseCheck', () => {
  const good = `query: |\n  SELECT 1;\nquestion: How many?\nchoices: ['1', 2]\nanswer: 0\nexplain: One row.\nverify: { rows: 1 }\n`

  it('reads every field, and turns YAML numbers into choice text', () => {
    expect(parseCheck(good)).toEqual({
      block: { query: 'SELECT 1;', question: 'How many?', choices: ['1', '2'], answer: 0, explain: 'One row.', verifyRows: 1 },
      problems: [],
    })
  })

  it('reports malformed YAML instead of throwing', () => {
    const { block, problems } = parseCheck('query: [oops\n')
    expect(block).toBeUndefined()
    expect(problems).toEqual([expect.stringMatching(/^invalid YAML: /)])
  })

  it('reports missing and unknown fields, a bad answer and a bad verify', () => {
    const { problems } = parseCheck('query: SELECT 1\nchoices: [a]\nanswer: 4\nverify: 3\nhint: no\n')
    expect(problems).toEqual([
      'unknown field "hint"',
      'missing "question"',
      'missing "explain"',
      '"choices" needs a list of at least two items',
      '"answer" must be a 0-based index into choices (0 to 0), got 4',
      '"verify" must be { rows: N }',
    ])
  })
})

describe('parseSteps', () => {
  it('reads a list of steps; group is optional', () => {
    expect(parseSteps('- sql: SELECT 1\n  say: one\n  group: x\n- sql: SELECT 2\n  say: two\n')).toEqual({
      steps: [{ sql: 'SELECT 1', say: 'one', group: 'x' }, { sql: 'SELECT 2', say: 'two' }],
      problems: [],
    })
  })

  it('needs 2–8 steps, each with sql and say', () => {
    expect(parseSteps('- sql: SELECT 1\n  colour: red\n').problems).toEqual([
      'needs 2 to 8 steps, has 1',
      'step 1: unknown field "colour"',
      'step 1: missing "say"',
    ])
    expect(parseSteps('sql: SELECT 1').problems).toEqual(['must be a YAML list of steps, each with sql and say'])
  })
})

describe('rendering', () => {
  it('turns a broken block into a build problem with its line, not a crash', () => {
    const env = { lang: 'en' as const, glossary, problems: [] as string[] }
    const [section] = renderSections('## Core idea {#core}\nText.\n\n```check\nquery: [oops\n```\n', env)
    expect(section!.html).toContain('<pre><code>query: [oops</code></pre>')
    expect(env.problems).toEqual([expect.stringMatching(/^check block at line 4: invalid YAML: /)])
  })

  const { course, problems, sources } = buildContent(root)
  const lesson = course.lessons.filtering!

  it('builds the fixture lesson, with reference as its last section', () => {
    expect(problems).toEqual([])
    expect(lesson.body.zh.map(s => s.id)).toEqual(['why', 'core', 'example', 'mistakes', 'summary', 'reference'])
    expect(lesson.body.en.at(-1)!.heading).toBe('Reference')
  })

  it('renders a checkpoint placeholder with the query, the answer and expanded terms', () => {
    const core = lesson.body.zh.find(s => s.id === 'core')!.html
    expect(core).toContain('<div class="checkpoint" data-sql="SELECT name FROM pets WHERE age &gt; 2;" data-answer="1">')
    expect(core).toMatch(/<div class="cp-q"><p>这条查询返回几<dfn class="term[^"]*" data-term="row"/)
    expect(core).toContain('<ol class="cp-choices"><li>1</li><li>2</li><li>3</li></ol>')
    expect(core).toContain('<div class="cp-explain" hidden>')
  })

  it('renders a stepper placeholder with each step’s SQL, group and caption', () => {
    const core = lesson.body.en.find(s => s.id === 'core')!.html
    expect(core).toContain('<li class="st-step" data-sql="SELECT name, age FROM pets ORDER BY age;" data-group="age">')
    expect(core).toContain('<li class="st-step" data-sql="SELECT name, age FROM pets WHERE age &gt; 2 ORDER BY age;">')
    expect(core).toMatch(/<div class="st-say"><p>All three <dfn class="term[^"]*" data-term="row"[^>]*>rows/)
  })

  it('extracts the shared parts so validate can compare languages', () => {
    const [zh] = checkBlocks(sources.filtering!.zh)
    const [en] = checkBlocks(sources.filtering!.en)
    expect({ ...zh, question: undefined, explain: undefined, choices: zh!.choices.length })
      .toEqual({ ...en, question: undefined, explain: undefined, choices: en!.choices.length })
    expect(zh!.verifyRows).toBe(2)
    const strip = (src: string) => stepBlocks(src).map(b => b.map(({ sql, group }) => ({ sql, group })))
    expect(strip(sources.filtering!.zh)).toEqual(strip(sources.filtering!.en))
    expect(strip(sources.filtering!.en)).toEqual([[
      { sql: 'SELECT name, age FROM pets ORDER BY age;', group: 'age' },
      { sql: 'SELECT name, age FROM pets WHERE age > 2 ORDER BY age;', group: undefined },
    ]])
  })
})

/** Validate a copy of the fixture after editing the filtering lesson's Markdown. */
async function problemsAfter(edit: (src: string, lang: 'zh' | 'en') => string) {
  const dir = mkdtempSync(join(tmpdir(), 'sql-lab-'))
  cpSync(root, dir, { recursive: true })
  for (const lang of ['zh', 'en'] as const) {
    const file = join(dir, `lessons/filtering/lesson.${lang}.md`)
    writeFileSync(file, edit(readFileSync(file, 'utf8'), lang))
  }
  return (await validate(dir)).problems
}

describe('validate: lesson blocks', () => {
  it('flags a check block whose answer differs between zh and en', async () => {
    const problems = await problemsAfter((src, lang) => (lang === 'en' ? src.replace('answer: 1', 'answer: 2') : src))
    expect(problems).toEqual(['lesson filtering: `check` block 1 differs between zh and en: answer'])
  }, 30_000)

  it('flags steps whose SQL differs between zh and en', async () => {
    const problems = await problemsAfter((src, lang) => (lang === 'zh' ? src.replace('ORDER BY age;\n  say: WHERE', 'ORDER BY name;\n  say: WHERE') : src))
    expect(problems).toEqual(['lesson filtering: `steps` block 1 differs between zh and en: step 2 sql'])
  }, 30_000)

  it('flags a step that fails', async () => {
    const problems = await problemsAfter(src => src.replace('WHERE age > 2 ORDER BY age;', 'WHERE weight > 2 ORDER BY age;'))
    expect(problems).toEqual([expect.stringMatching(/^lesson filtering: steps block 1, step 2: fails: column "weight" does not exist/)])
  }, 30_000)

  it('flags a group column the step does not return', async () => {
    const problems = await problemsAfter(src => src.replace('group: age', 'group: weight'))
    expect(problems).toEqual(['lesson filtering: steps block 1, step 1: group column "weight" is not in the result (name, age)'])
  }, 30_000)

  it('flags an answer outside the choices', async () => {
    const problems = await problemsAfter(src => src.replace('answer: 1', 'answer: 3'))
    expect(problems).toEqual(['zh', 'en'].map(l =>
      expect.stringMatching(new RegExp(`^lesson filtering: lesson\\.${l}\\.md: check block at line \\d+: "answer" must be a 0-based index into choices \\(0 to 2\\), got 3$`))))
  }, 30_000)

  it('flags a verify.rows that does not match the data', async () => {
    const problems = await problemsAfter(src => src.replace('verify: { rows: 2 }', 'verify: { rows: 3 }'))
    expect(problems).toEqual(['lesson filtering: check block 1: verify.rows is 3 but the query returns 2 rows'])
  }, 30_000)

  it('flags a check query that fails', async () => {
    const problems = await problemsAfter(src => src.replace('SELECT name FROM pets WHERE age > 2;', 'SELECT name FROM pets WHERE weight > 2;'))
    expect(problems).toEqual([expect.stringMatching(/^lesson filtering: check block 1: query fails: column "weight" does not exist/)])
  }, 30_000)

  it('includes check and step SQL in the vocabulary check', async () => {
    const problems = await problemsAfter(src => src
      .replace('SELECT name FROM pets WHERE age > 2;', 'SELECT name FROM pets WHERE age > 2 LIMIT 5;')
      .replace('SELECT name, age FROM pets ORDER BY age;', 'SELECT name, age FROM pets ORDER BY age LIMIT 5;'))
    expect(problems).toEqual(['lesson filtering: uses LIMIT in a `check` block, a `steps` block, which no lesson introduces (add it to the introducing lesson\'s meta.yaml)'])
  }, 30_000)

  it('keeps reference after summary', async () => {
    const problems = await problemsAfter(src => {
      const at = src.search(/^## (参考|Reference) /m)
      const ref = src.slice(at)
      const summary = src.search(/^## (小结|Summary) /m)
      return src.slice(0, summary) + ref.trimEnd() + '\n\n' + src.slice(summary, at)
    })
    expect(problems).toEqual(['lesson filtering: section "summary" is out of template order'])
  }, 30_000)
})
