import type { RunOutcome } from '../engine/types.ts'
import { t } from '../i18n/index.ts'
import type { Ctx } from './app.ts'
import { $, $$, html, mount, raw } from './dom.ts'
import { createEditor, type EditorHandle } from './editor.ts'
import { runOutput } from './results.ts'
import { schemaFor } from './runner.ts'

// A ```check block in a lesson: predict, then run. The learner picks a choice
// and presses Check; then right or wrong, the explanation and the query's
// result appear, and the query becomes an editable, runnable example.
// Formative only: nothing is recorded in progress.

let seq = 0

/** Turn a build-time `<div class="checkpoint">` into a checkpoint. */
export function hydrateCheck(el: HTMLElement, ctx: Ctx, dataset: string) {
  const lang = ctx.lang
  const sql = el.dataset.sql ?? ''
  const answer = Number(el.dataset.answer)
  const query = el.querySelector('pre')?.outerHTML ?? ''
  const question = el.querySelector('.cp-q')?.innerHTML ?? ''
  const choices = $$('.cp-choices > li', el).map(li => li.innerHTML)
  const explain = el.querySelector('.cp-explain')?.innerHTML ?? ''
  const name = `checkpoint-${++seq}`

  mount(el, html`
    <div class="cp-top">
      <span class="cp-kind">${raw(t(lang, 'check.kicker'))}</span><span>${raw(t(lang, 'check.lead'))}</span>
      <span class="sp"></span>
      <button type="button" class="btn ghost small" data-reset hidden>${raw(t(lang, 'runner.reset'))}</button>
      <kbd aria-hidden="true" hidden>⌘ ↵</kbd>
      <button type="button" class="btn small primary" data-run hidden>${raw(t(lang, 'runner.run'))}</button>
    </div>
    <div class="cp-query">${raw(query)}</div>
    <div class="cp-body">
      <div class="cp-q">${raw(question)}</div>
      <fieldset class="cp-choices">
        <legend class="sr-only">${raw(t(lang, 'check.choose'))}</legend>
        ${choices.map((c, i) => html`<label class="cp-choice"><input type="radio" name="${name}" value="${i}"><span class="cp-text">${raw(c)}</span><span class="cp-tag"></span></label>`)}
      </fieldset>
      <div class="cp-bar"><button type="button" class="btn small primary" data-check>${raw(t(lang, 'check.check'))}</button><span class="cp-note" aria-live="polite"></span></div>
      <div class="cp-verdict" aria-live="polite" hidden>
        <span class="badge"></span>
        <div class="cp-explain">${raw(explain)}</div>
      </div>
    </div>
    <div class="out" aria-live="polite"></div>`)

  const labels = $$<HTMLLabelElement>('.cp-choice', el)
  const checkBtn = $<HTMLButtonElement>('[data-check]', el)
  const runBtn = $<HTMLButtonElement>('[data-run]', el)
  const resetBtn = $<HTMLButtonElement>('[data-reset]', el)
  const out = $('.out', el)
  let editor: EditorHandle | undefined

  el.addEventListener('change', () => labels.forEach(l => l.classList.toggle('picked', l.querySelector('input')!.checked)))

  const run = async () => {
    const text = editor?.get() ?? sql
    runBtn.disabled = true
    let result: RunOutcome
    try {
      result = await ctx.engine.run(dataset, text)
    } catch (e) {
      result = { ok: false, results: [], ms: 0, error: { message: e instanceof Error ? e.message : String(e) } }
    } finally {
      runBtn.disabled = false
    }
    if (!el.isConnected) return
    editor?.markError(result.error?.position)
    mount(out, runOutput(result, text, lang))
  }

  /** After checking, the query is the learner's to run and change. */
  const makeRunnable = async () => {
    const schema = await schemaFor(ctx, dataset)
    if (!el.isConnected) return
    const host = $('.cp-query', el)
    mount(host, html`<div class="editor-host"></div>`)
    editor = createEditor($('.editor-host', host), { doc: sql, schema, onRun: () => void run(), onChange: text => { resetBtn.hidden = text === sql } })
    runBtn.hidden = false
    $('kbd', el).hidden = false
  }

  checkBtn.addEventListener('click', () => {
    const picked = el.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)
    if (!picked) { mount($('.cp-note', el), raw(t(lang, 'check.needChoice'))); return }
    const choice = Number(picked.value)
    const right = choice === answer
    labels.forEach((l, i) => {
      l.classList.remove('picked')
      l.querySelector('input')!.disabled = true
      const tag = $('.cp-tag', l)
      if (i === answer) { l.classList.add('right'); mount(tag, raw(t(lang, 'check.answer'))) }
      else if (i === choice) { l.classList.add('wrong'); mount(tag, raw(t(lang, 'check.yourPick'))) }
    })
    $('.cp-bar', el).hidden = true
    const verdict = $('.cp-verdict', el)
    const badge = $('.badge', verdict)
    badge.classList.add(right ? 'ok' : 'bad')
    mount(badge, raw(t(lang, right ? 'check.right' : 'check.wrong')))
    verdict.hidden = false
    void run()
    void makeRunnable()
  })
  runBtn.addEventListener('click', () => void run())
  resetBtn.addEventListener('click', () => { editor?.set(sql); editor?.markError(undefined); resetBtn.hidden = true })
}
