import { t, tText } from '../../i18n/index.ts'
import { exerciseBar, href, type Ctx } from '../app.ts'
import { html, mount, pad2, raw } from '../dom.ts'

export function renderMap(root: HTMLElement, ctx: Ctx) {
  const { course, lang, states, status } = ctx
  const lessonCount = course.path.length
  const doneCount = course.path.filter(id => states[id] === 'done').length
  const planned = course.modules.reduce((n, m) => n + m.planned.length, 0)
  const pct = lessonCount ? Math.round((doneCount / lessonCount) * 100) : 0
  const current = ctx.currentLesson()
  const allDone = lessonCount > 0 && doneCount === lessonCount

  const solvedIn = (id: string) => course.lessons[id]!.exercises.filter(e => status.get(e.id)?.solved).length

  const next = current
    ? html`
      <div class="next">
        <div class="next-top">
          <span class="label">${raw(t(lang, allDone ? 'map.allDone' : 'map.continue'))}</span>
          <span class="label">${raw(t(lang, 'map.chapter', { n: chapterNo(current.module) }))} ${course.modules.find(m => m.id === current.module)?.title[lang] ?? ''}</span>
        </div>
        <div class="title ttl">${raw(current.titleHtml[lang])}</div>
        <div class="next-bar">${exerciseBar(ctx, current)}</div>
        <a class="btn primary" href="${href.lesson(current.id)}">${raw(t(lang, allDone ? 'map.review' : doneCount || solvedIn(current.id) ? 'map.continue' : 'map.start'))}</a>
        <div class="overall"><span>${raw(t(lang, 'map.doneCount', { n: doneCount, total: lessonCount }))}</span><div class="bar"><i style="width: ${pct}%"></i></div><span class="pct">${pct}%</span></div>
      </div>`
    : html`<div class="next"><div class="label">${raw(t(lang, 'map.noLessons'))}</div></div>`

  mount(root, html`
    <section class="wrap">
      <div class="map-head">
        <div>
          <p class="kicker">${raw(t(lang, 'map.kicker', { modules: course.modules.length, lessons: lessonCount + planned }))}</p>
          <h1 class="display">${raw(t(lang, 'map.title'))}</h1>
          <p class="intro">${raw(t(lang, 'map.intro'))}</p>
        </div>
        ${next}
      </div>
      <div class="modules">
        ${course.modules.map(m => {
          const isCurrent = current?.module === m.id && !allDone
          return html`
          <div class="module${isCurrent ? ' current' : ''}">
            <div class="no" aria-hidden="true">${pad2(chapterNo(m.id))}</div>
            <div><h3 class="ttl">${raw(m.titleHtml[lang])}</h3><p class="sum">${m.summary[lang]}</p></div>
            <ul class="lessons">
              ${m.lessons.map(id => {
                const l = course.lessons[id]
                if (!l) return ''
                const s = states[id]
                if (s === 'locked') return html`<li><span class="row locked"><span class="state st-lock" aria-hidden="true"></span><span class="name ttl">${raw(l.titleHtml[lang])}</span></span></li>`
                return html`<li><a class="row" href="${href.lesson(id)}"><span class="state ${s === 'done' ? 'st-done' : 'st-now'}" aria-hidden="true"></span><span class="name ttl">${raw(l.titleHtml[lang])}</span><span class="row-bar">${exerciseBar(ctx, l)}</span></a></li>`
              })}
              ${m.planned.map(p => html`<li><span class="row locked"><span class="state st-lock" aria-hidden="true"></span><span class="name ttl">${raw(p.titleHtml[lang])}</span><span class="tag">${tText(lang, 'map.planned')}</span></span></li>`)}
            </ul>
          </div>`
        })}
      </div>
    </section>`)
}

/** m4 → 4. Chapters are numbered by module id, so M0 is chapter 0. */
export function chapterNo(moduleId: string): number {
  return Number(moduleId.replace(/\D/g, '')) || 0
}
