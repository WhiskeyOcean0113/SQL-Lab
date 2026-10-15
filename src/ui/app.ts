import type { Course, Lang, Lesson } from '../content/types.ts'
import type { Engine } from '../engine/client.ts'
import { t, tText } from '../i18n/index.ts'
import { lessonStates, type LessonState, type Progress } from '../state/progress.ts'
import { $, html, mount, raw, type Raw } from './dom.ts'
import { currentTheme, setTheme } from './theme.ts'

// Shared state for every view, plus the hash router and the top bar.

/** `npm run review`: every lesson unlocked, progress kept in a separate database. */
export const REVIEW = import.meta.env.VITE_SQL_LAB_REVIEW === '1'

export interface Ctx {
  course: Course
  engine: Engine
  progress: Progress
  lang: Lang
  states: Record<string, LessonState>
  status: Map<string, { solved: boolean; attempts: number }>
  /** Re-read progress from the database (after a submission). */
  refresh(): Promise<void>
  /** The lesson to resume: the first unfinished one, or the last when all are done. */
  currentLesson(): Lesson | undefined
  /** 1-based index of the first unsolved exercise in a lesson, or 1. */
  nextExercise(lesson: Lesson): number
}

export type Route =
  | { name: 'map' }
  | { name: 'lesson'; id: string; section?: string }
  | { name: 'practice'; id: string; n: number }
  | { name: 'mistakes' }
  | { name: 'glossary' }

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
  if (parts[0] === 'lesson' && parts[1]) return { name: 'lesson', id: parts[1], section: parts[2] }
  if (parts[0] === 'practice' && parts[1]) return { name: 'practice', id: parts[1], n: Math.max(1, Number(parts[2]) || 1) }
  if (parts[0] === 'mistakes') return { name: 'mistakes' }
  if (parts[0] === 'glossary') return { name: 'glossary' }
  return { name: 'map' }
}

export const href = {
  map: () => '#/',
  lesson: (id: string, section?: string) => `#/lesson/${encodeURIComponent(id)}${section ? '/' + section : ''}`,
  practice: (id: string, n: number) => `#/practice/${encodeURIComponent(id)}/${n}`,
  mistakes: () => '#/mistakes',
  glossary: () => '#/glossary',
}

export async function createCtx(course: Course, engine: Engine, progress: Progress, lang: Lang): Promise<Ctx> {
  const ctx: Ctx = {
    course, engine, progress, lang,
    states: {},
    status: new Map(),
    async refresh() {
      const done = await progress.doneLessons()
      ctx.states = lessonStates(course.path, done)
      // Review mode opens every lesson so content can be checked out of order.
      if (REVIEW) for (const id of course.path) if (ctx.states[id] === 'locked') ctx.states[id] = 'available'
      ctx.status = await progress.exerciseStatus()
    },
    currentLesson() {
      const id = course.path.find(id => ctx.states[id] === 'available') ?? course.path.at(-1)
      return id ? course.lessons[id] : undefined
    },
    nextExercise(lesson) {
      const i = lesson.exercises.findIndex(e => !ctx.status.get(e.id)?.solved)
      return i === -1 ? 1 : i + 1
    },
  }
  await ctx.refresh()
  return ctx
}

export function renderTop(ctx: Ctx, route: Route, onLang: (l: Lang) => void) {
  const lang = ctx.lang
  const cur = ctx.currentLesson()
  const learnHref = cur ? href.lesson(cur.id) : href.map()
  const practiceHref = cur ? href.practice(cur.id, ctx.nextExercise(cur)) : href.map()
  const item = (name: Route['name'], url: string, label: string) =>
    html`<a href="${url}"${route.name === name ? raw(' aria-current="page"') : ''}>${label}</a>`
  const top = $('#top')
  mount(top, html`
    <div class="top-in">
      <a class="brand" href="${href.map()}"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>SQL Lab</span></a>
      <nav class="nav" aria-label="Main">
        ${item('map', href.map(), tText(lang, 'nav.map'))}
        ${item('lesson', learnHref, tText(lang, 'nav.learn'))}
        ${item('practice', practiceHref, tText(lang, 'nav.practice'))}
        ${item('mistakes', href.mistakes(), tText(lang, 'nav.mistakes'))}
        ${item('glossary', href.glossary(), tText(lang, 'nav.glossary'))}
      </nav>
      <div class="top-tools">
      <button type="button" class="theme-btn" data-theme-toggle></button>
      <label class="lang-pick"><span class="sr-only">Language / 语言</span><select data-lang>
        <option value="zh" lang="zh-Hans"${lang === 'zh' ? raw(' selected') : ''}>中文</option>
        <option value="en" lang="en"${lang === 'en' ? raw(' selected') : ''}>English</option>
      </select></label>
      </div>
    </div>`)
  const pick = $<HTMLSelectElement>('[data-lang]', top)
  pick.addEventListener('change', () => onLang(pick.value as Lang))
  const themeBtn = $<HTMLButtonElement>('[data-theme-toggle]', top)
  paintThemeButton(themeBtn, lang)
  themeBtn.addEventListener('click', () => {
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark')
    paintThemeButton(themeBtn, lang)
  })
}

const SUN = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="3"/><path d="M8 1.5v1.6M8 12.9v1.6M1.5 8h1.6M12.9 8h1.6M3.4 3.4l1.1 1.1M11.5 11.5l1.1 1.1M3.4 12.6l1.1-1.1M11.5 4.5l1.1-1.1"/></svg>'
const MOON = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M13.2 10.1A5.6 5.6 0 0 1 5.9 2.8a5.6 5.6 0 1 0 7.3 7.3z"/></svg>'

/** The button shows where a click takes you: a moon in light mode, a sun in dark. */
export function paintThemeButton(btn: HTMLButtonElement, lang: Lang) {
  const toDark = currentTheme() === 'light'
  const label = tText(lang, toDark ? 'theme.toDark' : 'theme.toLight')
  btn.innerHTML = toDark ? MOON : SUN
  btn.setAttribute('aria-label', label)
  btn.title = label
}

/**
 * One segment per exercise: solved, attempted (striped, like the exercise
 * page's steps) or untouched, followed by the count.
 */
export function exerciseBar(ctx: Ctx, lesson: Lesson): Raw {
  const cells = lesson.exercises.map(e => {
    const st = ctx.status.get(e.id)
    return st?.solved ? 'ok' : st ? 'bad' : ''
  })
  const done = cells.filter(c => c === 'ok').length
  const total = cells.length
  return html`<span class="segs" role="img" aria-label="${tText(ctx.lang, 'map.solved', { done, total })}">${cells.map(c => html`<i class="${c}"></i>`)}</span><span class="segs-n">${done} / ${total}</span>`
}

/** Plain-text section heading, used in "Reread …" links. */
export function sectionHeading(lesson: Lesson, sectionId: string, lang: Lang): string {
  const s = lesson.body[lang].find(x => x.id === sectionId)
  return s ? s.heading.replace(/<[^>]+>/g, '') : sectionId
}

export function notFound(root: HTMLElement, ctx: Ctx, key: 'lesson.notFound' | 'lesson.locked' | 'ex.locked') {
  mount(root, html`<div class="empty">${raw(t(ctx.lang, key))}<p><a class="btn" href="${href.map()}">${raw(t(ctx.lang, 'ex.backToMap'))}</a></p></div>`)
}
