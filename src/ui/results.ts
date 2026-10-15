import type { Lang } from '../content/types.ts'
import type { Cell, Grade, Issue, ResultSet, RunOutcome, SqlError } from '../engine/types.ts'
import { strings } from '../i18n/strings.ts'
import { t, type StringKey } from '../i18n/index.ts'
import { html, raw, type Raw } from './dom.ts'

const NUMERIC = new Set([20, 21, 23, 26, 700, 701, 1700])
const DIFF_LIMIT = 60

function cell(v: Cell, numeric: boolean): Raw {
  if (v === null) return html`<td class="null${numeric ? ' r' : ''}">NULL</td>`
  const text = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v)
  return numeric ? html`<td class="r">${text}</td>` : html`<td>${text}</td>`
}

function head(rs: ResultSet, lead = false): Raw {
  return html`<thead><tr>${lead ? raw('<th></th>') : ''}${rs.columns.map(c => NUMERIC.has(c.type) ? html`<th class="r">${c.name}</th>` : html`<th>${c.name}</th>`)}</tr></thead>`
}

export function resultTable(rs: ResultSet): Raw {
  const numeric = rs.columns.map(c => NUMERIC.has(c.type))
  return html`<table class="grid">${head(rs)}<tbody>${rs.rows.map(r => html`<tr>${r.map((v, i) => cell(v, numeric[i]!))}</tr>`)}</tbody></table>`
}

export function errorBlock(err: SqlError, sql: string, lang: Lang): Raw {
  const key = `error.${err.code}` as StringKey
  const friendly = err.code && key in strings[lang] ? t(lang, key) : t(lang, 'error.generic')
  let where = ''
  if (err.position) {
    const before = sql.slice(0, err.position - 1)
    const line = before.split('\n').length
    const col = err.position - before.lastIndexOf('\n') - 1
    where = t(lang, 'error.position', { line, col })
  }
  const showRaw = !err.code?.startsWith('SQLLAB')
  return html`<div class="sql-err" role="alert"><div class="friendly">${raw(friendly)}</div>${showRaw ? html`<div class="raw">${err.message}${where ? raw(` · ${where}`) : ''}${err.detail ? html`<br>DETAIL: ${err.detail}` : ''}${err.hint ? html`<br>HINT: ${err.hint}` : ''}</div>` : ''}</div>`
}

/** What a Run shows: the error, or the last statement's result. */
export function runOutput(out: RunOutcome, sql: string, lang: Lang): Raw {
  if (!out.ok && out.error) return errorBlock(out.error, sql, lang)
  const last = [...out.results].reverse().find(r => r.columns.length > 0)
  const ms = `${Math.max(1, Math.round(out.ms))} ms`
  if (!last) {
    const affected = out.results.reduce((n, r) => n + r.affectedRows, 0)
    return html`<div class="out-meta">${raw(affected ? t(lang, 'runner.affected', { n: affected }) : t(lang, 'runner.ok'))} · ${ms}</div>`
  }
  const meta = [t(lang, 'runner.rows', { n: last.rows.length }), ms, last.truncated ? t(lang, 'runner.truncated', { n: last.rows.length }) : ''].filter(Boolean).join(' · ')
  if (!last.rows.length) return html`<div class="out-meta">${raw(t(lang, 'runner.noRows'))} · ${ms}</div>${resultTable(last)}`
  return html`<div class="out-meta">${raw(meta)}</div><div class="out-scroll">${resultTable(last)}</div>`
}

export function issueText(issue: Issue, lang: Lang): string {
  return t(lang, `issue.${issue.code}` as StringKey, issue.data ?? {})
}

type DiffRow = { kind: 'same' | 'missing' | 'extra'; row: Cell[] }

/**
 * Interleave expected and actual rows like a proofread page: rows in expected
 * order, with each extra row placed just before the expected row that shares
 * its first value (usually the key), and the rest at the end.
 */
function diffRows(g: Grade): DiffRow[] {
  const expected = g.expected!.rows
  const actual = g.actual!.rows
  const missing = new Set(g.missing)
  const extrasByKey = new Map<string, Cell[][]>()
  const loose: Cell[][] = []
  const expectedKeys = new Set(expected.map(r => String(r[0])))
  for (const i of g.extra) {
    const row = actual[i]!
    const k = String(row[0])
    if (expectedKeys.has(k)) extrasByKey.set(k, [...(extrasByKey.get(k) ?? []), row])
    else loose.push(row)
  }
  const out: DiffRow[] = []
  expected.forEach((row, i) => {
    const k = String(row[0])
    const extras = extrasByKey.get(k)
    if (extras) { extras.forEach(r => out.push({ kind: 'extra', row: r })); extrasByKey.delete(k) }
    out.push({ kind: missing.has(i) ? 'missing' : 'same', row })
  })
  loose.forEach(r => out.push({ kind: 'extra', row: r }))
  return out
}

function diffTable(g: Grade, lang: Lang): Raw {
  const rs = g.expected!
  const numeric = rs.columns.map(c => NUMERIC.has(c.type))
  const rows = diffRows(g)
  const shown = rows.slice(0, DIFF_LIMIT)
  const mark = (k: DiffRow['kind']) => k === 'same' ? '' : t(lang, k === 'missing' ? 'verdict.missing' : 'verdict.extra')
  return html`
    <div class="legend"><span><i class="lg-missing"></i>${raw(t(lang, 'verdict.legend.missing'))}</span><span><i class="lg-extra"></i>${raw(t(lang, 'verdict.legend.extra'))}</span></div>
    <div class="diff">
      <table class="grid">${head(rs, true)}<tbody>${shown.map(d => html`<tr class="${d.kind}"><td class="mark">${raw(mark(d.kind))}</td>${d.row.map((v, i) => cell(v, numeric[i] ?? false))}</tr>`)}</tbody></table>
      ${rows.length > DIFF_LIMIT ? html`<div class="more">${raw(t(lang, 'verdict.more', { n: rows.length - DIFF_LIMIT }))}</div>` : ''}
    </div>`
}

/** The body of a failed query verdict: what went wrong, then the evidence. */
export function failureBody(g: Grade, learnerSql: string, lang: Lang): Raw {
  if (g.error) return html`<div class="why">${errorBlock(g.error, learnerSql, lang)}</div>`
  const messages = g.issues.filter(i => i.code !== 'rows-differ' || g.issues.length === 1)
  const why = html`<div class="why">${messages.map(i => html`<p>${raw(issueText(i, lang))}</p>`)}</div>`
  if (!g.expected || !g.actual) return why
  const structural = g.issues.some(i => i.code === 'column-count' || i.code === 'column-order')
  if (structural || g.issues.some(i => i.code === 'order')) {
    return html`${why}<div class="side-by-side">
      <div><h4>${raw(t(lang, 'verdict.expected'))}</h4><div class="out-scroll">${resultTable(clip(g.expected))}</div></div>
      <div><h4>${raw(t(lang, 'verdict.yours'))}</h4><div class="out-scroll">${resultTable(clip(g.actual))}</div></div>
    </div>`
  }
  return html`${why}${diffTable(g, lang)}`
}

function clip(rs: ResultSet): ResultSet {
  return { ...rs, rows: rs.rows.slice(0, DIFF_LIMIT) }
}
