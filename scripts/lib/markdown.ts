import MarkdownIt, { type Token } from 'markdown-it'
import { parse as parseYaml } from 'yaml'
import type { Lang, Section, Term } from '../../src/content/types.ts'
import { highlightSql, highlightSyntax } from '../../src/content/highlight.ts'

// Lesson Markdown → HTML, at build time.
//
// Extensions over CommonMark:
//   ## Heading {#id}        section id (required on every h2)
//   {{term:inner-join}}     glossary term, expanded per language
//   {{Term:inner-join}}     same, first letter capitalised
//   {{term:row|rows}}       same, with display text overriding the primary-language form
//   ```sql run              an editable, runnable example
//   ```sql run error        the same, but it is meant to fail (validate checks that it does)
//   ```sql                  a static, highlighted snippet
//   ```syntax               a syntax template in the manual's notation (see highlightSyntax)
//   ```check                an inline checkpoint: YAML with query, question, choices, answer, explain
//   ```steps                a step-through of intermediate results: a YAML list of { sql, say, group? }
//
// `check` and `steps` render to placeholders that src/ui/check.ts and
// src/ui/steps.ts hydrate, the way `sql run` blocks become runners.

export type RenderEnv = {
  lang: Lang
  glossary: Map<string, Term>
  problems: string[]
  /** Terms already annotated in the current section. */
  seen?: Set<string>
  /** Headings and other places where only the primary-language form fits. */
  plain?: boolean
}

const TERM_RE = /^\{\{([Tt]erm):([a-z0-9-]+)(?:\|([^}]+))?\}\}/

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

export function createMarkdown() {
  const md = new MarkdownIt({ html: false, linkify: false, typographer: false })

  md.inline.ruler.before('emphasis', 'term', (state, silent) => {
    if (state.src.charCodeAt(state.pos) !== 0x7b /* { */) return false
    const m = TERM_RE.exec(state.src.slice(state.pos))
    if (!m) return false
    if (!silent) {
      const token = state.push('term', '', 0)
      token.meta = { id: m[2], cap: m[1] === 'Term', display: m[3] }
    }
    state.pos += m[0].length
    return true
  })

  md.renderer.rules.term = (tokens, idx, _opts, rawEnv) => {
    const env = rawEnv as RenderEnv
    const { id, cap, display } = tokens[idx]!.meta as { id: string; cap: boolean; display?: string }
    const term = env.glossary.get(id)
    if (!term) {
      env.problems.push(`unknown term "${id}"`)
      return `<mark class="term-missing">${escapeHtml(id)}</mark>`
    }
    const other: Lang = env.lang === 'zh' ? 'en' : 'zh'
    let primary = display ?? term[env.lang]
    if (cap) primary = capitalise(primary)
    if (env.plain) return escapeHtml(primary)
    const first = !env.seen?.has(id)
    env.seen?.add(id)
    const cls = first ? 'term' : 'term term-repeat'
    return `<dfn class="${cls}" data-term="${id}" title="${escapeHtml(term[other])}">${escapeHtml(primary)}<span class="term-alt" lang="${other === 'zh' ? 'zh-Hans' : 'en'}"> (${escapeHtml(term[other])})</span></dfn>`
  }

  md.renderer.rules.fence = (tokens, idx, _opts, rawEnv) => {
    const token = tokens[idx]!
    const info = token.info.trim().split(/\s+/)
    const code = token.content.replace(/\n$/, '')
    const lang = info[0] ?? ''
    if (lang === 'check' || lang === 'steps') {
      const env = (rawEnv ?? {}) as Partial<RenderEnv>
      const line = (token.map?.[0] ?? 0) + 1
      const report = (problems: string[]) => problems.forEach(p => env.problems?.push(`${lang} block at line ${line}: ${p}`))
      if (lang === 'check') {
        const { block, problems } = parseCheck(token.content)
        report(problems)
        if (block) return renderCheck(md, block, env)
      } else {
        const { steps, problems } = parseSteps(token.content)
        report(problems)
        if (steps?.length) return renderSteps(md, steps, env)
      }
      return `<pre><code>${escapeHtml(code)}</code></pre>\n`
    }
    if (lang === 'sql') {
      const pre = `<pre class="sql-static"><code>${highlightSql(code)}</code></pre>`
      if (info.includes('run')) {
        const expect = info.includes('error') ? ' data-expect-error="1"' : ''
        return `<div class="sql-run" data-sql="${escapeHtml(code)}"${expect}>${pre}</div>\n`
      }
      return pre + '\n'
    }
    if (lang === 'syntax') return `<pre class="syntax"><code>${highlightSyntax(code)}</code></pre>\n`
    return `<pre><code>${escapeHtml(code)}</code></pre>\n`
  }

  // Tables scroll on narrow screens instead of widening the page.
  md.renderer.rules.table_open = () => '<div class="table-scroll"><table>'
  md.renderer.rules.table_close = () => '</table></div>'

  return md
}

const md = createMarkdown()

/** Render a whole lesson body into its `##` sections. */
export function renderSections(src: string, env: RenderEnv): Section[] {
  const tokens = md.parse(src, env)
  const sections: Section[] = []
  let current: { id: string; heading: string; tokens: Token[] } | undefined

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!
    if (t.type === 'heading_open' && t.tag === 'h2') {
      if (current) sections.push(finish(current, env))
      const inline = tokens[i + 1]!
      const m = /\s*\{#([a-z0-9-]+)\}\s*$/.exec(inline.content)
      if (!m) env.problems.push(`heading "${inline.content}" has no {#id}`)
      stripTrailingId(inline)
      const heading = md.renderer.renderInline(inline.children ?? [], md.options, { ...env, plain: true })
      current = { id: m?.[1] ?? `section-${sections.length}`, heading, tokens: [] }
      i += 2 // skip inline + heading_close
      continue
    }
    if (t.type === 'heading_open' && t.tag === 'h1') {
      env.problems.push('lessons must not contain an h1; the title comes from meta.yaml')
    }
    if (!current) {
      if (t.type !== 'inline' || t.content.trim()) env.problems.push('content before the first ## section')
      continue
    }
    current.tokens.push(t)
  }
  if (current) sections.push(finish(current, env))
  return sections
}

function stripTrailingId(inline: Token) {
  inline.content = inline.content.replace(/\s*\{#[a-z0-9-]+\}\s*$/, '')
  const last = inline.children?.[inline.children.length - 1]
  if (last?.type === 'text') last.content = last.content.replace(/\s*\{#[a-z0-9-]+\}\s*$/, '')
}

function finish(s: { id: string; heading: string; tokens: Token[] }, env: RenderEnv): Section {
  const html = md.renderer.render(s.tokens, md.options, { ...env, seen: new Set<string>() })
  return { id: s.id, heading: s.heading, html }
}

/** Short text such as an exercise prompt: block Markdown, terms annotated once. */
export function renderSnippet(src: string, env: RenderEnv): string {
  return md.render(src, { ...env, seen: new Set<string>() })
}

export interface RunnableBlock { sql: string; expectError: boolean }

/** The `sql run` blocks of a lesson body, in order. Both languages must have the same list. */
export function runnableBlocks(src: string): RunnableBlock[] {
  return md.parse(src, {})
    .filter(t => t.type === 'fence' && /^sql\s+run\b/.test(t.info.trim()))
    .map(t => ({ sql: t.content.trim(), expectError: /\berror\b/.test(t.info) }))
}

/** The ```syntax blocks of a lesson body, in order. Like `sql run` blocks, they are code and identical in both languages. */
export function syntaxBlocks(src: string): string[] {
  return md.parse(src, {})
    .filter(t => t.type === 'fence' && t.info.trim() === 'syntax')
    .map(t => t.content.trim())
}

/** Every code block a lesson shows as SQL: ```sql (runnable or static) and ```syntax, in order. */
export function sqlBlocks(src: string): string[] {
  return md.parse(src, {})
    .filter(t => t.type === 'fence' && /^(sql|syntax)\b/.test(t.info.trim()))
    .map(t => t.content.trim())
}

/* ---------- ```check and ```steps ---------- */

/** One ```check block. Text fields are Markdown in the file's language. */
export interface CheckBlock {
  query: string
  question: string
  choices: string[]
  /** 0-based index into `choices`; -1 when the source has none. */
  answer: number
  explain: string
  /** Row count `query` must return, checked by validate. */
  verifyRows?: number
}

/** One step of a ```steps block. `say` is Markdown in the file's language. */
export interface Step {
  sql: string
  say: string
  /** A column of the step's result: rows are tinted by its value. */
  group?: string
}

export const STEPS_MIN = 2
export const STEPS_MAX = 8
const CHECK_FIELDS = ['query', 'question', 'choices', 'answer', 'explain', 'verify']
const STEP_FIELDS = ['sql', 'say', 'group']

type Md = ReturnType<typeof createMarkdown>
type Fields = Record<string, unknown>
const isMap = (v: unknown): v is Fields => typeof v === 'object' && v !== null && !Array.isArray(v)
/** A scalar as text: YAML turns `5` into a number and `yes` into a boolean. */
const text = (v: unknown) => (typeof v === 'string' ? v.trim() : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '')
const unknownFields = (v: Fields, allowed: string[]) => Object.keys(v).filter(k => !allowed.includes(k))

function loadYaml(src: string): { value?: unknown; error?: string } {
  try {
    return { value: parseYaml(src) as unknown }
  } catch (e) {
    return { error: (e instanceof Error ? e.message : String(e)).split('\n')[0]!.replace(/:$/, '') }
  }
}

/** Parse a ```check body. Problems are collected; `block` is set whenever there is a query to show. */
export function parseCheck(src: string): { block?: CheckBlock; problems: string[] } {
  const { value, error } = loadYaml(src)
  if (error) return { problems: [`invalid YAML: ${error}`] }
  if (!isMap(value)) return { problems: ['must be a YAML mapping with query, question, choices, answer and explain'] }
  const problems: string[] = []
  const extra = unknownFields(value, CHECK_FIELDS)
  if (extra.length) problems.push(`unknown field ${extra.map(k => `"${k}"`).join(', ')}`)
  const query = typeof value.query === 'string' ? value.query.trim() : ''
  const question = text(value.question)
  const explain = text(value.explain)
  if (!query) problems.push('missing "query"')
  if (!question) problems.push('missing "question"')
  if (!explain) problems.push('missing "explain"')
  const choices = Array.isArray(value.choices) ? value.choices.map(text) : []
  if (choices.length < 2) problems.push('"choices" needs a list of at least two items')
  else if (choices.some(c => !c)) problems.push('every choice must be a non-empty string')
  const answer = typeof value.answer === 'number' && Number.isInteger(value.answer) ? value.answer : -1
  if (answer < 0 || answer >= choices.length) {
    problems.push(`"answer" must be a 0-based index into choices (0 to ${Math.max(choices.length - 1, 0)}), got ${JSON.stringify(value.answer ?? null)}`)
  }
  let verifyRows: number | undefined
  if (value.verify !== undefined) {
    const v = value.verify
    if (isMap(v) && !unknownFields(v, ['rows']).length && typeof v.rows === 'number' && Number.isInteger(v.rows) && v.rows >= 0) verifyRows = v.rows
    else problems.push('"verify" must be { rows: N }')
  }
  return { block: query ? { query, question, choices, answer, explain, verifyRows } : undefined, problems }
}

/** Parse a ```steps body: a list of 2–8 steps. Every step is kept, so indexes match the source. */
export function parseSteps(src: string): { steps?: Step[]; problems: string[] } {
  const { value, error } = loadYaml(src)
  if (error) return { problems: [`invalid YAML: ${error}`] }
  if (!Array.isArray(value)) return { problems: ['must be a YAML list of steps, each with sql and say'] }
  const problems: string[] = []
  if (value.length < STEPS_MIN || value.length > STEPS_MAX) problems.push(`needs ${STEPS_MIN} to ${STEPS_MAX} steps, has ${value.length}`)
  const steps = value.map((s: unknown, i): Step => {
    const at = (p: string) => problems.push(`step ${i + 1}: ${p}`)
    if (!isMap(s)) { at('must be a mapping with sql and say'); return { sql: '', say: '' } }
    const extra = unknownFields(s, STEP_FIELDS)
    if (extra.length) at(`unknown field ${extra.map(k => `"${k}"`).join(', ')}`)
    const sql = typeof s.sql === 'string' ? s.sql.trim() : ''
    const say = text(s.say)
    if (!sql) at('missing "sql"')
    if (!say) at('missing "say"')
    let group: string | undefined
    if (s.group !== undefined) {
      if (typeof s.group === 'string' && s.group.trim()) group = s.group.trim()
      else at('"group" must be a column name')
    }
    return group ? { sql, say, group } : { sql, say }
  })
  return { steps, problems }
}

/**
 * The checkpoint as the page shows it before hydration: the query, the
 * question and the choices. Question and choices are part of the section's
 * text, so they share its first-use term annotation; the explanation is hidden
 * until the learner checks, so it annotates on its own copy.
 */
function renderCheck(md: Md, c: CheckBlock, env: Partial<RenderEnv>): string {
  const later = { ...env, seen: new Set(env.seen) }
  return `<div class="checkpoint" data-sql="${escapeHtml(c.query)}" data-answer="${c.answer}">`
    + `<pre class="sql-static"><code>${highlightSql(c.query)}</code></pre>`
    + `<div class="cp-q">${md.render(c.question, env)}</div>`
    + `<ol class="cp-choices">${c.choices.map(ch => `<li>${md.renderInline(ch, env)}</li>`).join('')}</ol>`
    + `<div class="cp-explain" hidden>${md.render(c.explain, later)}</div>`
    + '</div>\n'
}

/** Every step, in order; the page shows one at a time. Captions annotate terms on their own copy. */
function renderSteps(md: Md, steps: Step[], env: Partial<RenderEnv>): string {
  const later = { ...env, seen: new Set(env.seen) }
  const items = steps.map(s => `<li class="st-step" data-sql="${escapeHtml(s.sql)}"${s.group ? ` data-group="${escapeHtml(s.group)}"` : ''}>`
    + `<div class="st-say">${md.render(s.say, later)}</div>`
    + `<pre class="sql-static"><code>${highlightSql(s.sql)}</code></pre></li>`)
  return `<div class="stepper"><ol class="st-list">${items.join('')}</ol></div>\n`
}

function fences(src: string, info: string): Token[] {
  return md.parse(src, {}).filter(t => t.type === 'fence' && t.info.trim() === info)
}

/** The well-formed ```check blocks of a lesson body, in order. Query, answer, choice count and verify must match across languages. */
export function checkBlocks(src: string): CheckBlock[] {
  return fences(src, 'check').flatMap(t => parseCheck(t.content).block ?? [])
}

/** The ```steps blocks of a lesson body, in order. Each step's sql and group must match across languages. */
export function stepBlocks(src: string): Step[][] {
  return fences(src, 'steps').map(t => parseSteps(t.content).steps ?? []).filter(s => s.length > 0)
}

/** Rendered inline HTML → plain text, e.g. a title for document.title or a breadcrumb. */
export function toPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/** One line of inline Markdown, e.g. a multiple-choice option. */
export function renderInlineText(src: string, env: RenderEnv): string {
  return md.renderInline(src, { ...env, seen: new Set<string>() })
}
