/// <reference lib="webworker" />
// Runs learner SQL off the main thread. If a query never returns (an endless
// recursive CTE, a huge cross join), the page terminates this worker and
// starts a fresh one; nothing else is lost.

import { gradeRuns } from './grade.ts'
import { PracticeDb } from './practice-db.ts'
import type { CheckSpec } from './types.ts'

export type WorkerRequest =
  | { id: number; op: 'run'; dataset: string; datasetSql: string; sql: string }
  | { id: number; op: 'grade'; dataset: string; datasetSql: string; learner: string; solution: string; check: CheckSpec }
  | { id: number; op: 'schema'; dataset: string; datasetSql: string }

const dbs = new Map<string, Promise<PracticeDb>>()

function dbFor(dataset: string, sql: string) {
  let db = dbs.get(dataset)
  if (!db) {
    db = PracticeDb.create(sql)
    dbs.set(dataset, db)
  }
  return db
}

const SCHEMA_SQL = `
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_schema = 'public'
  ORDER BY table_name, ordinal_position`

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const req = e.data
  try {
    const db = await dbFor(req.dataset, req.datasetSql)
    if (req.op === 'run') {
      postMessage({ id: req.id, ok: true, value: await db.run(req.sql) })
    } else if (req.op === 'grade') {
      const { expected, actual } = await db.runPair(req.learner, req.solution, req.check)
      postMessage({ id: req.id, ok: true, value: gradeRuns(expected, actual, req.check) })
    } else {
      const r = await db.run(SCHEMA_SQL, { limit: Infinity })
      const schema: Record<string, string[]> = {}
      for (const [t, c] of r.results[0]?.rows ?? []) (schema[String(t)] ??= []).push(String(c))
      postMessage({ id: req.id, ok: true, value: schema })
    }
  } catch (err) {
    postMessage({ id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}
