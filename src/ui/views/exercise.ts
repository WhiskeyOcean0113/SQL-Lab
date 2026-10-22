import { highlightSql } from '../../content/highlight.ts'
import { chapterKey, type Exercise, type Lang, type Lesson, type PredictExercise, type QueryExercise, type SetKind } from '../../content/types.ts'
import type { Grade } from '../../engine/types.ts'
import { t, tText, type StringKey } from '../../i18n/index.ts'
import type { SittingAnswer } from '../../state/progress.ts'
import { href, notFound, revisitOf, sectionHeading, type Ctx } from '../app.ts'
import { $, $$, html, mount, raw, type Raw } from '../dom.ts'
import { createEditor, type EditorHandle } from '../editor.ts'
import { failureBody, runOutput } from '../results.ts'
import { schemaFor } from '../runner.ts'
import { chapterNo } from './map.ts'

// One exercise: the task on the left, the work on the right, and a verdict
// that says what is wrong and points back to the lesson section it practises.
//
// The same view serves a lesson's exercises, a chapter's challenges and a
// chapter quiz. In a quiz sitting (quiz mode) there are no hints, traps, diff
// or explain: a submission only says "answer recorded", and the sitting's
// results page shows everything once it is finished.

const draftKey = (id: string) => `sql-lab:draft:${id}`
const readDraft = (id: string) => { try { return localStorage.getItem(draftKey(id)) } catch { return null } }
const writeDraft = (id: string, text: string) => { try { localStorage.setItem(draftKey(id), text) } catch { /* private mode */ } }

/** The exercises one page steps through: a lesson's, a chapter's challenges, or a quiz. */
interface PracticeSet {
  /** What attempts record as `lesson_id`: the lesson id, or `chapter:<module id>`. */
  owner: string
  exercises: Exercise[]
  dataset: string
  /** Predict: Run stays locked until an answer is in. */
  lockRun: boolean
  /** The lesson these exercises complete, when they belong to one. */
  lesson?: Lesson
  kicker(n: number): string
  href(n: number): string
  /** Where the first exercise's "back" leads. */
  home: { href: string; label: string }
  /** Where the set leads once done; the course map when absent. */
  next?: { href: string; pager: string; foot: string }
  /** Quiz mode: the open sitting and its answers so far. */
  sitting?: { id: number; module: string; answers: Map<string, SittingAnswer> }
}

export function renderExercise(root: HTMLElement, ctx: Ctx, lessonId: string, n: number, onProgress: () => void) {
  const { course, lang } = ctx
  const lesson = course.lessons[lessonId]
  if (!lesson) return notFound(root, ctx, 'lesson.notFound')
  if (!lesson.exercises[n - 1]) return notFound(root, ctx, 'lesson.notFound')
  void ctx.progress.startLesson(lessonId)
  const nextId = course.path[course.path.indexOf(lesson.id) + 1]
  const next = nextId ? course.lessons[nextId] : undefined
  renderInSet(root, ctx, {
    owner: lesson.id,
    exercises: lesson.exercises,
    dataset: lesson.dataset,
    // Predict first, then run. Legacy lessons keep Run open: some of their prompts say "run the query below".
    lockRun: lesson.template === 2,
    lesson,
    kicker: i => t(lang, 'ex.kicker', { lesson: lesson.title[lang], n: i, total: lesson.exercises.length }),
    href: i => href.practice(lesson.id, i),
    home: { href: href.lesson(lesson.id), label: t(lang, 'ex.backToLesson') },
    next: next && { href: href.lesson(next.id), pager: t(lang, 'ex.nextLessonNamed', { title: next.title[lang] }), foot: t(lang, 'ex.nextLesson') },
  }, n, onProgress)
}

/** A chapter quiz item or challenge: `#/chapter/<module>/<set>/<n>`. */
export async function renderChapterExercise(root: HTMLElement, ctx: Ctx, moduleId: string, kind: SetKind, n: number, onProgress: () => void) {
  const { course, lang } = ctx
  const mod = course.modules.find(m => m.id === moduleId)
  const items = mod?.[kind] ?? []
  if (!mod || !items[n - 1]) return notFound(root, ctx, 'chapter.notFound')
  const chapter = tText(lang, 'map.chapter', { n: chapterNo(mod.id) })
  const toChapter = t(lang, 'quiz.toChapter')
  const set: PracticeSet = {
    owner: chapterKey(mod.id),
    exercises: items,
    dataset: mod.dataset,
    lockRun: true,
    kicker: i => t(lang, kind === 'quiz' ? 'quiz.kicker' : 'challenge.kicker', { chapter, n: i, total: items.length }),
    href: i => href.set(mod.id, kind, i),
    home: { href: href.chapter(mod.id), label: toChapter },
    next: { href: href.chapter(mod.id), pager: toChapter, foot: toChapter },
  }
  if (kind === 'quiz') {
    const hash = location.hash
    const id = await ctx.progress.openSitting(mod.id)
    const answers = id === undefined ? undefined : await ctx.progress.sittingAnswers(id)
    if (location.hash !== hash) return // the learner has moved on
    if (id === undefined || !answers) {
      mount(root, html`<div class="wrap"><div class="empty">${raw(t(lang, 'quiz.notStarted'))}<p><a class="btn" href="${href.chapter(mod.id)}">${raw(toChapter)}</a></p></div></div>`)
      return
    }
    set.sitting = { id, module: mod.id, answers }
  }
  renderInSet(root, ctx, set, n, onProgress)
}

function renderInSet(root: HTMLElement, ctx: Ctx, set: PracticeSet, n: number, onProgress: () => void) {
  const { lang } = ctx
  const ex = set.exercises[n - 1]!
  const quiz = Boolean(set.sitting)

  mount(root, html`
    <div class="wrap">
      <div class="exercise${quiz ? ' quiz-mode' : ''}">
        <div class="ex-head">
          <div>
            <p class="kicker">${raw(set.kicker(n))}</p>
            <h1 class="h2">${raw(t(lang, `ex.title.${ex.kind}`))}</h1>
          </div>
          <nav class="steps" aria-label="${tText(lang, quiz ? 'chapter.quiz' : 'lesson.exercises')}"></nav>
        </div>
        <div class="split">
          <div class="task">
            <span class="type kind-${ex.kind}">${raw(t(lang, `kind.${ex.kind}`))}</span>
            <div class="prompt">${raw(ex.prompt[lang])}</div>
            <ul class="req"></ul>
            ${quiz
              ? html`<p class="quiz-note">${raw(t(lang, 'quiz.noFeedback'))}</p>`
              : html`<div class="hint" data-help>
              <div class="hint-levels" aria-live="polite">${ex.hints.map(h => html`<div class="hint-body" tabindex="-1" hidden>${raw(h[lang])}</div>`)}</div>
              <div class="hint-answer" tabindex="-1" aria-live="polite" hidden></div>
              <div class="hint-actions"></div>
              ${revisitLink(ctx, ex) ? html`<p>${revisitLink(ctx, ex)}</p>` : ''}
            </div>`}
          </div>
          <div class="work"></div>
        </div>
        <nav class="ex-pager" aria-label="${tText(lang, 'lesson.exercises')}"></nav>
      </div>
    </div>`)

  const env = { root, ctx, set, ex, n, onProgress, sql: () => '' } as Env
  renderSteps(env)
  renderPager(env)
  env.help = quiz ? NO_HELP : mountHelp(env)
  if (ex.kind === 'predict') renderPredict(env, ex)
  else void renderQuery(env, ex)
  window.scrollTo(0, 0)
}

interface Env {
  root: HTMLElement
  ctx: Ctx
  set: PracticeSet
  ex: Exercise
  n: number
  onProgress: () => void
  /** The learner's current SQL, recorded with a reveal. */
  sql: () => string
  help: Help
}

/** "Reread …": the lesson section this exercise practises, if it names one. */
function revisitLink(ctx: Ctx, ex: Exercise): Raw | undefined {
  const r = revisitOf(ex)
  const lesson = r && ctx.course.lessons[r.lesson]
  if (!lesson) return undefined
  const label = r.section ? sectionHeading(lesson, r.section, ctx.lang) : lesson.title[ctx.lang]
  return html`<a class="link" href="${href.lesson(lesson.id, r.section || undefined)}">${raw(t(ctx.lang, 'ex.back', { section: label }))}</a>`
}

/* ---------- hint ladder ---------- */

type Rung = 'hint' | 'more' | 'answer'
const RUNG_LABEL: Record<Rung, StringKey> = { hint: 'ex.hint', more: 'help.more', answer: 'help.answer' }

interface Help {
  /** The rung a button can open next, if any. */
  next(): Rung | undefined
  advance(focus?: boolean): void
  /** Redraw the button after a submission: Show answer may now be available. */
  refresh(): void
}

/** A quiz sitting has no help at all. */
const NO_HELP: Help = { next: () => undefined, advance() {}, refresh() {} }

/**
 * Show hint opens the first authored level, More help each next one, and
 * after the last comes Show answer (query exercises, once something has been
 * submitted): the reference solution and `explain`, recorded as a reveal.
 */
function mountHelp(env: Env): Help {
  const { root, ctx, ex } = env
  const lang = ctx.lang
  const box = $('[data-help]', root)
  let opened = 0
  let revealed = false

  const step = (): Rung | 'wait' | undefined => {
    if (opened < ex.hints.length) return opened === 0 ? 'hint' : 'more'
    if (ex.kind === 'predict' || revealed) return undefined
    return (ctx.status.get(ex.id)?.attempts ?? 0) > 0 ? 'answer' : 'wait'
  }

  const drawActions = () => {
    const s = step()
    mount($('.hint-actions', box), s === 'wait'
      ? html`<p class="hint-note">${raw(t(lang, 'help.answerLater'))}</p>`
      : s ? html`<button type="button" class="btn small" data-help-next>${raw(t(lang, RUNG_LABEL[s]))}</button>` : html``)
  }

  /** The bottom rung: the reference solution and `explain`, recorded as a wrong attempt. */
  const reveal = (query: QueryExercise): HTMLElement => {
    revealed = true
    const answer = $('.hint-answer', box)
    mount(answer, html`
      <h4>${raw(t(lang, 'answer.reference'))}</h4>
      ${codePane(query.solution)}
      ${query.explain ? html`<div class="hint-explain">${raw(query.explain[lang])}</div>` : ''}
      <p class="hint-note">${raw(t(lang, 'help.revealed'))}</p>`)
    answer.hidden = false
    void record(env, env.sql(), { correct: false, issues: [] }, true)
    return answer
  }

  const advance = (focus = false) => {
    const s = step()
    let shown: HTMLElement | undefined
    if (s === 'hint' || s === 'more') {
      shown = $$('.hint-body', box)[opened++]
      if (shown) shown.hidden = false
    } else if (s === 'answer' && ex.kind !== 'predict') shown = reveal(ex)
    drawActions()
    // Keep keyboard focus: on the next rung's button, or on what just opened.
    if (focus) ($$<HTMLButtonElement>('[data-help-next]', box)[0] ?? shown)?.focus()
  }

  box.addEventListener('click', e => {
    if ((e.target as HTMLElement).closest('[data-help-next]')) advance(true)
  })
  drawActions()
  return {
    next: () => { const s = step(); return s === 'wait' ? undefined : s },
    advance,
    refresh: drawActions,
  }
}

const codePane = (sql: string) => html`<pre class="code-pane"><code>${raw(highlightSql(sql))}</code></pre>`

/** One segment per exercise: solved / attempted, or in a sitting, answered (no right or wrong yet). */
function renderSteps(env: Env) {
  const { root, ctx, set, n } = env
  mount($('.steps', root), html`${set.exercises.map((e, i) => {
    let cls = ''
    let label = `${i + 1}. ${tText(ctx.lang, `kind.${e.kind}`)}`
    if (set.sitting) {
      if (set.sitting.answers.has(e.id)) { cls = 'answered'; label += ` · ${tText(ctx.lang, 'quiz.answered')}` }
    } else {
      const st = ctx.status.get(e.id)
      cls = st?.solved ? 'ok' : st ? 'bad' : ''
    }
    return html`<a class="${cls}" href="${set.href(i + 1)}" title="${label}" aria-label="${label}"${i + 1 === n ? raw(' aria-current="step"') : ''}></a>`
  })}`)
}

/**
 * Always-visible way on: previous / next exercise, and on the last one where
 * the set leads (the next lesson, the chapter page), or in a sitting, Finish.
 */
function renderPager(env: Env) {
  const { root, ctx, set, n } = env
  const lang = ctx.lang
  const total = set.exercises.length
  const left = n > 1
    ? html`<a class="btn" href="${set.href(n - 1)}">← ${raw(t(lang, 'ex.prev'))}</a>`
    : html`<a class="btn" href="${set.home.href}">← ${raw(set.home.label)}</a>`
  let right: Raw
  if (n < total) right = html`<a class="btn" href="${set.href(n + 1)}">${raw(t(lang, 'ex.next'))} →</a>`
  else if (set.sitting) right = html`<button type="button" class="btn primary" data-finish>${raw(t(lang, 'quiz.finish'))}</button>`
  else if (set.next) right = html`<a class="btn primary" href="${set.next.href}">${raw(set.next.pager)} →</a>`
  else right = html`<a class="btn" href="${href.map()}">${raw(t(lang, 'ex.backToMap'))}</a>`
  const pager = $('.ex-pager', root)
  mount(pager, html`${left}<span class="sp"></span>${right}`)
  wireFinish(env, pager)
}

/** Finish buttons in `el` end the sitting; with unanswered items, after one confirming click. */
function wireFinish(env: Env, el: HTMLElement) {
  const { ctx, set } = env
  const sitting = set.sitting
  if (!sitting) return
  for (const btn of $$<HTMLButtonElement>('[data-finish]', el)) {
    btn.addEventListener('click', async () => {
      const unanswered = set.exercises.filter(e => !sitting.answers.has(e.id)).length
      if (unanswered && !btn.dataset.confirmed) {
        btn.dataset.confirmed = '1'
        const warn = document.createElement('span')
        warn.className = 'quiz-warn'
        btn.before(warn)
        mount(warn, raw(t(ctx.lang, 'quiz.unanswered', { n: unanswered })))
        mount(btn, raw(t(ctx.lang, 'quiz.finishAnyway')))
        return
      }
      btn.disabled = true
      await ctx.progress.finishSitting(sitting.id)
      await ctx.refresh()
      location.hash = href.sitting(sitting.module, sitting.id)
    })
  }
}

/**
 * Record a submission (or, with `revealed`, a Show answer), refresh progress,
 * and say whether the lesson just completed.
 */
async function record(env: Env, submitted: string, grade: Pick<Grade, 'correct' | 'issues' | 'error'>, revealed = false) {
  const { ctx, ex, set } = env
  const { lessonCompleted } = await ctx.progress.recordAttempt({
    exerciseId: ex.id, lessonId: set.owner, kind: ex.kind, lang: ctx.lang, submitted,
    isCorrect: grade.correct, error: grade.error, issues: grade.issues, revealed, sittingId: set.sitting?.id,
  }, ctx.course)
  set.sitting?.answers.set(ex.id, { submitted, isCorrect: grade.correct })
  await ctx.refresh()
  renderSteps(env)
  renderPager(env)
  env.onProgress()
  env.help.refresh()
  return { lessonCompleted, attempts: ctx.status.get(ex.id)?.attempts ?? 1 }
}

/** The learner's SQL next to the reference solution, or one pane when they are the same. */
export function comparison(sql: string, ex: QueryExercise, lang: Lang) {
  const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/\s*;\s*$/, '').trim()
  if (norm(sql) === norm(ex.solution)) return html`<div class="compare"><h4>${raw(t(lang, 'answer.same'))}</h4>${codePane(sql)}</div>`
  return html`<div class="side-by-side">
    <div><h4>${raw(t(lang, 'answer.yours'))}</h4>${sql.trim() ? codePane(sql) : html`<p class="muted">${raw(t(lang, 'sitting.none'))}</p>`}</div>
    <div><h4>${raw(t(lang, 'answer.reference'))}</h4>${codePane(ex.solution)}</div>
  </div>`
}

function successFoot(env: Env, lessonCompleted: boolean): Raw {
  const { ctx, set, n } = env
  const lang = ctx.lang
  const items = set.exercises
  // The next unsolved exercise after this one, wrapping around to earlier ones.
  const unsolved = (from: number, to: number) => items.findIndex((e, i) => i >= from && i < to && !ctx.status.get(e.id)?.solved)
  const after = unsolved(n, items.length)
  const before = after === -1 ? unsolved(0, n - 1) : -1
  const nextIndex = after !== -1 ? after + 1 : before !== -1 ? before + 1 : n < items.length ? n + 1 : 0
  const setDone = set.lesson ? ctx.states[set.lesson.id] === 'done' : items.every(e => ctx.status.get(e.id)?.solved)
  const nextEx = html`<a class="btn primary" href="${set.href(nextIndex)}">${raw(t(lang, 'ex.next'))}</a>`
  const onward = set.next
    ? html`<a class="btn primary" href="${set.next.href}">${raw(set.next.foot)}</a>`
    : html`<a class="btn primary" href="${href.map()}">${raw(t(lang, 'ex.backToMap'))}</a>`
  const primary = !setDone && nextIndex ? nextEx : setDone && set.next ? onward : nextIndex ? nextEx : onward
  const note = lessonCompleted
    ? html`<div class="done-note">${raw(t(lang, set.next ? 'verdict.lessonDone' : 'verdict.courseDone'))}</div>`
    : ''
  return html`${note}<div class="verdict-foot">${primary}</div>`
}

/** Quiz mode's whole verdict: the answer is in, and the way on. */
function recordedVerdict(env: Env): Raw {
  const { ctx, set, n } = env
  const lang = ctx.lang
  const last = n >= set.exercises.length
  return html`<div class="verdict">
    <div class="verdict-top"><span class="badge rec">${raw(t(lang, 'quiz.recorded'))}</span></div>
    <div class="verdict-foot">${last
      ? html`<button type="button" class="btn primary" data-finish>${raw(t(lang, 'quiz.finish'))}</button>`
      : html`<a class="btn primary" href="${set.href(n + 1)}">${raw(t(lang, 'ex.next'))}</a>`}</div>
  </div>`
}

function showRecorded(env: Env, verdictEl: HTMLElement) {
  mount(verdictEl, recordedVerdict(env))
  wireFinish(env, verdictEl)
  verdictEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
}

/* ---------- write / debug / parsons ---------- */

async function renderQuery(env: Env, ex: QueryExercise) {
  const { root, ctx, set } = env
  const lang = ctx.lang
  const work = $('.work', root)
  const sitting = set.sitting
  // A sitting's draft is its own: the pre-test answer must not prefill the post-test.
  const draftId = sitting ? `${ex.id}@${sitting.id}` : ex.id

  // Requirements the grader checks, stated next to the task.
  const req: Raw[] = []
  if (ex.check.mode === 'tables') req.push(html`<li>${raw(t(lang, 'ex.req.tables', { tables: ex.check.tables.join(', ') }))}</li>`)
  else if (ex.check.mode === 'probe') req.push(html`<li>${raw(t(lang, 'ex.req.probe'))}<pre class="probe"><code>${raw(highlightSql(ex.check.probe ?? ''))}</code></pre></li>`)
  else if (ex.check.mode === 'attempts') req.push(html`<li>${raw(t(lang, 'ex.req.attempts'))}<pre class="probe"><code>${raw(highlightSql((ex.check.attempts ?? []).join('\n')))}</code></pre></li>`)
  else req.push(html`<li>${raw(t(lang, ex.check.orderMatters ? 'ex.req.ordered' : 'ex.req.unordered'))}</li>`)
  req.push(html`<li>${raw(t(lang, 'ex.req.dataset', { name: set.dataset }))}</li>`)
  mount($('.req', root), html`${req}`)
  if (ex.check.columnNames && ex.check.mode === 'result') {
    void ctx.engine.run(set.dataset, ex.solution).then(r => {
      const cols = [...r.results].reverse().find(x => x.columns.length)?.columns.map(c => c.name)
      if (!cols || !root.isConnected) return
      $('.req', root).insertAdjacentHTML('afterbegin', `<li>${t(lang, 'ex.req.columns', { cols: cols.join(', ') })}</li>`)
    })
  }

  const attempts = () => ctx.status.get(ex.id)?.attempts ?? 0
  const counter = (): Raw => sitting
    ? raw(sitting.answers.has(ex.id) ? t(lang, 'quiz.answered') : '')
    : raw(attempts() ? t(lang, 'ex.submitted', { n: attempts() }) : '')
  const bar = (extra: Raw = html``) => html`
    <div class="editor-bar">
      <button type="button" class="btn" data-run>${raw(t(lang, 'ex.run'))}</button>
      <button type="button" class="btn primary" data-submit>${raw(t(lang, 'ex.submit'))}</button>
      ${extra}
      <span class="sp" data-attempts>${counter()}</span>
    </div>`

  let getSql: () => string
  let editor: EditorHandle | undefined

  if (ex.kind === 'parsons') {
    mount(work, html`
      <div class="parsons">
        <div class="parsons-part"><div class="parsons-label">${raw(t(lang, 'ex.parsons.pool'))}</div><div class="pool"></div></div>
        <div class="parsons-part"><div class="parsons-label">${raw(t(lang, 'ex.parsons.answer'))}</div><ol class="answer"></ol></div>
        ${bar()}
      </div>
      <div class="panel-out" aria-live="polite"></div>
      <div data-verdict aria-live="polite"></div>`)
    getSql = mountParsons(work, ex, lang)
  } else {
    const starter = readDraft(draftId) ?? ex.starter
    mount(work, html`
      <div class="editor">
        <div class="editor-host"></div>
        ${bar(ex.starter || readDraft(draftId) ? html`<button type="button" class="btn ghost small" data-restore>${raw(t(lang, 'ex.reset'))}</button>` : html``)}
      </div>
      <div class="panel-out" aria-live="polite"></div>
      <div data-verdict aria-live="polite"></div>`)
    const schema = await schemaFor(ctx, set.dataset)
    if (!work.isConnected) return
    editor = createEditor($('.editor-host', work), {
      doc: starter, schema, gutter: true,
      placeholder: 'SELECT …',
      onRun: () => void run(), onSubmit: () => void submit(),
      onChange: text => writeDraft(draftId, text),
    })
    getSql = () => editor!.get()
    $$<HTMLButtonElement>('[data-restore]', work).forEach(b => b.addEventListener('click', () => { editor!.set(ex.starter); editor!.markError(undefined) }))
  }
  env.sql = () => getSql()

  const out = $('.panel-out', work)
  const verdictEl = $('[data-verdict]', work)
  const runBtn = $<HTMLButtonElement>('[data-run]', work)
  const submitBtn = $<HTMLButtonElement>('[data-submit]', work)

  const needAnswer = (sql: string) => {
    if (sql.trim()) return false
    mount(verdictEl, html`<div class="verdict"><div class="why">${raw(t(lang, 'ex.needAnswer'))}</div></div>`)
    return true
  }

  async function run() {
    editor?.closePopups()
    const sql = getSql()
    if (needAnswer(sql)) return
    runBtn.disabled = true
    try {
      const r = await ctx.engine.run(set.dataset, sql)
      editor?.markError(r.error?.position)
      mount(out, html`<div class="out">${runOutput(r, sql, lang)}</div>`)
    } finally { runBtn.disabled = false }
  }

  async function submit() {
    editor?.closePopups()
    const sql = getSql()
    if (needAnswer(sql)) return
    submitBtn.disabled = true
    try {
      if (sitting) {
        // Graded and kept for the results page; nothing about it shows now.
        const g = await ctx.engine.grade(set.dataset, sql, ex.solution, ex.check)
        mount(out, html``)
        await record(env, sql, g)
        mount($('[data-attempts]', work), counter())
        showRecorded(env, verdictEl)
        return
      }
      const g = await ctx.engine.grade(set.dataset, sql, ex.solution, ex.check, ex.traps.map(tr => tr.sql))
      editor?.markError(g.error?.position)
      mount(out, html``)
      const { lessonCompleted, attempts: count } = await record(env, sql, g)
      mount($('[data-attempts]', work), raw(t(lang, 'ex.submitted', { n: count })))
      const back = revisitLink(ctx, ex) ?? ''
      if (g.correct) {
        mount(verdictEl, html`<div class="verdict">
          <div class="verdict-top"><span class="badge ok">${raw(t(lang, 'verdict.correct'))}</span><span class="sum">${raw(t(lang, 'ex.attempt', { n: count }))}</span></div>
          ${comparison(sql, ex, lang)}
          ${ex.explain ? html`<div class="explain">${raw(ex.explain[lang])}</div>` : ''}
          ${successFoot(env, lessonCompleted)}
        </div>`)
      } else {
        const summary = g.expected && g.actual ? t(lang, 'verdict.summary', { expected: g.expected.rows.length, actual: g.actual.rows.length }) : t(lang, 'ex.attempt', { n: count })
        const say = g.trap === undefined ? undefined : ex.traps[g.trap]?.say[lang]
        const rung = env.help.next()
        mount(verdictEl, html`<div class="verdict">
          <div class="verdict-top"><span class="badge bad">${raw(t(lang, 'verdict.wrong'))}</span><span class="sum">${raw(summary)}</span></div>
          ${failureBody(g, sql, lang, say)}
          <div class="verdict-foot">
            ${rung ? html`<button type="button" class="btn" data-help-verdict>${raw(t(lang, RUNG_LABEL[rung]))}</button>` : ''}
            ${back}
          </div>
        </div>`)
        $$<HTMLButtonElement>('[data-help-verdict]', verdictEl).forEach(b => b.addEventListener('click', () => {
          env.help.advance()
          $('[data-help]', env.root).scrollIntoView({ behavior: 'smooth', block: 'center' })
          const after = env.help.next()
          if (after) mount(b, raw(t(lang, RUNG_LABEL[after])))
          else b.remove()
        }))
      }
      verdictEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    } finally { submitBtn.disabled = false }
  }

  runBtn.addEventListener('click', () => void run())
  submitBtn.addEventListener('click', () => void submit())
}

/** Click pieces into the answer, reorder or remove them. Returns the assembled SQL. */
function mountParsons(work: HTMLElement, ex: QueryExercise, lang: Ctx['lang']): () => string {
  const pieces = (ex.pieces ?? []).map((text, i) => ({ id: i, text }))
  let answer: number[] = []
  const pool = $('.pool', work)
  const list = $('.answer', work)

  const draw = () => {
    mount(pool, html`${pieces.filter(p => !answer.includes(p.id)).map(p => html`<button type="button" class="piece" data-add="${p.id}">${p.text}</button>`)}`)
    mount(list, answer.length
      ? html`${answer.map((id, i) => html`<li><span class="code">${raw(highlightSql(pieces[id]!.text))}</span><span class="tools">
          <button type="button" class="icon-btn" data-up="${i}" aria-label="${tText(lang, 'ex.parsons.up')}" ${i === 0 ? raw('disabled') : ''}>↑</button>
          <button type="button" class="icon-btn" data-down="${i}" aria-label="${tText(lang, 'ex.parsons.down')}" ${i === answer.length - 1 ? raw('disabled') : ''}>↓</button>
          <button type="button" class="icon-btn" data-remove="${i}" aria-label="${tText(lang, 'ex.parsons.remove')}">×</button>
        </span></li>`)}`
      : html`<li class="answer-empty">${raw(t(lang, 'ex.parsons.empty'))}</li>`)
  }
  pool.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-add]')
    if (b) { answer.push(Number(b.dataset.add)); draw() }
  })
  list.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLButtonElement>('button')
    if (!b) return
    const i = Number(b.dataset.up ?? b.dataset.down ?? b.dataset.remove)
    if (b.dataset.remove !== undefined) answer.splice(i, 1)
    else {
      const j = b.dataset.up !== undefined ? i - 1 : i + 1
      ;[answer[i], answer[j]] = [answer[j]!, answer[i]!]
    }
    draw()
  })
  draw()
  return () => answer.map(id => pieces[id]!.text).join('\n')
}

/* ---------- predict ---------- */

/** How a predict answer is recorded; `chosenIndex` reads it back. */
const predictAnswer = (choice: number, ex: PredictExercise) => `choice ${choice}: ${ex.choices[choice]!.en.replace(/<[^>]+>/g, '')}`
export const chosenIndex = (submitted: string): number | undefined => {
  const m = /^choice (\d+):/.exec(submitted)
  return m ? Number(m[1]) : undefined
}

function renderPredict(env: Env, ex: PredictExercise) {
  const { root, ctx, set } = env
  const lang = ctx.lang
  const sitting = set.sitting
  const locked = set.lockRun || Boolean(sitting)
  // In a sitting, Run stays locked: its result would give the answer away, and nothing is marked until the end.
  const before = sitting ? chosenIndex(sitting.answers.get(ex.id)?.submitted ?? '') : undefined
  mount($('.req', root), html`<li>${raw(t(lang, 'ex.req.dataset', { name: set.dataset }))}</li>`)
  const work = $('.work', root)
  mount(work, html`
    <div class="editor">
      <pre class="predict-query"><code>${raw(highlightSql(ex.query))}</code></pre>
      <fieldset class="choices" style="border:0;margin:0">
        <legend class="sr-only">${raw(t(lang, 'ex.predict.choose'))}</legend>
        ${ex.choices.map((c, i) => html`<label class="choice${i === before ? ' picked' : ''}"><input type="radio" name="choice" value="${i}"${i === before ? raw(' checked') : ''}><span>${raw(c[lang])}</span></label>`)}
      </fieldset>
      <div class="editor-bar">
        ${locked
          ? html`<button type="button" class="btn locked" data-run disabled>${raw(t(lang, 'ex.run'))}</button>`
          : html`<button type="button" class="btn" data-run>${raw(t(lang, 'ex.run'))}</button>`}
        <button type="button" class="btn primary" data-submit>${raw(t(lang, 'ex.submit'))}</button>
        <span class="sp" data-run-note>${sitting ? raw(t(lang, 'quiz.runLocked')) : locked ? raw(t(lang, 'answer.runLocked')) : ''}</span>
      </div>
    </div>
    <div data-verdict aria-live="polite"></div>
    <div class="panel-out" aria-live="polite"></div>`)

  const verdictEl = $('[data-verdict]', work)
  const labels = $$<HTMLLabelElement>('.choice', work)
  work.addEventListener('change', () => labels.forEach(l => l.classList.toggle('picked', l.querySelector('input')!.checked)))

  const runBtn = $<HTMLButtonElement>('[data-run]', work)
  const unlockRun = () => {
    if (!runBtn.classList.contains('locked')) return
    runBtn.classList.remove('locked')
    runBtn.disabled = false
    mount($('[data-run-note]', work), html``)
  }
  runBtn.addEventListener('click', async () => {
    runBtn.disabled = true
    try {
      const r = await ctx.engine.run(set.dataset, ex.query)
      mount($('.panel-out', work), html`<div class="out">${runOutput(r, ex.query, lang)}</div>`)
    } finally { runBtn.disabled = false }
  })

  $<HTMLButtonElement>('[data-submit]', work).addEventListener('click', async () => {
    const picked = work.querySelector<HTMLInputElement>('input[name="choice"]:checked')
    if (!picked) {
      mount(verdictEl, html`<div class="verdict"><div class="why">${raw(t(lang, 'ex.needAnswer'))}</div></div>`)
      return
    }
    const choice = Number(picked.value)
    const chosen = ex.choices[choice]!
    const correct = choice === ex.answer
    const { lessonCompleted } = await record(env, predictAnswer(choice, ex), { correct, issues: [] })
    if (sitting) { showRecorded(env, verdictEl); return }
    labels.forEach((l, i) => {
      l.classList.remove('picked', 'right', 'wrong')
      if (i === ex.answer && correct) l.classList.add('right')
      else if (i === choice && !correct) l.classList.add('wrong')
    })
    // Right or wrong: why this choice, then why the answer is what it is.
    const back = revisitLink(ctx, ex) ?? ''
    mount(verdictEl, html`<div class="verdict">
      <div class="verdict-top"><span class="badge ${correct ? 'ok' : 'bad'}">${raw(t(lang, correct ? 'verdict.correct' : 'verdict.wrong'))}</span></div>
      ${chosen.why ? html`<div class="choice-why"><p class="cw-label"><span>${raw(t(lang, 'answer.yourChoice'))}</span><span class="cw-choice">${raw(chosen[lang])}</span></p>${raw(chosen.why[lang])}</div>` : ''}
      <div class="explain">${raw(ex.explain[lang])}</div>
      ${correct ? successFoot(env, lessonCompleted) : html`<div class="verdict-foot">${back}</div>`}
    </div>`)
    unlockRun()
  })
}
