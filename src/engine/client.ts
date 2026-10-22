import type { CheckSpec, Grade, RunOutcome } from './types.ts'
import type { WorkerRequest } from './worker.ts'

// Main-thread handle on the SQL worker. One request at a time is enough for a
// single learner; a timeout kills the worker so a runaway query cannot freeze
// the page.

const TIMEOUT_MS = 8000

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void; timer: number }

export class TimeoutError extends Error {}

type Body<T> = T extends unknown ? Omit<T, 'id' | 'datasetSql'> : never

export class Engine {
  private worker!: Worker
  private seq = 0
  private pending = new Map<number, Pending>()

  constructor(private datasets: Record<string, string>) {
    this.spawn()
  }

  private spawn() {
    this.worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' })
    this.worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; value?: unknown; error?: string }>) => {
      const p = this.pending.get(e.data.id)
      if (!p) return
      clearTimeout(p.timer)
      this.pending.delete(e.data.id)
      if (e.data.ok) p.resolve(e.data.value)
      else p.reject(new Error(e.data.error))
    }
  }

  private send<T>(body: Body<WorkerRequest>): Promise<T> {
    const id = ++this.seq
    const datasetSql = this.datasets[body.dataset]
    if (datasetSql === undefined) return Promise.reject(new Error(`Unknown dataset ${body.dataset}`))
    return new Promise<T>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id)
        this.restart()
        reject(new TimeoutError(`Query took longer than ${TIMEOUT_MS / 1000} s`))
      }, TIMEOUT_MS)
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer })
      this.worker.postMessage({ ...body, id, datasetSql } as WorkerRequest)
    })
  }

  private restart() {
    this.worker.terminate()
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Engine restarted')) }
    this.pending.clear()
    this.spawn()
  }

  /** Start the database for a dataset early, so the first Run is fast. */
  warm(dataset: string) {
    return this.schema(dataset).catch(() => undefined)
  }

  async run(dataset: string, sql: string): Promise<RunOutcome> {
    try {
      return await this.send<RunOutcome>({ op: 'run', dataset, sql })
    } catch (e) {
      if (e instanceof TimeoutError) return { ok: false, results: [], ms: TIMEOUT_MS, error: { message: e.message, code: 'SQLLAB_TIMEOUT' } }
      throw e
    }
  }

  /** Grade a submission; `traps` are known wrong queries, matched only when the answer is wrong. */
  async grade(dataset: string, learner: string, solution: string, check: CheckSpec, traps: string[] = []): Promise<Grade> {
    try {
      return await this.send<Grade>({ op: 'grade', dataset, learner, solution, check, traps })
    } catch (e) {
      if (e instanceof TimeoutError) {
        return { correct: false, issues: [{ code: 'sql-error' }], error: { message: e.message, code: 'SQLLAB_TIMEOUT' }, missing: [], extra: [] }
      }
      throw e
    }
  }

  schema(dataset: string) {
    return this.send<Record<string, string[]>>({ op: 'schema', dataset })
  }
}
