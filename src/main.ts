import course from 'virtual:content'
import type { Lang } from './content/types.ts'
import { Engine } from './engine/client.ts'
import { setGlossary, t, tText } from './i18n/index.ts'
import { Progress } from './state/progress.ts'
import { REVIEW, createCtx, parseRoute, renderTop, type Ctx } from './ui/app.ts'
import { $, html, mount, raw } from './ui/dom.ts'
import { renderBank } from './ui/views/bank.ts'
import { renderExercise } from './ui/views/exercise.ts'
import { renderGlossary } from './ui/views/glossary.ts'
import { renderLesson } from './ui/views/lesson.ts'
import { renderMap } from './ui/views/map.ts'
import './styles/app.css'

const main = $('#main')

function applyLang(lang: Lang) {
  document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : 'en'
}

async function boot() {
  setGlossary(course.glossary)
  // Review mode never touches the real learning record.
  const progress = await Progress.open(REVIEW ? 'idb://sql-lab-review' : 'idb://sql-lab')
  const lang = ((await progress.getSetting('lang')) as Lang | undefined) ?? 'zh'
  applyLang(lang)
  const engine = new Engine(course.datasets)
  const ctx = await createCtx(course, engine, progress, lang)

  // Boot the database behind the lesson the learner will most likely open.
  const cur = ctx.currentLesson()
  if (cur) void engine.warm(cur.dataset)

  const setLang = async (l: Lang) => {
    if (l === ctx.lang) return
    ctx.lang = l
    applyLang(l)
    route()
    await progress.setSetting('lang', l)
  }

  const top = () => renderTop(ctx, parseRoute(location.hash), setLang)

  function route() {
    const r = parseRoute(location.hash)
    top()
    document.title = titleFor(ctx, r)
    switch (r.name) {
      case 'map': return renderMap(main, ctx)
      case 'lesson': return renderLesson(main, ctx, r.id, r.section)
      case 'practice': return renderExercise(main, ctx, r.id, r.n, top)
      case 'mistakes': return void renderBank(main, ctx)
      case 'glossary': return renderGlossary(main, ctx)
    }
  }

  window.addEventListener('hashchange', route)
  route()
}

function titleFor(ctx: Ctx, r: ReturnType<typeof parseRoute>): string {
  const l = ctx.lang
  const name = r.name === 'lesson' || r.name === 'practice' ? ctx.course.lessons[r.id]?.title[l] : undefined
  const page = name ?? tText(l, r.name === 'mistakes' ? 'nav.mistakes' : r.name === 'glossary' ? 'nav.glossary' : 'nav.map')
  return `${page} · SQL Lab`
}

mount(main, html`<div class="boot">${raw(t('zh', 'boot.loading'))}</div>`)
boot().catch(err => {
  console.error(err)
  mount(main, html`<div class="boot">${raw(t('zh', 'boot.failed', { message: err instanceof Error ? err.message : String(err) }))}</div>`)
})
