import type { Course, Lang, Lesson } from '../content/types.ts'
import type { Engine } from '../engine/client.ts'
import { t, tText } from '../i18n/index.ts'
import { lessonStates, type LessonState, type Progress } from '../state/progress.ts'
import { $, html, mount, raw } from './dom.ts'

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
      <a class="brand" href="${href.map()}"><span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>SQL Lab</span></a>${REVIEW ? html`<span class="review-badge" title="${tText(lang, 'review.hint')}">${tText(lang, 'review.badge')}</span>` : ''}
      <nav class="nav" aria-label="Main">
        ${item('map', href.map(), tText(lang, 'nav.map'))}
        ${item('lesson', learnHref, tText(lang, 'nav.learn'))}
        ${item('practice', practiceHref, tText(lang, 'nav.practice'))}
        ${item('mistakes', href.mistakes(), tText(lang, 'nav.mistakes'))}
        ${item('glossary', href.glossary(), tText(lang, 'nav.glossary'))}
      </nav>
      <div class="seg" role="group" aria-label="Language">
        <button type="button" data-lang="zh" aria-pressed="${String(lang === 'zh')}" lang="zh-Hans">中</button>
        <button type="button" data-lang="en" aria-pressed="${String(lang === 'en')}" lang="en">EN</button>
      </div>
    </div>`)
  top.querySelectorAll<HTMLButtonElement>('[data-lang]').forEach(b => b.addEventListener('click', () => onLang(b.dataset.lang as Lang)))
}

/** Plain-text section heading, used in "Reread …" links. */
export function sectionHeading(lesson: Lesson, sectionId: string, lang: Lang): string {
  const s = lesson.body[lang].find(x => x.id === sectionId)
  return s ? s.heading.replace(/<[^>]+>/g, '') : sectionId
}

export function notFound(root: HTMLElement, ctx: Ctx, key: 'lesson.notFound' | 'lesson.locked' | 'ex.locked') {
  mount(root, html`<div class="empty">${raw(t(ctx.lang, key))}<p><a class="btn" href="${href.map()}">${raw(t(ctx.lang, 'ex.backToMap'))}</a></p></div>`)
}
