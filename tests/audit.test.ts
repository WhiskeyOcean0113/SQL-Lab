import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { audit, RULES, runCli, scanMarkdown, similarity, type AuditReport } from '../scripts/audit.ts'

// tests/fixtures/audit-content: `filtering` is legacy, `grouping` (template 2)
// passes every rule, `sorting` (template 2) breaks nearly all of them. The
// comments in its files say which file triggers which rule.
const root = fileURLToPath(new URL('./fixtures/audit-content', import.meta.url))

let report: AuditReport
beforeAll(async () => {
  report = await audit(root)
})

const findings = (rule: string, lesson?: string) => report.findings.filter(f => f.rule === rule && (lesson === undefined || f.lesson === lesson))
const where = (rule: string) => findings(rule).map(f => `${f.lesson}/${f.exercise ?? ''}`)
const messages = (rule: string, lesson: string) => findings(rule, lesson).map(f => f.message)

describe('audit levels', () => {
  it('audits every lesson in curriculum order, with its template', () => {
    expect(report.lessons).toEqual([
      { id: 'filtering', template: 1 },
      { id: 'grouping', template: 2 },
      { id: 'sorting', template: 2 },
    ])
  })

  it('finds nothing in a template-2 lesson that follows every rule', () => {
    expect(report.findings.filter(f => f.lesson === 'grouping')).toEqual([])
  })

  it('reports every finding of a legacy lesson as a warning', () => {
    const legacy = report.findings.filter(f => f.lesson === 'filtering')
    expect(new Set(legacy.map(f => f.rule))).toEqual(new Set(['1', '2', '3', '4', '5', '9', '10', '11', '12', '13', '13b', '14']))
    expect(legacy.every(f => f.level === 'warning' && f.template === 1)).toBe(true)
  })

  it("gives template-2 findings their rule's own level", () => {
    const v2 = report.findings.filter(f => f.lesson === 'sorting')
    for (const f of v2) expect(f.level).toBe(RULES.find(r => r.id === f.rule)!.level)
    expect(new Set(v2.map(f => f.rule))).toEqual(new Set(RULES.map(r => r.id).filter(id => id !== '13b')))
  })
})

describe('audit rules', () => {
  it('1: flags write solutions close to lesson SQL, steps blocks included', () => {
    expect(where('1')).toEqual(['filtering/02-write-cheap', 'sorting/03-write-nulls-first'])
    expect(findings('1', 'filtering')[0]!.message).toBe('solution has bigram Jaccard 1.00 with the sql block at lesson.zh.md:9')
    expect(findings('1', 'sorting')[0]!.message).toContain('step 2 of the steps block at lesson.zh.md:21')
  })

  it('2: measures the code in the legacy hint and in every level of hints', () => {
    // 03 has a legacy `hint`, 04 gives the fix away in its second `hints` level.
    expect(where('2')).toEqual(['filtering/02-write-cheap', 'sorting/03-write-nulls-first', 'sorting/04-debug-missing-by'])
    expect(messages('2', 'sorting')).toEqual([
      "hint code shows 5 of the solution's 7 identifiers",
      "hint code shows 4 of the solution's 6 identifiers",
    ])
  })

  it('3: finds the answer in either language of a predict prompt', () => {
    // filtering's English prompt spells the number out; its Chinese one does not.
    expect(where('3')).toEqual(['filtering/01-predict-cheap', 'sorting/01-predict-limit'])
  })

  it('4: needs explain everywhere and why on every choice, in any choice form', () => {
    expect(where('4')).toEqual(['filtering/01-predict-cheap', 'filtering/02-write-cheap', 'sorting/01-predict-limit', 'sorting/03-write-nulls-first'])
    expect(messages('4', 'sorting')).toEqual(['2 of 2 choices have no why', 'no explain'])
  })

  it('5, 5b: flags introduced words that exercises never use, except reference words', () => {
    expect(messages('5', 'sorting')).toEqual(['OFFSET appears in no exercise', 'LAST appears in no exercise', 'ROWS appears in no exercise'])
    expect(messages('5', 'filtering')).toEqual(['AND appears in no exercise'])
    expect(messages('5b', 'sorting')).toEqual(['ASC appears in no write exercise', 'DESC appears in no write exercise', 'LIMIT appears in no write exercise'])
    // ROLLUP (grouping) and FETCH (sorting) are in `reference`, so unused is fine.
    expect(report.findings.some(f => /^(ROLLUP|FETCH) /.test(f.message))).toBe(false)
  })

  it('6: flags an objective with fewer than two exercises or no write exercise', () => {
    expect(messages('6', 'sorting')).toEqual(['objective page-rows has 1 exercise(s), none of them write'])
    expect(findings('6')).toHaveLength(1)
  })

  it('7: compares numbered mistakes with traps and debug exercises', () => {
    expect(messages('7', 'sorting')).toEqual(['3 numbered mistakes, but 0 trap(s) and 1 debug exercise(s)'])
    expect(findings('7')).toHaveLength(1) // filtering: 1 mistake, 1 debug exercise
  })

  it('8: counts the introduced words outside reference', () => {
    expect(messages('8', 'sorting')).toEqual(['introduces 9 words outside reference: ORDER ASC DESC LIMIT OFFSET NULLS FIRST LAST ROWS'])
    expect(findings('8')).toHaveLength(1)
  })

  it('9: compares deeper with core in zh prose, without fenced blocks', () => {
    // sorting's core has little prose but a long check block, which must not count.
    expect(where('9')).toEqual(['filtering/', 'sorting/'])
    expect(messages('9', 'sorting')[0]).toMatch(/core 11 /)
  })

  it('10: flags forward references, but not chapters already behind the lesson', () => {
    expect(messages('10', 'filtering')).toEqual(['"第 1 章" at lesson.zh.md:13 (core)', '"Chapter 1" at lesson.en.md:13 (core)'])
    expect(messages('10', 'sorting')).toEqual(['"下一篇" at lesson.zh.md:32 (deeper)', '"next lesson" at lesson.en.md:32 (deeper)'])
  })

  it('11: flags other databases outside deeper and reference', () => {
    // grouping names MySQL in deeper and SQLite in reference.
    expect(messages('11', 'sorting')).toEqual(['MySQL at lesson.zh.md:7 (core)', 'MySQL at lesson.en.md:7 (core)'])
    expect(where('11')).toEqual(['filtering/', 'filtering/', 'sorting/', 'sorting/'])
  })

  it('12: flags lessons whose predicts mostly ask for a row count', () => {
    expect(messages('12', 'sorting')).toEqual(['2 of 2 predicts ask for a row count'])
  })

  it('13, 13b: counts check and steps blocks', () => {
    expect(messages('13', 'filtering')).toEqual(['0 check block(s), needs 2'])
    expect(messages('13', 'sorting')).toEqual(['1 check block(s), needs 2'])
    expect(where('13b')).toEqual(['filtering/'])
  })

  it('14: flags lessons with traps on under half of their write and debug exercises', () => {
    expect(messages('14', 'sorting')).toEqual(['traps on 0 of 2 write and debug exercises'])
  })
})

describe('audit command line', () => {
  const run = async (...args: string[]) => {
    const out: string[] = []
    const code = await runCli(args, root, text => out.push(text))
    return { code, out: out.join('\n') }
  }

  it('exits 0 by default and prints findings by lesson, then counts per rule', async () => {
    const { code, out } = await run()
    expect(code).toBe(0)
    expect(out).toMatch(/^filtering {2}\(legacy/)
    expect(out).toMatch(/^1\s+error\s+2\s+2\s+write solution close to lesson SQL$/m)
  })

  it('--strict exits 1 when a template-2 lesson has an error, and lists only errors', async () => {
    const { code, out } = await run('--strict')
    expect(code).toBe(1)
    expect(out).toContain('sorting')
    expect(out).not.toContain('filtering')
    expect(out).not.toMatch(/^\s+warning/m)
  })

  it('--strict exits 0 for a clean template-2 lesson and for a legacy lesson full of warnings', async () => {
    expect((await run('--strict', '--lesson', 'grouping')).code).toBe(0)
    const legacy = await run('--strict', '--lesson', 'filtering')
    expect(legacy.code).toBe(0)
    expect(legacy.out).toContain('no errors in template-2 lessons (15 warning(s)')
  })

  it('--json prints the report, and --strict still sets the exit code', async () => {
    const { code, out } = await run('--json', '--strict', '--lesson', 'sorting')
    expect(code).toBe(1)
    const json = JSON.parse(out)
    expect(json.findings).toEqual(report.findings.filter(f => f.lesson === 'sorting'))
    expect(json.summary).toHaveLength(RULES.length)
  })

  it('rejects an unknown lesson or flag', async () => {
    expect((await run('--lesson', 'nope')).code).toBe(2)
    expect((await run('--verbose')).code).toBe(2)
  })
})

describe('audit helpers', () => {
  it('scanMarkdown splits sections and keeps fenced blocks out of the prose', () => {
    const sections = scanMarkdown([
      'before any section',
      '## A {#why}',
      'text',
      '```check',
      'query: |',
      '  SELECT 1;',
      '## not a heading',
      '```',
      '- item',
      '  ~~~steps',
      '  - sql: SELECT 2;',
      '  ~~~',
      '## B {#core}',
      '````sql run',
      '```',
      '````',
    ].join('\n'))
    expect(sections.map(s => s.id)).toEqual(['why', 'core'])
    expect(sections[0]!.prose.map(p => p.text)).toEqual(['text', '- item'])
    expect(sections[0]!.fences).toEqual([
      { kind: 'check', body: 'query: |\n  SELECT 1;\n## not a heading', line: 4 },
      { kind: 'steps', body: '- sql: SELECT 2;', line: 10 },
    ])
    expect(sections[1]!.fences).toEqual([{ kind: 'sql', body: '```', line: 14 }])
  })

  it('similarity ignores case, comments and string constants', () => {
    expect(similarity("SELECT name FROM items WHERE category = 'office';", "select name from items -- the furniture\nwhere category = 'furniture';")).toBe(1)
    expect(similarity('SELECT name FROM items;', 'DELETE FROM orders WHERE id = 1;')).toBeLessThan(0.2)
  })
})
