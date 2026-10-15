import type { Exercise } from '../../content/types.ts'
import { t, tText } from '../../i18n/index.ts'
import type { MistakeRow } from '../../state/progress.ts'
import { href, type Ctx } from '../app.ts'
import { $, $$, html, mount, raw } from '../dom.ts'

type Filter = 'open' | 'mastered' | 'all'
let filter: Filter = 'open'

export async function renderBank(root: HTMLElement, ctx: Ctx) {
  const { lang, course, progress } = ctx
  const [rows, streakSetting] = await Promise.all([progress.mistakes(), progress.getSetting('mastery_streak')])
  const streak = Number(streakSetting ?? 2)

  const find = (id: string): { ex: Exercise; n: number } | undefined => {
    const [lessonId] = id.split('/')
    const lesson = course.lessons[lessonId ?? '']
    const n = lesson?.exercises.findIndex(e => e.id === id) ?? -1
    return lesson && n >= 0 ? { ex: lesson.exercises[n]!, n: n + 1 } : undefined
  }
  const known = rows.filter(r => find(r.exercise_id))
  const open = known.filter(r => !r.mastered)
  const mastered = known.filter(r => r.mastered)
  const shown = filter === 'open' ? open : filter === 'mastered' ? mastered : known

  const title = (r: MistakeRow) => {
    const f = find(r.exercise_id)!
    const lesson = course.lessons[f.ex.lesson]!
    const prompt = f.ex.prompt[lang].replace(/<[^>]+>/g, '').trim()
    return { text: prompt.length > 60 ? prompt.slice(0, 58) + '…' : prompt, lesson: lesson.title[lang], kind: tText(lang, `kind.${f.ex.kind}`), url: href.practice(lesson.id, f.n) }
  }

  mount(root, html`
    <div class="wrap">
      <div class="bank">
        <div class="bank-head">
          <div>
            <p class="kicker">${raw(t(lang, 'bank.kicker'))}</p>
            <h1 class="display">${raw(t(lang, 'bank.title'))}</h1>
          </div>
          <div class="bank-stats">
            <div class="stat open"><div class="v">${open.length}</div><div class="k">${raw(t(lang, 'bank.open'))}</div></div>
            <div class="stat mastered"><div class="v">${mastered.length}</div><div class="k">${raw(t(lang, 'bank.mastered'))}</div></div>
          </div>
        </div>
        <div class="bank-tools">
          ${(['open', 'mastered', 'all'] as const).map(f => html`<button type="button" class="chip" data-filter="${f}" aria-pressed="${String(filter === f)}">${raw(t(lang, `bank.${f}`))}</button>`)}
          <span class="rule">${raw(t(lang, 'bank.rule', { n: streak }))}</span>
          <button type="button" class="btn small" data-export>${raw(t(lang, 'bank.export'))}</button>
        </div>
        ${shown.length ? html`
        <div class="bank-table">
          <table>
            <thead><tr><th>${raw(t(lang, 'bank.col.exercise'))}</th><th>${raw(t(lang, 'bank.col.wrong'))}</th><th>${raw(t(lang, 'bank.col.streak'))}</th><th>${raw(t(lang, 'bank.col.note'))}</th><th></th></tr></thead>
            <tbody>
              ${shown.map(r => {
                const info = title(r)
                const filled = Math.min(r.correct_streak, streak)
                return html`<tr data-id="${r.exercise_id}">
                  <td><a class="ex-t" href="${info.url}">${info.text}</a><div class="ex-l">${info.lesson} · ${info.kind}</div></td>
                  <td>${raw(t(lang, 'bank.times', { n: r.wrong_count }))}</td>
                  <td><span class="streak" aria-label="${filled} / ${streak}">${Array.from({ length: streak }, (_, i) => html`<i class="${i < filled ? 'on' : ''}"></i>`)}</span></td>
                  <td class="note-cell"><button type="button" class="note-btn${r.note ? '' : ' empty'}" data-note>${r.note ?? raw(t(lang, 'bank.addNote'))}</button></td>
                  <td class="actions"><a class="btn small" href="${info.url}">${raw(t(lang, 'bank.retry'))}</a></td>
                </tr>`
              })}
            </tbody>
          </table>
        </div>` : html`<div class="empty">${raw(t(lang, filter === 'mastered' ? 'bank.empty.mastered' : 'bank.empty.open', { n: streak }))}</div>`}
      </div>
    </div>`)

  $$<HTMLButtonElement>('[data-filter]', root).forEach(b => b.addEventListener('click', () => {
    filter = b.dataset.filter as Filter
    void renderBank(root, ctx)
  }))

  $<HTMLButtonElement>('[data-export]', root).addEventListener('click', async () => {
    const data = await progress.exportAll()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sql-lab-history-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(a.href)
  })

  $$<HTMLButtonElement>('[data-note]', root).forEach(btn => btn.addEventListener('click', () => {
    const tr = btn.closest<HTMLTableRowElement>('tr')!
    const id = tr.dataset.id!
    const cell = $('.note-cell', tr)
    const current = rows.find(r => r.exercise_id === id)?.note ?? ''
    mount(cell, html`<div class="note-edit">
      <textarea aria-label="${tText(lang, 'bank.col.note')}" placeholder="${tText(lang, 'bank.notePlaceholder')}">${current}</textarea>
      <div class="row"><button type="button" class="btn small primary" data-save>${raw(t(lang, 'bank.save'))}</button><button type="button" class="btn small ghost" data-cancel>${raw(t(lang, 'bank.cancel'))}</button></div>
    </div>`)
    const ta = $<HTMLTextAreaElement>('textarea', cell)
    ta.focus()
    $('[data-save]', cell).addEventListener('click', async () => { await progress.setNote(id, ta.value); void renderBank(root, ctx) })
    $('[data-cancel]', cell).addEventListener('click', () => void renderBank(root, ctx))
  }))
}
