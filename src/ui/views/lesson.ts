import { t } from '../../i18n/index.ts'
import { href, notFound, type Ctx } from '../app.ts'
import { $$, html, mount, pad2, raw } from '../dom.ts'
import { hydrateCheck } from '../check.ts'
import { hydrateRunner } from '../runner.ts'
import { hydrateSteps } from '../steps.ts'
import { chapterNo } from './map.ts'

/** The one section that starts collapsed: dialect notes and rarely used forms. */
const REFERENCE = 'reference'

export function renderLesson(root: HTMLElement, ctx: Ctx, id: string, section?: string) {
  const { course, lang, status } = ctx
  const lesson = course.lessons[id]
  if (!lesson) return notFound(root, ctx, 'lesson.notFound')
  void ctx.progress.startLesson(id)

  const module = course.modules.find(m => m.id === lesson.module)
  const sections = lesson.body[lang]
  const index = course.path.indexOf(id) + 1
  const prereqs = lesson.prereqs.map(p => course.lessons[p]?.title[lang] ?? p).join(lang === 'zh' ? '、' : ', ')
  const anySolved = lesson.exercises.some(e => status.get(e.id)?.solved)

  mount(root, html`
    <div class="wrap">
      <div class="lesson">
        <aside class="rail">
          <p class="kicker">${raw(t(lang, 'map.chapter', { n: chapterNo(lesson.module) }))} ${module?.title[lang] ?? ''}</p>
          <ol class="toc" aria-label="${t(lang, 'lesson.contents')}">
            ${sections.map((s, i) => html`<li><a href="${href.lesson(id, s.id)}" data-sec="${s.id}"><span class="no">${pad2(i + 1)}</span><span>${raw(s.heading)}</span></a></li>`)}
          </ol>
          <p class="kicker">${raw(t(lang, 'lesson.exercises'))}</p>
          <ul class="ex-list">
            ${lesson.exercises.map((e, i) => {
              const st = status.get(e.id)
              const pip = st?.solved ? 'ok' : st ? 'bad' : ''
              return html`<li><a href="${href.practice(id, i + 1)}"><span class="no">${pad2(i + 1)}</span><span>${raw(t(lang, `kind.${e.kind}`))}</span><span class="pip ${pip}" aria-hidden="true"></span></a></li>`
            })}
          </ul>
        </aside>

        <article>
          <header class="lesson-head">
            <p class="kicker">${raw(t(lang, 'lesson.kicker', { n: index, total: course.path.length }))}</p>
            <h1 class="display ttl">${raw(lesson.titleHtml[lang])}</h1>
            <p class="lede">${lesson.summary[lang]}</p>
            <div class="facts">
              <span>${raw(t(lang, 'lesson.dataset'))} <b>${lesson.dataset}</b></span>
              <span>${raw(t(lang, 'lesson.prereqs'))} <b>${prereqs || raw(t(lang, 'lesson.none'))}</b></span>
              <span>${raw(t(lang, 'lesson.exercises'))} <b>${raw(t(lang, 'lesson.exerciseCount', { n: lesson.exercises.length }))}</b></span>
            </div>
          </header>
          ${sections.map((s, i) => s.id === REFERENCE
            ? html`
            <section class="section ref" id="sec-${s.id}">
              <details class="ref-box">
                <summary><h2><span class="no">${pad2(i + 1)}</span><span>${raw(s.heading)}</span></h2><span class="ref-toggle"><span class="ref-show">${raw(t(lang, 'reference.show'))}</span><span class="ref-hide">${raw(t(lang, 'reference.hide'))}</span></span></summary>
                <div class="prose">${raw(s.html)}</div>
              </details>
            </section>`
            : html`
            <section class="section" id="sec-${s.id}">
              <h2><span class="no">${pad2(i + 1)}</span><span>${raw(s.heading)}</span></h2>
              <div class="prose">${raw(s.html)}</div>
            </section>`)}
          <div class="lesson-foot">
            <a class="btn primary" href="${href.practice(id, ctx.nextExercise(lesson))}">${raw(t(lang, anySolved ? 'lesson.continue' : 'lesson.start'))}</a>
          </div>
        </article>
      </div>
    </div>`)

  for (const el of $$<HTMLElement>('.sql-run', root)) void hydrateRunner(el, ctx, lesson.dataset)
  for (const el of $$<HTMLElement>('.checkpoint', root)) hydrateCheck(el, ctx, lesson.dataset)
  for (const el of $$<HTMLElement>('.stepper', root)) hydrateSteps(el, ctx, lesson.dataset)

  // Rail links scroll within the page instead of re-rendering it.
  for (const a of $$<HTMLAnchorElement>('.toc a', root)) {
    a.addEventListener('click', e => {
      e.preventDefault()
      reveal(a.dataset.sec ?? '')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      history.replaceState(null, '', a.getAttribute('href'))
    })
  }
  scrollSpy(root)

  if (section) requestAnimationFrame(() => reveal(section)?.scrollIntoView({ block: 'start' }))
  else window.scrollTo(0, 0)
}

/** A section's element, unfolded first if it is collapsed (the reference section). */
function reveal(sectionId: string): HTMLElement | null {
  const el = document.getElementById(`sec-${sectionId}`)
  const details = el?.querySelector<HTMLDetailsElement>(':scope > details')
  if (details) details.open = true
  return el
}

function scrollSpy(root: HTMLElement) {
  const links = new Map($$<HTMLAnchorElement>('.toc a', root).map(a => [`sec-${a.dataset.sec}`, a]))
  const visible = new Set<string>()
  const io = new IntersectionObserver(entries => {
    for (const e of entries) e.isIntersecting ? visible.add(e.target.id) : visible.delete(e.target.id)
    const first = [...links.keys()].find(k => visible.has(k))
    if (!first) return
    links.forEach((a, k) => a.classList.toggle('on', k === first))
  }, { rootMargin: '-80px 0px -55% 0px' })
  $$('.section', root).forEach(s => io.observe(s))
}
