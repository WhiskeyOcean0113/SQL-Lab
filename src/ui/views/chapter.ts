import { highlightSql } from '../../content/highlight.ts'
import type { Exercise, Lang, Module } from '../../content/types.ts'
import { t, tText } from '../../i18n/index.ts'
import { scoreSitting, type Score, type Sitting, type SittingAnswer } from '../../state/progress.ts'
import { exerciseBar, hasSets, href, notFound, type Ctx } from '../app.ts'
import { $$, html, mount, pad2, raw, type Raw } from '../dom.ts'
import { chosenIndex, comparison } from './exercise.ts'
import { chapterNo } from './map.ts'

// A chapter's own page: the quiz (a pre- and post-test) with its past sittings
// and the per-objective comparison of the first and the latest, then the
// chapter challenges. And one sitting's results: score, every item right or
// wrong, its solution and explain.

const fmtDate = (d: Date, lang: Lang) => d.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' })
const fmtScore = (s: Score) => `${s.correct} / ${s.total}`

/** The quiz's objectives in lesson order, each with its text and lesson. */
function objectivesOf(ctx: Ctx, mod: Module) {
  const out: { id: string; text: string; lesson: string }[] = []
  for (const l of mod.lessons) {
    const lesson = ctx.course.lessons[l]
    for (const o of lesson?.objectives ?? []) {
      const id = `${l}/${o.id}`
      if (mod.quiz.some(e => e.objective === id)) out.push({ id, text: o.text[ctx.lang], lesson: lesson!.title[ctx.lang] })
    }
  }
  return out
}

/** "Before reading", "After the chapter", or how many lessons were done. */
function phase(lang: Lang, s: Sitting, total: number): string {
  if (s.lessonsDone === 0) return t(lang, 'chapter.phase.before')
  if (s.lessonsDone >= total) return t(lang, 'chapter.phase.after')
  return t(lang, 'chapter.lessonsDone', { n: s.lessonsDone, total })
}

export async function renderChapter(root: HTMLElement, ctx: Ctx, moduleId: string) {
  const { course, lang, progress } = ctx
  const mod = course.modules.find(m => m.id === moduleId)
  if (!mod || !hasSets(mod)) return notFound(root, ctx, 'chapter.notFound')
  const hash = location.hash
  const sittings = mod.quiz.length ? await progress.sittings(mod.id, mod.lessons) : []
  const answers = new Map(await Promise.all(sittings.map(async s => [s.id, await progress.sittingAnswers(s.id)] as const)))
  if (location.hash !== hash) return // the learner has moved on

  const open = sittings.find(s => !s.finishedAt)
  const finished = sittings.filter(s => s.finishedAt)
  const scored = finished.map(s => ({ s, score: scoreSitting(mod.quiz, answers.get(s.id)!) }))
  const first = scored[0]
  const latest = scored.length > 1 ? scored.at(-1) : undefined
  const objectives = objectivesOf(ctx, mod)
  const openAnswers = open ? answers.get(open.id)! : undefined
  const firstOpen = openAnswers ? Math.max(1, mod.quiz.findIndex(e => !openAnswers.has(e.id)) + 1) : 1

  const quiz = mod.quiz.length ? html`
    <section class="ch-sec" id="quiz" aria-labelledby="quiz-h">
      <h2 id="quiz-h">${raw(t(lang, 'chapter.quiz'))}</h2>
      ${mod.intro.quiz ? html`<div class="ch-intro">${raw(mod.intro.quiz[lang])}</div>` : ''}
      <p class="ch-lead">${raw(t(lang, 'chapter.quizLead', { n: mod.quiz.length }))}</p>
      <div class="ch-actions">
        ${open
          ? html`<a class="btn primary" href="${href.set(mod.id, 'quiz', firstOpen)}">${raw(t(lang, 'chapter.quizContinue', { done: openAnswers!.size, total: mod.quiz.length }))}</a>
            <button type="button" class="btn" data-finish-open>${raw(t(lang, 'quiz.finish'))}</button>`
          : html`<button type="button" class="btn primary" data-start>${raw(t(lang, finished.length ? 'chapter.quizAgain' : 'chapter.quizStart'))}</button>`}
      </div>

      <h3>${raw(t(lang, 'chapter.sittings'))}</h3>
      ${sittings.length ? html`
      <div class="ch-table">
        <table>
          <thead><tr><th>${raw(t(lang, 'chapter.col.date'))}</th><th>${raw(t(lang, 'chapter.col.when'))}</th><th class="r">${raw(t(lang, 'chapter.col.score'))}</th><th></th></tr></thead>
          <tbody>${sittings.map(s => {
            const score = s.finishedAt ? scoreSitting(mod.quiz, answers.get(s.id)!) : undefined
            return html`<tr>
              <td>${fmtDate(s.startedAt, lang)}</td>
              <td>${raw(phase(lang, s, mod.lessons.length))}</td>
              <td class="r score">${score ? fmtScore(score) : raw(t(lang, 'chapter.inProgress'))}</td>
              <td class="actions">${score
                ? html`<a class="link" href="${href.sitting(mod.id, s.id)}">${raw(t(lang, 'chapter.review'))}</a>`
                : html`<a class="link" href="${href.set(mod.id, 'quiz', firstOpen)}">${raw(t(lang, 'chapter.continue'))}</a>`}</td>
            </tr>`
          })}</tbody>
        </table>
      </div>` : html`<p class="ch-none">${raw(t(lang, 'chapter.noSittings'))}</p>`}

      ${first ? html`
      <h3>${raw(t(lang, 'chapter.compare'))}</h3>
      <div class="ch-table">
        <table class="compare-table">
          <thead><tr>
            <th>${raw(t(lang, 'chapter.col.objective'))}</th>
            <th class="r">${raw(t(lang, 'chapter.col.first'))}<span class="th-sub">${fmtDate(first.s.startedAt, lang)}</span></th>
            ${latest ? html`<th class="r">${raw(t(lang, 'chapter.col.latest'))}<span class="th-sub">${fmtDate(latest.s.startedAt, lang)}</span></th>` : ''}
          </tr></thead>
          <tbody>
            <tr class="total"><td>${raw(t(lang, 'chapter.allItems'))}</td><td class="r score">${fmtScore(first.score)}</td>${latest ? html`<td class="r score">${fmtScore(latest.score)}</td>` : ''}</tr>
            ${objectives.map(o => html`<tr>
              <td><div class="ttl">${raw(o.text)}</div><div class="ex-l">${o.lesson}</div></td>
              <td class="r score">${fmtScore(first.score.byObjective.get(o.id) ?? { correct: 0, total: 0 })}</td>
              ${latest ? html`<td class="r score">${fmtScore(latest.score.byObjective.get(o.id) ?? { correct: 0, total: 0 })}</td>` : ''}
            </tr>`)}
          </tbody>
        </table>
      </div>
      ${latest ? '' : html`<p class="ch-none">${raw(t(lang, 'chapter.compareOne'))}</p>`}` : ''}
    </section>` : ''

  const challenge = mod.challenge.length ? html`
    <section class="ch-sec" id="challenge" aria-labelledby="challenge-h">
      <h2 id="challenge-h">${raw(t(lang, 'chapter.challenge'))}</h2>
      ${mod.intro.challenge ? html`<div class="ch-intro">${raw(mod.intro.challenge[lang])}</div>` : ''}
      <p class="ch-lead">${raw(t(lang, 'chapter.challengeLead'))}</p>
      <div class="next-bar">${exerciseBar(ctx, { exercises: mod.challenge })}</div>
      <ol class="ch-list">${mod.challenge.map((e, i) => {
        const st = ctx.status.get(e.id)
        return html`<li><a href="${href.set(mod.id, 'challenge', i + 1)}">
          <span class="no">${pad2(i + 1)}</span>
          <span class="ch-prompt">${excerpt(e, lang)}</span>
          <span class="type kind-${e.kind}">${raw(t(lang, `kind.${e.kind}`))}</span>
          <span class="pip ${st?.solved ? 'ok' : st ? 'bad' : ''}" aria-label="${tText(lang, st?.solved ? 'chapter.solved' : st ? 'chapter.attempted' : 'chapter.untouched')}"></span>
        </a></li>`
      })}</ol>
    </section>` : ''

  mount(root, html`
    <div class="wrap">
      <div class="chapter">
        <header class="lesson-head">
          <p class="kicker">${raw(t(lang, 'map.chapter', { n: chapterNo(mod.id) }))}</p>
          <h1 class="display ttl">${raw(mod.titleHtml[lang])}</h1>
          <p class="lede">${mod.summary[lang]}</p>
          <div class="facts">
            <span>${raw(t(lang, 'lesson.dataset'))} <b>${mod.dataset}</b></span>
            <span>${raw(t(lang, 'chapter.lessons'))} <b>${mod.lessons.map(l => course.lessons[l]?.title[lang] ?? l).join(lang === 'zh' ? '、' : ', ')}</b></span>
          </div>
        </header>
        ${quiz}
        ${challenge}
        <div class="lesson-foot"><a class="btn" href="${href.map()}">${raw(t(lang, 'ex.backToMap'))}</a></div>
      </div>
    </div>`)

  for (const b of $$<HTMLButtonElement>('[data-start]', root)) {
    b.addEventListener('click', async () => {
      b.disabled = true
      await progress.startSitting(mod.id)
      await ctx.refresh()
      location.hash = href.set(mod.id, 'quiz', 1)
    })
  }
  for (const b of $$<HTMLButtonElement>('[data-finish-open]', root)) {
    b.addEventListener('click', async () => {
      const unanswered = mod.quiz.length - (openAnswers?.size ?? 0)
      if (unanswered && !b.dataset.confirmed) {
        b.dataset.confirmed = '1'
        const warn = document.createElement('span')
        warn.className = 'quiz-warn'
        b.after(warn)
        mount(warn, raw(t(lang, 'quiz.unanswered', { n: unanswered })))
        mount(b, raw(t(lang, 'quiz.finishAnyway')))
        return
      }
      b.disabled = true
      await progress.finishSitting(open!.id)
      await ctx.refresh()
      location.hash = href.sitting(mod.id, open!.id)
    })
  }
  window.scrollTo(0, 0)
}

const excerpt = (e: Exercise, lang: Lang) => {
  const text = e.prompt[lang].replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim()
  return text.length > 90 ? text.slice(0, 88) + '…' : text
}

/** `#/chapter/<module>/sitting/<id>`: one finished sitting, item by item. */
export async function renderSitting(root: HTMLElement, ctx: Ctx, moduleId: string, sittingId: number) {
  const { course, lang, progress } = ctx
  const mod = course.modules.find(m => m.id === moduleId)
  if (!mod || !mod.quiz.length) return notFound(root, ctx, 'chapter.notFound')
  const hash = location.hash
  const sitting = await progress.sitting(mod.id, sittingId, mod.lessons)
  const answers = sitting ? await progress.sittingAnswers(sitting.id) : new Map<string, SittingAnswer>()
  if (location.hash !== hash) return
  if (!sitting) return notFound(root, ctx, 'chapter.notFound')
  const chapter = tText(lang, 'map.chapter', { n: chapterNo(mod.id) })

  if (!sitting.finishedAt) {
    const firstOpen = Math.max(1, mod.quiz.findIndex(e => !answers.has(e.id)) + 1)
    mount(root, html`<div class="wrap"><div class="empty">${raw(t(lang, 'sitting.inProgress'))}<p><a class="btn primary" href="${href.set(mod.id, 'quiz', firstOpen)}">${raw(t(lang, 'chapter.continue'))}</a></p></div></div>`)
    return
  }

  const score = scoreSitting(mod.quiz, answers)
  const objectives = objectivesOf(ctx, mod)
  mount(root, html`
    <div class="wrap">
      <div class="chapter">
        <header class="lesson-head">
          <p class="kicker">${chapter} · ${raw(t(lang, 'chapter.quiz'))} · ${fmtDate(sitting.startedAt, lang)} · ${raw(phase(lang, sitting, mod.lessons.length))}</p>
          <h1 class="display">${raw(t(lang, 'sitting.title'))}</h1>
          <p class="sit-score"><span class="score">${fmtScore(score)}</span><span class="muted">${raw(t(lang, 'sitting.score', { correct: score.correct, total: score.total }))}</span></p>
        </header>

        <section class="ch-sec">
          <h2>${raw(t(lang, 'chapter.compare'))}</h2>
          <div class="ch-table"><table class="compare-table">
            <thead><tr><th>${raw(t(lang, 'chapter.col.objective'))}</th><th class="r">${raw(t(lang, 'chapter.col.score'))}</th></tr></thead>
            <tbody>${objectives.map(o => html`<tr>
              <td><div class="ttl">${raw(o.text)}</div><div class="ex-l">${o.lesson}</div></td>
              <td class="r score">${fmtScore(score.byObjective.get(o.id) ?? { correct: 0, total: 0 })}</td>
            </tr>`)}</tbody>
          </table></div>
        </section>

        <section class="ch-sec">
          <h2>${raw(t(lang, 'sitting.items'))}</h2>
          <ol class="sit-items">${mod.quiz.map((ex, i) => sittingItem(ex, i, answers.get(ex.id), lang))}</ol>
        </section>

        <div class="lesson-foot"><a class="btn primary" href="${href.chapter(mod.id)}">${raw(t(lang, 'quiz.toChapter'))}</a></div>
      </div>
    </div>`)
  window.scrollTo(0, 0)
}

/** One quiz item after the sitting: right or wrong (in words, not only colour), the answers, and why. */
function sittingItem(ex: Exercise, i: number, answer: SittingAnswer | undefined, lang: Lang): Raw {
  const state = !answer ? 'skipped' : answer.isCorrect ? 'right' : 'wrong'
  const badge = html`<span class="badge ${state === 'right' ? 'ok' : 'bad'}">${raw(t(lang, `sitting.${state}`))}</span>`
  let body: Raw
  if (ex.kind === 'predict') {
    const picked = answer ? chosenIndex(answer.submitted) : undefined
    const chosen = picked === undefined ? undefined : ex.choices[picked]
    body = html`
      <pre class="code-pane"><code>${raw(highlightSql(ex.query))}</code></pre>
      <div class="sit-choices">
        <p><span class="cw-label">${raw(t(lang, 'answer.yourChoice'))}</span> ${chosen ? html`<span class="${state === 'wrong' ? 'struck' : ''}">${raw(chosen[lang])}</span>` : raw(t(lang, 'sitting.none'))}</p>
        ${state !== 'right' ? html`<p><span class="cw-label">${raw(t(lang, 'check.answer'))}</span> ${raw(ex.choices[ex.answer]![lang])}</p>` : ''}
        ${chosen?.why ? html`<div class="sit-why">${raw(chosen.why[lang])}</div>` : ''}
      </div>`
  } else {
    body = comparison(answer?.submitted ?? '', ex, lang)
  }
  return html`<li class="sit-item ${state}">
    <div class="sit-top"><span class="no">${pad2(i + 1)}</span><span class="type kind-${ex.kind}">${raw(t(lang, `kind.${ex.kind}`))}</span>${badge}</div>
    <div class="prompt">${raw(ex.prompt[lang])}</div>
    ${body}
    ${ex.explain ? html`<div class="explain">${raw(ex.explain[lang])}</div>` : ''}
  </li>`
}

