import { t } from '../i18n/index.ts'
import type { Ctx } from './app.ts'
import { $, html, mount, raw } from './dom.ts'
import { createEditor } from './editor.ts'
import { runOutput } from './results.ts'

const schemas = new Map<string, Promise<Record<string, string[]>>>()

/** Table → columns for editor completion. Also boots the dataset's database. */
export function schemaFor(ctx: Ctx, dataset: string) {
  let s = schemas.get(dataset)
  if (!s) {
    s = ctx.engine.schema(dataset).catch(() => ({}))
    schemas.set(dataset, s)
  }
  return s
}

/** Turn a build-time `<div class="sql-run">` into an editable, runnable example. */
export async function hydrateRunner(el: HTMLElement, ctx: Ctx, dataset: string) {
  const original = el.dataset.sql ?? ''
  const lang = ctx.lang
  const schema = await schemaFor(ctx, dataset)
  if (!el.isConnected) return

  el.className = 'runner'
  mount(el, html`
    <div class="runner-top">
      <span class="ds">${dataset}</span><span>${raw(t(lang, el.dataset.expectError ? 'runner.expectError' : 'runner.editable'))}</span>
      <span class="sp"></span>
      <button type="button" class="btn ghost small" data-reset hidden>${raw(t(lang, 'runner.reset'))}</button>
      <kbd aria-hidden="true">⌘ ↵</kbd>
      <button type="button" class="btn small primary" data-run>${raw(t(lang, 'runner.run'))}</button>
    </div>
    <div class="editor-host"></div>
    <div class="out" aria-live="polite"></div>`)

  const out = $('.out', el)
  const runBtn = $<HTMLButtonElement>('[data-run]', el)
  const resetBtn = $<HTMLButtonElement>('[data-reset]', el)

  const run = async () => {
    runBtn.disabled = true
    const sql = editor.get()
    try {
      const result = await ctx.engine.run(dataset, sql)
      editor.markError(result.error?.position)
      mount(out, runOutput(result, sql, lang))
    } finally {
      runBtn.disabled = false
    }
  }

  const editor = createEditor($('.editor-host', el), { doc: original, schema, onRun: run, onChange: text => { resetBtn.hidden = text === original } })
  runBtn.addEventListener('click', run)
  resetBtn.addEventListener('click', () => { editor.set(original); resetBtn.hidden = true; mount(out, html``) })
}
