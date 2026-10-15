import type { Lang, Term } from '../content/types.ts'
import { strings, type StringKey } from './strings.ts'

// Both languages must define every key.
const _complete: Record<StringKey, string> = strings.en
void _complete

let glossary = new Map<string, Term>()
export function setGlossary(terms: Term[]) {
  glossary = new Map(terms.map(t => [t.id, t]))
}

export function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** Same markup the build-time renderer produces, so lesson CSS applies to UI text too. */
export function termHtml(id: string, lang: Lang, display?: string): string {
  const term = glossary.get(id)
  if (!term) return esc(display ?? id.replace(/-/g, ' '))
  const other: Lang = lang === 'zh' ? 'en' : 'zh'
  return `<dfn class="term" data-term="${id}" title="${esc(term[other])}">${esc(display ?? term[lang])}<span class="term-alt" lang="${other === 'zh' ? 'zh-Hans' : 'en'}"> (${esc(term[other])})</span></dfn>`
}

/** Same markup as lessons: {{term:id}}, {{Term:id}} (capitalised), {{term:id|display text}}. */
const TERM = /\{\{([Tt]erm):([a-z0-9-]+)(?:\|([^}]+))?\}\}/g

function primary(id: string, lang: Lang, kind: string, display?: string): string {
  const text = display ?? glossary.get(id)?.[lang] ?? id
  return kind === 'Term' ? text.charAt(0).toUpperCase() + text.slice(1) : text
}

/** A UI string as HTML. Variables are escaped; terms are expanded. */
export function t(lang: Lang, key: StringKey, vars: Record<string, string | number> = {}): string {
  const template: string = strings[lang][key] ?? key
  return template
    .replace(TERM, (_, kind: string, id: string, display?: string) => termHtml(id, lang, primary(id, lang, kind, display)))
    .replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? esc(String(vars[name])) : m))
}

/** A UI string as plain text, for attributes and document.title. */
export function tText(lang: Lang, key: StringKey, vars: Record<string, string | number> = {}): string {
  const template: string = strings[lang][key] ?? key
  return template
    .replace(/<br>/g, ' ')
    .replace(TERM, (_, kind: string, id: string, display?: string) => primary(id, lang, kind, display))
    .replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

export type { StringKey }
