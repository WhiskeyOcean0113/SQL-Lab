import type { Course, Lang, Lesson } from '../content/types.ts'
import type { Engine } from '../engine/client.ts'
import { t, tText } from '../i18n/index.ts'
import { lessonStates, type LessonState, type Progress } from '../state/progress.ts'
import { $, html, mount, raw, type Raw } from './dom.ts'
import { currentTheme, setTheme } from './theme.ts'

// Shared state for every view, plus the hash router and the top bar.


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
      ctx.status = await progress.exerciseStatus()
    },
    /** The suggested next lesson: the first unfinished one on the path. */
    currentLesson() {
      const id = course.path.find(id => ctx.states[id] !== 'done') ?? course.path.at(-1)
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
      <button type="button" class="theme-switch" role="switch" data-theme-toggle></button>
      <label class="lang-pick"><span class="sr-only">Language / 语言</span><select data-lang>
        <option value="zh" lang="zh-Hans"${lang === 'zh' ? raw(' selected') : ''}>中文</option>
        <option value="en" lang="en"${lang === 'en' ? raw(' selected') : ''}>English</option>
      </select></label>
      </div>
    </div>`)
  const pick = $<HTMLSelectElement>('[data-lang]', top)
  pick.addEventListener('change', () => onLang(pick.value as Lang))
  const themeBtn = $<HTMLButtonElement>('[data-theme-toggle]', top)
  paintThemeSwitch(themeBtn, lang)
  themeBtn.addEventListener('click', () => {
    setTheme(currentTheme() === 'dark' ? 'light' : 'dark')
    paintThemeSwitch(themeBtn, lang)
  })
}

const SUN = '<svg class="ts-icon ts-sun" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="2.6"/><path d="M8 1.8v1.4M8 12.8v1.4M1.8 8h1.4M12.8 8h1.4M3.6 3.6l1 1M11.4 11.4l1 1M3.6 12.4l1-1M11.4 4.6l1-1"/></svg>'
const MOON = '<svg class="ts-icon ts-moon" viewBox="0 0 16 16" aria-hidden="true"><path d="M12.6 10A5 5 0 0 1 6 3.4a5 5 0 1 0 6.6 6.6z"/></svg>'

/**
 * A switch, not a button: sun on the left, moon on the right, and the knob
 * sits under the mode that is on. "Checked" means dark.
 */
export function paintThemeSwitch(el: HTMLButtonElement, lang: Lang) {
  if (!el.firstChild) el.innerHTML = `<span class="ts-knob" aria-hidden="true"></span>${SUN}${MOON}`
  const dark = currentTheme() === 'dark'
  el.setAttribute('aria-checked', String(dark))
  el.setAttribute('aria-label', tText(lang, 'theme.dark'))
  el.title = tText(lang, dark ? 'theme.toLight' : 'theme.toDark')
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

export function notFound(root: HTMLElement, ctx: Ctx, key: 'lesson.notFound') {
  mount(root, html`<div class="empty">${raw(t(ctx.lang, key))}<p><a class="btn" href="${href.map()}">${raw(t(ctx.lang, 'ex.backToMap'))}</a></p></div>`)
}
