// A space wherever Chinese meets Latin letters, digits or ASCII brackets and
// backticks: "表 (table) 里", "共 3 行", "叫 shop 的". Applied to rendered HTML, so it
// also spaces across inline tags (a term, inline code), but never inside code,
// never across block boundaries, and never inside attributes.

const CJK = '\u2e80-\u2eff\u2f00-\u2fdf\u3040-\u309f\u30a0-\u30fa\u30fc-\u30ff\u3100-\u312f\u3200-\u32ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff'
const IS_CJK = new RegExp(`[${CJK}]`)
/** Latin characters that take a space when Chinese follows them. */
const LATIN_END = /[A-Za-z0-9%)\]}`$+=]/
/** Latin characters that take a space when Chinese precedes them. */
const LATIN_START = /[A-Za-z0-9(\[{`$@#+=]/
const CJK_THEN_LATIN = new RegExp(`([${CJK}])(?=${LATIN_START.source})`, 'g')
const LATIN_THEN_CJK = new RegExp(`(${LATIN_END.source})(?=[${CJK}])`, 'g')
/** `SELECT(星号)`: a bracket that opens on Chinese also stands apart from the word before it. */
const WORD_THEN_CJK_BRACKET = new RegExp(`([A-Za-z0-9])(?=[(\\[][${CJK}])`, 'g')

/** Text in these is left exactly as written. */
const FROZEN = new Set(['pre', 'code', 'kbd', 'samp', 'textarea', 'script', 'style'])
/** These end a line of text, so no space is carried across them. */
const BLOCK = new Set(['address', 'article', 'aside', 'blockquote', 'br', 'button', 'dd', 'div', 'dl', 'dt', 'figcaption', 'figure', 'footer', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header', 'hr', 'li', 'main', 'nav', 'ol', 'option', 'p', 'pre', 'section', 'select', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'ul'])
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr', 'col', 'source'])

const needsSpace = (a: string, b: string) =>
  (IS_CJK.test(a) && LATIN_START.test(b)) || (LATIN_END.test(a) && IS_CJK.test(b))

/** Plain text, e.g. for document.title. */
export function spaceText(text: string): string {
  return text.replace(CJK_THEN_LATIN, '$1 ').replace(LATIN_THEN_CJK, '$1 ').replace(WORD_THEN_CJK_BRACKET, '$1 ')
}

function decode(s: string): string {
  return s.replace(/&(lt|gt|amp|quot|#39|#x27|nbsp);/g, (_, e: string) =>
    ({ lt: '<', gt: '>', amp: '&', quot: '"', '#39': "'", '#x27': "'", nbsp: '\u00a0' })[e] ?? '')
}

function encode(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

interface Seg { i: number; text: string; frozen: boolean; alt: boolean; changed: boolean }
interface Open { name: string; frozen: boolean; alt: boolean }

export function autospace(html: string): string {
  if (!IS_CJK.test(html)) return html
  const parts = html.split(/(<[^>]*>)/)
  const stack: Open[] = []
  const segs: Seg[] = []
  let prev: Seg | undefined

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]!
    if (!part) continue
    if (part.startsWith('<')) {
      const m = /^<(\/?)([a-zA-Z][a-zA-Z0-9-]*)/.exec(part)
      if (!m) continue
      const name = m[2]!.toLowerCase()
      if (BLOCK.has(name)) prev = undefined
      if (m[1]) {
        const at = stack.map(o => o.name).lastIndexOf(name)
        if (at !== -1) stack.length = at
      } else if (!VOID.has(name) && !part.endsWith('/>')) {
        stack.push({
          name,
          frozen: FROZEN.has(name) || /\btranslate="no"/.test(part),
          // The other-language form of a term is hidden on repeat uses, so a
          // space that belongs to it must live inside it.
          alt: /\bclass="[^"]*\bterm-alt\b/.test(part),
        })
      }
      continue
    }
    const frozen = stack.some(o => o.frozen)
    const seg: Seg = { i, text: decode(part), frozen, alt: stack.some(o => o.alt), changed: false }
    if (!frozen) {
      const spaced = spaceText(seg.text)
      seg.changed = spaced !== seg.text
      seg.text = spaced
    }
    if (prev && needsSpace(prev.text.at(-1)!, seg.text[0]!)) {
      if (prev.alt && !seg.alt && !prev.frozen) { prev.text += ' '; prev.changed = true }
      else if (!seg.frozen && (seg.alt || prev.frozen)) { seg.text = ' ' + seg.text; seg.changed = true }
      else if (!prev.frozen) { prev.text += ' '; prev.changed = true }
    }
    segs.push(seg)
    prev = seg
  }

  for (const s of segs) if (s.changed) parts[s.i] = encode(s.text)
  return parts.join('')
}
