// The built course, as the browser receives it from `virtual:content`.
// Produced by scripts/lib/build-content.ts from the files under content/.

import type { CheckSpec } from '../engine/types.ts'

export type Lang = 'zh' | 'en'
export const LANGS: Lang[] = ['zh', 'en']

/** A string in both languages. */
export type Bi = Record<Lang, string>

export interface Term {
  id: string
  en: string
  zh: string
}

/**
 * A title may contain glossary terms. `title` is plain text in the primary
 * language (document.title, breadcrumbs); `titleHtml` annotates the terms.
 */
export interface Titled {
  title: Bi
  titleHtml: Bi
}

export interface Module extends Titled {
  id: string
  summary: Bi
  lessons: string[]
  /** Lessons announced in the curriculum but not written yet. Shown, but cannot be opened. */
  planned: Titled[]
  /** The chapter quiz, a pre- and post-test (content/chapters/<id>/quiz/). Empty when there is none. */
  quiz: Exercise[]
  /** Chapter challenges: integrative problems (content/chapters/<id>/challenge/). */
  challenge: Exercise[]
  /** The dataset both sets run against: chapters/<id>/meta.yaml, default shop. */
  dataset: string
  /** Short intros shown above each set (rendered HTML). */
  intro: { quiz?: Bi; challenge?: Bi }
}

export type SetKind = 'quiz' | 'challenge'

/** What attempts record as `lesson_id` for a chapter set item; also the prefix of its exercise ids. */
export const chapterKey = (moduleId: string) => `chapter:${moduleId}`

/** One `## Heading {#id}` block of a lesson, already rendered to HTML. */
export interface Section {
  id: string
  heading: string
  html: string
}

export type ExerciseKind = 'write' | 'debug' | 'parsons' | 'predict'

interface ExerciseBase {
  /**
   * `<lesson id>/<file stem>`, e.g. `inner-join/01-match-orders`; for a chapter
   * set item `chapter:<module id>/<set>/<file stem>`, e.g. `chapter:m3/quiz/01-…`.
   */
  id: string
  /** The lesson it belongs to, or `chapter:<module id>` for a chapter set item. */
  lesson: string
  /** Set only on chapter set items. */
  set?: { module: string; kind: SetKind }
  kind: ExerciseKind
  difficulty: 1 | 2 | 3
  /** Rendered HTML in each language. */
  prompt: Bi
  /** The hint ladder's authored levels, general to specific (a legacy `hint` is one level). */
  hints: Bi[]
  /** Why the reference answer is right. Required for predict and in template-2 lessons. */
  explain?: Bi
  /**
   * Id of the lesson objective this exercise practises (template 2). On a
   * chapter set item, `<lesson id>/<objective id>`.
   */
  objective?: string
  /**
   * Section id in the lesson that this exercise practises. On a chapter set
   * item, `<lesson id>/<section id>`, `<lesson id>`, or empty.
   */
  lessonRef: string
}

/**
 * A known wrong query. When a submission's result matches it, the verdict
 * shows `say` (rendered HTML) above the usual diff.
 */
export interface Trap {
  sql: string
  say: Bi
}

export interface QueryExercise extends ExerciseBase {
  kind: 'write' | 'debug' | 'parsons'
  /** Editor contents on first open. For `debug`, the broken query. */
  starter: string
  solution: string
  check: CheckSpec
  /** For `parsons`: the solution's lines plus distractors, in display order. */
  pieces?: string[]
  traps: Trap[]
}

/** A predict option as inline HTML, with why it is right or wrong (template 2). */
export type Choice = Bi & { why?: Bi }

export interface PredictExercise extends ExerciseBase {
  kind: 'predict'
  /** The query the learner reads. They can run it at any time. */
  query: string
  choices: Choice[]
  answer: number
  /** Why the answer is right, shown after answering. */
  explain: Bi
  /** Row count `query` must return; validate checks it so the answer key cannot drift from the data. */
  verifyRows?: number
}

export type Exercise = QueryExercise | PredictExercise

/** What a learner can do after the lesson; `text` is inline HTML. */
export interface Objective {
  id: string
  text: Bi
}

export interface Lesson extends Titled {
  id: string
  module: string
  /** 2 for lessons written to the v2 template; 1 for legacy lessons. */
  template: 1 | 2
  summary: Bi
  objectives: Objective[]
  /** Words from `introduces` taught for recognition only, exempt from practice coverage. */
  reference: string[]
  dataset: string
  prereqs: string[]
  body: Record<Lang, Section[]>
  exercises: Exercise[]
}

export interface Course {
  modules: Module[]
  lessons: Record<string, Lesson>
  /** Lesson ids in the one order a learner must follow. */
  path: string[]
  glossary: Term[]
  datasets: Record<string, string>
}
