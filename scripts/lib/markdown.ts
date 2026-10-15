import MarkdownIt, { type Token } from 'markdown-it'
import type { Lang, Section, Term } from '../../src/content/types.ts'
import { highlightSql } from '../../src/content/highlight.ts'

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

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]!
    const info = token.info.trim().split(/\s+/)
    const code = token.content.replace(/\n$/, '')
    const lang = info[0] ?? ''
    if (lang === 'sql') {
      const pre = `<pre class="sql-static"><code>${highlightSql(code)}</code></pre>`
      if (info.includes('run')) {
        const expect = info.includes('error') ? ' data-expect-error="1"' : ''
        return `<div class="sql-run" data-sql="${escapeHtml(code)}"${expect}>${pre}</div>\n`
      }
      return pre + '\n'
    }
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

/** Rendered inline HTML → plain text, e.g. a title for document.title or a breadcrumb. */
export function toPlainText(html: string): string {
  return html.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
}

/** One line of inline Markdown, e.g. a multiple-choice option. */
export function renderInlineText(src: string, env: RenderEnv): string {
  return md.renderInline(src, { ...env, seen: new Set<string>() })
}
