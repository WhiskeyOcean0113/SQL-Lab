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
export function termHtml(id: string, lang: Lang): string {
  const term = glossary.get(id)
  if (!term) return esc(id.replace(/-/g, ' '))
  const other: Lang = lang === 'zh' ? 'en' : 'zh'
  return `<dfn class="term" data-term="${id}" title="${esc(term[other])}">${esc(term[lang])}<span class="term-alt" lang="${other === 'zh' ? 'zh-Hans' : 'en'}"> (${esc(term[other])})</span></dfn>`
}

/** A UI string as HTML. Variables are escaped; terms are expanded. */
export function t(lang: Lang, key: StringKey, vars: Record<string, string | number> = {}): string {
  const template: string = strings[lang][key] ?? key
  return template
    .replace(/\{\{term:([a-z0-9-]+)\}\}/g, (_, id: string) => termHtml(id, lang))
    .replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? esc(String(vars[name])) : m))
}

/** A UI string as plain text, for attributes and document.title. */
export function tText(lang: Lang, key: StringKey, vars: Record<string, string | number> = {}): string {
  const template: string = strings[lang][key] ?? key
  return template
    .replace(/<br>/g, ' ')
    .replace(/\{\{term:([a-z0-9-]+)\}\}/g, (_, id: string) => glossary.get(id)?.[lang] ?? id)
    .replace(/\{(\w+)\}/g, (m, name: string) => (name in vars ? String(vars[name]) : m))
}

export type { StringKey }
