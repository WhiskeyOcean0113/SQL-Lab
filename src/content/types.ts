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

export interface Module {
  id: string
  title: Bi
  summary: Bi
  lessons: string[]
  /** Lessons announced in the curriculum but not written yet. Shown, never unlockable. */
  planned: Bi[]
}

/** One `## Heading {#id}` block of a lesson, already rendered to HTML. */
export interface Section {
  id: string
  heading: string
  html: string
}

export type ExerciseKind = 'write' | 'debug' | 'parsons' | 'predict'

interface ExerciseBase {
  /** `<lesson id>/<file stem>`, e.g. `inner-join/01-match-orders`. */
  id: string
  lesson: string
  kind: ExerciseKind
  difficulty: 1 | 2 | 3
  /** Rendered HTML in each language. */
  prompt: Bi
  hint: Bi
  /** Section id in the lesson that this exercise practises. */
  lessonRef: string
}

export interface QueryExercise extends ExerciseBase {
  kind: 'write' | 'debug' | 'parsons'
  /** Editor contents on first open. For `debug`, the broken query. */
  starter: string
  solution: string
  check: CheckSpec
  /** For `parsons`: the solution's lines plus distractors, in display order. */
  pieces?: string[]
}

export interface PredictExercise extends ExerciseBase {
  kind: 'predict'
  /** The query the learner reads. They can run it after answering. */
  query: string
  choices: Bi[]
  answer: number
  /** Why the answer is right, shown after answering. */
  explain: Bi
}

export type Exercise = QueryExercise | PredictExercise

export interface Lesson {
  id: string
  module: string
  title: Bi
  summary: Bi
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
