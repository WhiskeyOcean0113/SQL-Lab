import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { buildContent } from '../scripts/lib/build-content.ts'
import { validate } from '../scripts/validate.ts'

const root = fileURLToPath(new URL('./fixtures/content', import.meta.url))

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
    expect(predict!.kind === 'predict' && predict!.choices[1]).toEqual({ zh: '2', en: '2' })
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

describe('syntax blocks', () => {
  it('marks keywords, placeholders and notation, and leaves literal symbols alone', async () => {
    const { highlightSyntax } = await import('../src/content/highlight.ts')
    expect(highlightSyntax('SELECT { * | expression } [, …]')).toBe(
      '<span class="tk-keyword">SELECT</span> <span class="syn-meta">{</span> * <span class="syn-meta">|</span> '
      + '<span class="syn-ph">expression</span> <span class="syn-meta">}</span> <span class="syn-meta">[</span>, '
      + '<span class="syn-meta">…</span><span class="syn-meta">]</span>',
    )
    expect(highlightSyntax('string || string')).toBe('<span class="syn-ph">string</span> || <span class="syn-ph">string</span>')
  })
})
