import { autocompletion, closeBrackets, closeCompletion } from '@codemirror/autocomplete'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { HighlightStyle, bracketMatching, syntaxHighlighting } from '@codemirror/language'
import { EditorState, StateEffect, StateField, type Extension } from '@codemirror/state'
import { Decoration, EditorView, highlightActiveLine, highlightActiveLineGutter, keymap, lineNumbers, placeholder, type DecorationSet } from '@codemirror/view'
import { PostgreSQL, sql } from '@codemirror/lang-sql'
import { tags } from '@lezer/highlight'

// One editor setup for runnable examples and exercises. Colours come from the
// same CSS variables as static snippets, so both look identical.

const highlight = HighlightStyle.define([
  { tag: tags.keyword, class: 'tk-keyword' },
  { tag: [tags.string, tags.special(tags.string)], class: 'tk-string' },
  { tag: [tags.number, tags.bool, tags.null], class: 'tk-number' },
  { tag: [tags.lineComment, tags.blockComment], class: 'tk-comment' },
])

// Spacing lives here because CodeMirror's base theme outranks plain CSS.
const layout = EditorView.theme({
  '.cm-content': { padding: '14px 0', fontFamily: 'var(--mono)' },
  '.cm-line': { padding: '0 20px' },
  '.cm-gutters': { backgroundColor: 'transparent', border: 'none' },
  '&.cm-focused': { outline: 'none' },
  '.cm-error-line, .cm-error-line.cm-activeLine': { backgroundColor: 'var(--bad-tint)' },
  '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--accent-tint)', color: 'var(--ink)' },
})

const setErrorLine = StateEffect.define<number | null>()
const errorLine = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(deco, tr) {
    deco = deco.map(tr.changes)
    for (const e of tr.effects) {
      if (e.is(setErrorLine)) {
        if (e.value === null || e.value > tr.state.doc.lines) return Decoration.none
        const line = tr.state.doc.line(e.value)
        return Decoration.set([Decoration.line({ class: 'cm-error-line' }).range(line.from)])
      }
    }
    return tr.docChanged ? Decoration.none : deco
  },
  provide: f => EditorView.decorations.from(f),
})

export interface EditorHandle {
  view: EditorView
  get(): string
  set(text: string): void
  /** Highlight the line containing a 1-based character offset, as Postgres reports errors. */
  markError(position: number | undefined): void
  focus(): void
  closePopups(): void
}

export function createEditor(host: HTMLElement, opts: {
  doc: string
  schema?: Record<string, string[]>
  gutter?: boolean
  placeholder?: string
  onRun?: () => void
  onSubmit?: () => void
  onChange?: (text: string) => void
}): EditorHandle {
  const keys = [
    ...(opts.onSubmit ? [{ key: 'Mod-Shift-Enter', run: (v: EditorView) => (closeCompletion(v), opts.onSubmit!(), true) }] : []),
    ...(opts.onRun ? [{ key: 'Mod-Enter', run: (v: EditorView) => (closeCompletion(v), opts.onRun!(), true) }] : []),
    indentWithTab,
    ...defaultKeymap,
    ...historyKeymap,
  ]
  const extensions: Extension[] = [
    history(),
    closeBrackets(),
    bracketMatching(),
    autocompletion({ icons: false }),
    sql({ dialect: PostgreSQL, schema: opts.schema, upperCaseKeywords: true }),
    syntaxHighlighting(highlight),
    keymap.of(keys),
    errorLine,
    layout,
    EditorView.lineWrapping,
    EditorView.contentAttributes.of({ 'aria-label': 'SQL editor', spellcheck: 'false', autocapitalize: 'off', autocorrect: 'off' }),
  ]
  if (opts.gutter) extensions.push(lineNumbers(), highlightActiveLineGutter(), highlightActiveLine())
  if (opts.placeholder) extensions.push(placeholder(opts.placeholder))
  if (opts.onChange) extensions.push(EditorView.updateListener.of(u => { if (u.docChanged) opts.onChange!(u.state.doc.toString()) }))

  const view = new EditorView({ parent: host, state: EditorState.create({ doc: opts.doc, extensions }) })

  return {
    view,
    get: () => view.state.doc.toString(),
    set(text) { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }) },
    markError(position) {
      if (position === undefined) return view.dispatch({ effects: setErrorLine.of(null) })
      const offset = Math.min(Math.max(position - 1, 0), view.state.doc.length)
      view.dispatch({ effects: setErrorLine.of(view.state.doc.lineAt(offset).number) })
    },
    focus: () => view.focus(),
    closePopups: () => { closeCompletion(view) },
  }
}
