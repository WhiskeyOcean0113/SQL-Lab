import { highlightSql } from '../../content/highlight.ts'
import type { Exercise, Lang, Lesson, PredictExercise, QueryExercise } from '../../content/types.ts'
import type { Grade } from '../../engine/types.ts'
import { t, tText, type StringKey } from '../../i18n/index.ts'
import { href, notFound, sectionHeading, type Ctx } from '../app.ts'
import { $, $$, html, mount, raw, type Raw } from '../dom.ts'
import { createEditor, type EditorHandle } from '../editor.ts'
import { failureBody, runOutput } from '../results.ts'
import { schemaFor } from '../runner.ts'

// One exercise: the task on the left, the work on the right, and a verdict
// that says what is wrong and points back to the lesson section it practises.

const draftKey = (id: string) => `sql-lab:draft:${id}`
const readDraft = (id: string) => { try { return localStorage.getItem(draftKey(id)) } catch { return null } }
const writeDraft = (id: string, text: string) => { try { localStorage.setItem(draftKey(id), text) } catch { /* private mode */ } }

export function renderExercise(root: HTMLElement, ctx: Ctx, lessonId: string, n: number, onProgress: () => void) {
  const { course, lang } = ctx
  const lesson = course.lessons[lessonId]
  if (!lesson) return notFound(root, ctx, 'lesson.notFound')
  const ex = lesson.exercises[n - 1]
  if (!ex) return notFound(root, ctx, 'lesson.notFound')
  void ctx.progress.startLesson(lessonId)

  mount(root, html`
    <div class="wrap">
      <div class="exercise">
        <div class="ex-head">
          <div>
            <p class="kicker">${raw(t(lang, 'ex.kicker', { lesson: lesson.title[lang], n, total: lesson.exercises.length }))}</p>
            <h1 class="h2">${raw(t(lang, `ex.title.${ex.kind}`))}</h1>
          </div>
          <nav class="steps" aria-label="${tText(lang, 'lesson.exercises')}"></nav>
        </div>
        <div class="split">
          <div class="task">
            <span class="type kind-${ex.kind}">${raw(t(lang, `kind.${ex.kind}`))}</span>
            <div class="prompt">${raw(ex.prompt[lang])}</div>
            <ul class="req"></ul>
            <div class="hint" data-help>
              <div class="hint-levels" aria-live="polite">${ex.hints.map(h => html`<div class="hint-body" tabindex="-1" hidden>${raw(h[lang])}</div>`)}</div>
              <div class="hint-answer" tabindex="-1" aria-live="polite" hidden></div>
              <div class="hint-actions"></div>
              <p><a class="link" href="${href.lesson(lessonId, ex.lessonRef)}">${raw(t(lang, 'ex.back', { section: sectionHeading(lesson, ex.lessonRef, lang) }))}</a></p>
            </div>
          </div>
          <div class="work"></div>
        </div>
        <nav class="ex-pager" aria-label="${tText(lang, 'lesson.exercises')}"></nav>
      </div>
    </div>`)

  renderSteps(root, ctx, lesson, n)
  renderPager(root, ctx, lesson, n)

  const env = { root, ctx, lesson, ex, n, onProgress, sql: () => '' } as Env
  env.help = mountHelp(env)
  if (ex.kind === 'predict') renderPredict(env, ex)
  else void renderQuery(env, ex)
  window.scrollTo(0, 0)
}

interface Env {
  root: HTMLElement
  ctx: Ctx
  lesson: Lesson
  ex: Exercise
  n: number
  onProgress: () => void
  /** The learner's current SQL, recorded with a reveal. */
  sql: () => string
  help: Help
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

function renderSteps(root: HTMLElement, ctx: Ctx, lesson: Lesson, n: number) {
  mount($('.steps', root), html`${lesson.exercises.map((e, i) => {
    const st = ctx.status.get(e.id)
    const cls = st?.solved ? 'ok' : st ? 'bad' : ''
    const label = `${i + 1}. ${tText(ctx.lang, `kind.${e.kind}`)}`
    return html`<a class="${cls}" href="${href.practice(lesson.id, i + 1)}" title="${label}" aria-label="${label}"${i + 1 === n ? raw(' aria-current="step"') : ''}></a>`
  })}`)
}

/**
 * Always-visible way on: previous / next exercise, and on the last exercise the
 * next lesson.
 */
function renderPager(root: HTMLElement, ctx: Ctx, lesson: Lesson, n: number) {
  const lang = ctx.lang
  const total = lesson.exercises.length
  const nextId = ctx.course.path[ctx.course.path.indexOf(lesson.id) + 1]
  const next = nextId ? ctx.course.lessons[nextId] : undefined
  const left = n > 1
    ? html`<a class="btn" href="${href.practice(lesson.id, n - 1)}">← ${raw(t(lang, 'ex.prev'))}</a>`
    : html`<a class="btn" href="${href.lesson(lesson.id)}">← ${raw(t(lang, 'ex.backToLesson'))}</a>`
  let right: Raw
  if (n < total) {
    right = html`<a class="btn" href="${href.practice(lesson.id, n + 1)}">${raw(t(lang, 'ex.next'))} →</a>`
  } else if (!next) {
    right = html`<a class="btn" href="${href.map()}">${raw(t(lang, 'ex.backToMap'))}</a>`
  } else {
    right = html`<a class="btn primary" href="${href.lesson(next.id)}">${raw(t(lang, 'ex.nextLessonNamed', { title: next.title[lang] }))} →</a>`
  }
  mount($('.ex-pager', root), html`${left}<span class="sp"></span>${right}`)
}

/**
 * Record a submission (or, with `revealed`, a Show answer), refresh progress,
 * and say whether the lesson just completed.
 */
async function record(env: Env, submitted: string, grade: Pick<Grade, 'correct' | 'issues' | 'error'>, revealed = false) {
  const { ctx, ex, lesson } = env
  const { lessonCompleted } = await ctx.progress.recordAttempt({
    exerciseId: ex.id, lessonId: lesson.id, kind: ex.kind, lang: ctx.lang, submitted,
    isCorrect: grade.correct, error: grade.error, issues: grade.issues, revealed,
  }, ctx.course)
  await ctx.refresh()
  renderSteps(env.root, ctx, lesson, env.n)
  renderPager(env.root, ctx, lesson, env.n)
  env.onProgress()
  env.help.refresh()
  return { lessonCompleted, attempts: ctx.status.get(ex.id)?.attempts ?? 1 }
}

/** The learner's SQL next to the reference solution, or one pane when they are the same. */
function comparison(sql: string, ex: QueryExercise, lang: Lang) {
  const norm = (s: string) => s.replace(/\s+/g, ' ').replace(/\s*;\s*$/, '').trim()
  if (norm(sql) === norm(ex.solution)) return html`<div class="compare"><h4>${raw(t(lang, 'answer.same'))}</h4>${codePane(sql)}</div>`
  return html`<div class="side-by-side">
    <div><h4>${raw(t(lang, 'answer.yours'))}</h4>${codePane(sql)}</div>
    <div><h4>${raw(t(lang, 'answer.reference'))}</h4>${codePane(ex.solution)}</div>
  </div>`
}

function successFoot(env: Env, lessonCompleted: boolean): Raw {
  const { ctx, lesson, n } = env
  const lang = ctx.lang
  // The next unsolved exercise after this one, wrapping around to earlier ones.
  const unsolved = (from: number, to: number) => lesson.exercises.findIndex((e, i) => i >= from && i < to && !ctx.status.get(e.id)?.solved)
  const after = unsolved(n, lesson.exercises.length)
  const before = after === -1 ? unsolved(0, n - 1) : -1
  const nextIndex = after !== -1 ? after + 1 : before !== -1 ? before + 1 : n < lesson.exercises.length ? n + 1 : 0
  const nextLessonId = ctx.course.path[ctx.course.path.indexOf(lesson.id) + 1]
  const lessonDone = ctx.states[lesson.id] === 'done'
  const primary = !lessonDone && nextIndex
    ? html`<a class="btn primary" href="${href.practice(lesson.id, nextIndex)}">${raw(t(lang, 'ex.next'))}</a>`
    : lessonDone && nextLessonId
      ? html`<a class="btn primary" href="${href.lesson(nextLessonId)}">${raw(t(lang, 'ex.nextLesson'))}</a>`
      : nextIndex
        ? html`<a class="btn primary" href="${href.practice(lesson.id, nextIndex)}">${raw(t(lang, 'ex.next'))}</a>`
        : html`<a class="btn primary" href="${href.map()}">${raw(t(lang, 'ex.backToMap'))}</a>`
  const note = lessonCompleted ? html`<div class="done-note">${raw(t(lang, nextLessonId ? 'verdict.lessonDone' : 'verdict.courseDone'))}</div>` : ''
  return html`${note}<div class="verdict-foot">${primary}</div>`
}

/* ---------- write / debug / parsons ---------- */

async function renderQuery(env: Env, ex: QueryExercise) {
  const { root, ctx, lesson } = env
  const lang = ctx.lang
  const work = $('.work', root)

  // Requirements the grader checks, stated next to the task.
  const req: Raw[] = []
  if (ex.check.mode === 'tables') req.push(html`<li>${raw(t(lang, 'ex.req.tables', { tables: ex.check.tables.join(', ') }))}</li>`)
  else if (ex.check.mode === 'probe') req.push(html`<li>${raw(t(lang, 'ex.req.probe'))}<pre class="probe"><code>${raw(highlightSql(ex.check.probe ?? ''))}</code></pre></li>`)
  else if (ex.check.mode === 'attempts') req.push(html`<li>${raw(t(lang, 'ex.req.attempts'))}<pre class="probe"><code>${raw(highlightSql((ex.check.attempts ?? []).join('\n')))}</code></pre></li>`)
  else req.push(html`<li>${raw(t(lang, ex.check.orderMatters ? 'ex.req.ordered' : 'ex.req.unordered'))}</li>`)
  req.push(html`<li>${raw(t(lang, 'ex.req.dataset', { name: lesson.dataset }))}</li>`)
  mount($('.req', root), html`${req}`)
  if (ex.check.columnNames && ex.check.mode === 'result') {
    void ctx.engine.run(lesson.dataset, ex.solution).then(r => {
      const cols = [...r.results].reverse().find(x => x.columns.length)?.columns.map(c => c.name)
      if (!cols || !root.isConnected) return
      $('.req', root).insertAdjacentHTML('afterbegin', `<li>${t(lang, 'ex.req.columns', { cols: cols.join(', ') })}</li>`)
    })
  }

  const attempts = () => ctx.status.get(ex.id)?.attempts ?? 0
  const bar = (extra: Raw = html``) => html`
    <div class="editor-bar">
      <button type="button" class="btn" data-run>${raw(t(lang, 'ex.run'))}</button>
      <button type="button" class="btn primary" data-submit>${raw(t(lang, 'ex.submit'))}</button>
      ${extra}
      <span class="sp" data-attempts>${attempts() ? raw(t(lang, 'ex.submitted', { n: attempts() })) : ''}</span>
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
    const starter = readDraft(ex.id) ?? ex.starter
    mount(work, html`
      <div class="editor">
        <div class="editor-host"></div>
        ${bar(ex.starter || readDraft(ex.id) ? html`<button type="button" class="btn ghost small" data-restore>${raw(t(lang, 'ex.reset'))}</button>` : html``)}
      </div>
      <div class="panel-out" aria-live="polite"></div>
      <div data-verdict aria-live="polite"></div>`)
    const schema = await schemaFor(ctx, lesson.dataset)
    if (!work.isConnected) return
    editor = createEditor($('.editor-host', work), {
      doc: starter, schema, gutter: true,
      placeholder: 'SELECT …',
      onRun: () => void run(), onSubmit: () => void submit(),
      onChange: text => writeDraft(ex.id, text),
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
      const r = await ctx.engine.run(lesson.dataset, sql)
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
      const g = await ctx.engine.grade(lesson.dataset, sql, ex.solution, ex.check, ex.traps.map(tr => tr.sql))
      editor?.markError(g.error?.position)
      mount(out, html``)
      const { lessonCompleted, attempts: count } = await record(env, sql, g)
      mount($('[data-attempts]', work), raw(t(lang, 'ex.submitted', { n: count })))
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
            <a class="link" href="${href.lesson(lesson.id, ex.lessonRef)}">${raw(t(lang, 'ex.back', { section: sectionHeading(lesson, ex.lessonRef, lang) }))}</a>
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

function renderPredict(env: Env, ex: PredictExercise) {
  const { root, ctx, lesson } = env
  const lang = ctx.lang
  // Predict first, then run. Legacy lessons keep Run open: some of their prompts say "run the query below".
  const locked = lesson.template === 2
  mount($('.req', root), html`<li>${raw(t(lang, 'ex.req.dataset', { name: lesson.dataset }))}</li>`)
  const work = $('.work', root)
  mount(work, html`
    <div class="editor">
      <pre class="predict-query"><code>${raw(highlightSql(ex.query))}</code></pre>
      <fieldset class="choices" style="border:0;margin:0">
        <legend class="sr-only">${raw(t(lang, 'ex.predict.choose'))}</legend>
        ${ex.choices.map((c, i) => html`<label class="choice"><input type="radio" name="choice" value="${i}"><span>${raw(c[lang])}</span></label>`)}
      </fieldset>
      <div class="editor-bar">
        ${locked
          ? html`<button type="button" class="btn locked" data-run disabled>${raw(t(lang, 'ex.run'))}</button>`
          : html`<button type="button" class="btn" data-run>${raw(t(lang, 'ex.run'))}</button>`}
        <button type="button" class="btn primary" data-submit>${raw(t(lang, 'ex.submit'))}</button>
        <span class="sp" data-run-note>${locked ? raw(t(lang, 'answer.runLocked')) : ''}</span>
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
      const r = await ctx.engine.run(lesson.dataset, ex.query)
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
    const { lessonCompleted } = await record(env, `choice ${choice}: ${chosen.en.replace(/<[^>]+>/g, '')}`, { correct, issues: [] })
    labels.forEach((l, i) => {
      l.classList.remove('picked', 'right', 'wrong')
      if (i === ex.answer && correct) l.classList.add('right')
      else if (i === choice && !correct) l.classList.add('wrong')
    })
    // Right or wrong: why this choice, then why the answer is what it is.
    mount(verdictEl, html`<div class="verdict">
      <div class="verdict-top"><span class="badge ${correct ? 'ok' : 'bad'}">${raw(t(lang, correct ? 'verdict.correct' : 'verdict.wrong'))}</span></div>
      ${chosen.why ? html`<div class="choice-why"><p class="cw-label"><span>${raw(t(lang, 'answer.yourChoice'))}</span><span class="cw-choice">${raw(chosen[lang])}</span></p>${raw(chosen.why[lang])}</div>` : ''}
      <div class="explain">${raw(ex.explain[lang])}</div>
      ${correct ? successFoot(env, lessonCompleted) : html`<div class="verdict-foot">
        <a class="link" href="${href.lesson(lesson.id, ex.lessonRef)}">${raw(t(lang, 'ex.back', { section: sectionHeading(lesson, ex.lessonRef, lang) }))}</a>
      </div>`}
    </div>`)
    unlockRun()
  })
}
