import type { Lang } from '../content/types.ts'
import { finalResult } from '../engine/grade.ts'
import type { RunOutcome } from '../engine/types.ts'
import { t, tText } from '../i18n/index.ts'
import type { Ctx } from './app.ts'
import { $, $$, html, mount, raw } from './dom.ts'
import { runOutput } from './results.ts'

// A ```steps block in a lesson: one panel that pages through intermediate
// results. Each step runs the first time it is shown, and its result is kept.
// With `group`, rows are tinted by that column's value (--grp-1 … --grp-6,
// cycling) and numbered, so groups stay apart without colour too.

const GROUP_TINTS = 6

interface StepView { sql: string; group?: string; say: string; code: string }

/** Turn a build-time `<div class="stepper">` into a step-through. */
export function hydrateSteps(el: HTMLElement, ctx: Ctx, dataset: string) {
  const lang = ctx.lang
  const steps: StepView[] = $$<HTMLElement>('.st-step', el).map(li => ({
    sql: li.dataset.sql ?? '',
    group: li.dataset.group,
    say: li.querySelector('.st-say')?.innerHTML ?? '',
    code: li.querySelector('pre')?.outerHTML ?? '',
  }))
  if (!steps.length) return

  mount(el, html`
    <div class="st-top">
      <span class="st-kind">${raw(t(lang, 'steps.kicker'))}</span>
      <span class="st-count" aria-live="polite"></span>
      <span class="sp"></span>
      <button type="button" class="btn small" data-prev>← ${raw(t(lang, 'steps.prev'))}</button>
      <button type="button" class="btn small primary" data-next>${raw(t(lang, 'steps.next'))} →</button>
    </div>
    <div class="st-say"></div>
    <div class="st-code"></div>
    <div class="out" aria-live="polite"></div>`)

  const prev = $<HTMLButtonElement>('[data-prev]', el)
  const next = $<HTMLButtonElement>('[data-next]', el)
  const out = $('.out', el)
  const runs = new Map<number, Promise<RunOutcome>>()
  let at = 0

  const runStep = (i: number) => {
    let r = runs.get(i)
    if (!r) {
      r = ctx.engine.run(dataset, steps[i]!.sql).catch((e: unknown) => {
        runs.delete(i) // try again next time it is shown
        return { ok: false, results: [], ms: 0, error: { message: e instanceof Error ? e.message : String(e) } }
      })
      runs.set(i, r)
    }
    return r
  }

  const show = async (i: number) => {
    at = i
    const step = steps[i]!
    mount($('.st-count', el), raw(t(lang, 'steps.count', { i: i + 1, n: steps.length })))
    mount($('.st-say', el), raw(step.say))
    mount($('.st-code', el), raw(step.code))
    prev.disabled = i === 0
    next.disabled = i === steps.length - 1
    // Keep the last table in place, dimmed, until this step's result arrives.
    out.setAttribute('aria-busy', 'true')
    const result = await runStep(i)
    if (at !== i || !el.isConnected) return
    out.removeAttribute('aria-busy')
    mount(out, runOutput(result, step.sql, lang))
    if (step.group) tintGroups(out, result, step.group, lang)
  }

  prev.addEventListener('click', () => { if (at > 0) void show(at - 1) })
  next.addEventListener('click', () => { if (at < steps.length - 1) void show(at + 1) })
  void show(0)
}

/**
 * Tint each row of the rendered result by its value in `column`, in order of
 * first appearance, and number the groups in a leading column. A row that
 * starts a new group also gets a rule above it.
 */
function tintGroups(out: HTMLElement, result: RunOutcome, column: string, lang: Lang) {
  const rs = finalResult(result)
  const table = out.querySelector<HTMLTableElement>('table.grid')
  const col = rs?.columns.findIndex(c => c.name === column) ?? -1
  if (!rs || !table || col === -1) return

  const head = document.createElement('th')
  head.className = 'grp-h'
  const label = document.createElement('span')
  label.className = 'sr-only'
  label.textContent = tText(lang, 'steps.group')
  head.append(label)
  table.tHead?.rows[0]?.prepend(head)

  const ids = new Map<string, number>()
  let previous = -1
  Array.from(table.tBodies[0]?.rows ?? []).forEach((tr, i) => {
    const value = rs.rows[i]?.[col]
    const key = value === null || value === undefined ? '\u0000null' : String(value)
    if (!ids.has(key)) ids.set(key, ids.size)
    const g = ids.get(key)!
    tr.dataset.grp = String((g % GROUP_TINTS) + 1)
    if (i > 0 && g !== previous) tr.classList.add('grp-start')
    previous = g
    const mark = document.createElement('td')
    mark.className = 'grp-mark'
    mark.textContent = String(g + 1)
    tr.prepend(mark)
  })

  if (!ids.size) return
  const legend = document.createElement('div')
  legend.className = 'st-legend'
  mount(legend, raw(t(lang, 'steps.groups', { col: column, n: ids.size })))
  ;(out.querySelector('.out-meta') ?? table).after(legend)
}
