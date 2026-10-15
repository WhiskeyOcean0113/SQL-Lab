import { esc } from '../i18n/index.ts'

// Tiny templating: `html` escapes every interpolated value unless it is
// wrapped in `raw()` (trusted, e.g. build-time rendered lesson HTML).

const RAW = Symbol('raw')
export interface Raw { [RAW]: true; value: string }
export const raw = (value: string): Raw => ({ [RAW]: true, value })
const isRaw = (v: unknown): v is Raw => typeof v === 'object' && v !== null && RAW in v

type Value = string | number | boolean | null | undefined | Raw | Value[]

function render(v: Value): string {
  if (v === null || v === undefined || v === false || v === true) return ''
  if (Array.isArray(v)) return v.map(render).join('')
  if (isRaw(v)) return v.value
  return esc(String(v))
}

export function html(strings: TemplateStringsArray, ...values: Value[]): Raw {
  let out = strings[0] ?? ''
  values.forEach((v, i) => { out += render(v) + (strings[i + 1] ?? '') })
  return raw(out)
}

export function mount(root: Element, content: Raw) {
  root.innerHTML = content.value
}

export function $<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T {
  const el = root.querySelector<T>(sel)
  if (!el) throw new Error(`Missing element ${sel}`)
  return el
}

export function $$<T extends Element = HTMLElement>(sel: string, root: ParentNode = document): T[] {
  return [...root.querySelectorAll<T>(sel)]
}

export const pad2 = (n: number) => String(n).padStart(2, '0')
