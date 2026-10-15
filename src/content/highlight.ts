// Minimal SQL highlighting for static snippets, done at build time so lesson
// pages need no editor until the learner clicks into a runnable example.

const KEYWORDS = new Set(`
  select from where and or not in is null as on join inner left right full outer cross natural using
  group by having order asc desc nulls first last limit offset fetch next rows only distinct all any some
  union intersect except case when then else end exists between like ilike similar to
  insert into values update set delete returning default create table drop alter add column constraint
  primary key foreign references unique check index view with recursive over partition window range
  begin commit rollback transaction true false cast filter lateral conflict do nothing
`.trim().split(/\s+/))

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

const TOKEN = /(--[^\n]*)|('(?:[^']|'')*'?)|("(?:[^"]|"")*"?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|([\s\S])/g

export function highlightSql(code: string): string {
  let out = ''
  for (const m of code.matchAll(TOKEN)) {
    const [text, comment, str, ident, num, word] = m
    if (comment) out += `<span class="tk-comment">${esc(text)}</span>`
    else if (str) out += `<span class="tk-string">${esc(text)}</span>`
    else if (ident) out += esc(text)
    else if (num) out += `<span class="tk-number">${text}</span>`
    else if (word && KEYWORDS.has(word.toLowerCase())) out += `<span class="tk-keyword">${esc(text)}</span>`
    else if (word && /^[a-z_]+$/i.test(word) && /\(/.test(code.slice((m.index ?? 0) + word.length, (m.index ?? 0) + word.length + 1))) out += `<span class="tk-fn">${esc(text)}</span>`
    else out += esc(text)
  }
  return out
}

// Syntax blocks (```syntax) describe the shape of a statement, in the
// notation of the PostgreSQL manual:
//   UPPERCASE      a keyword, written as shown
//   lowercase      a placeholder the learner replaces with their own
//   name(          a function name, written as shown (lower case, no space before the parenthesis)
//   [ … ]          optional
//   { a | b }      exactly one of the alternatives
//   [, …]          the item before it may repeat, comma-separated
// Anything else (parentheses, commas, *, ||, operators) is written literally.
const SYNTAX_TOKEN = /(\|\|)|([[\]{}|]|…|\.\.\.)|([A-Z][A-Z_]*\b)|([a-z_][a-z0-9_]*(?=\())|([a-z_][a-z0-9_]*)|([\s\S])/g

export function highlightSyntax(code: string): string {
  let out = ''
  for (const m of code.matchAll(SYNTAX_TOKEN)) {
    const [text, concat, meta, keyword, fn, placeholder] = m
    if (concat) out += esc(text)
    else if (meta) out += `<span class="syn-meta">${esc(text)}</span>`
    else if (keyword) out += `<span class="tk-keyword">${esc(text)}</span>`
    else if (fn) out += `<span class="tk-fn">${esc(text)}</span>`
    else if (placeholder) out += `<span class="syn-ph">${esc(text)}</span>`
    else out += esc(text)
  }
  return out
}
