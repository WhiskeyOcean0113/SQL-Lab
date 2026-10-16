import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { gradeRuns } from '../src/engine/grade.ts'
import { PracticeDb } from '../src/engine/practice-db.ts'
import { compileTransactions, hasTransactionControl, splitStatements } from '../src/engine/sql-scan.ts'
import type { CheckSpec } from '../src/engine/types.ts'

const shop = readFileSync(new URL('../content/datasets/shop.sql', import.meta.url), 'utf8')
const query: CheckSpec = { mode: 'result', orderMatters: false, columnNames: false, tables: [] }
const ordered: CheckSpec = { ...query, orderMatters: true }

let db: PracticeDb
beforeAll(async () => { db = await PracticeDb.create(shop) }, 30_000)
afterAll(async () => { await db.close() })

async function grade(learner: string, solution: string, check = query) {
  const { expected, actual } = await db.runPair(learner, solution, check)
  return gradeRuns(expected, actual, check)
}

describe('sql-scan', () => {
  it('splits on semicolons outside strings, comments and dollar quotes', () => {
    const s = splitStatements(`SELECT 'a;b'; -- c;\nSELECT $x$;$x$ /* ; */; SELECT "q;"`)
    expect(s.map(x => x.keyword)).toEqual(['SELECT', 'SELECT', 'SELECT'])
  })
  it('finds transaction control after a comment', () => {
    expect(hasTransactionControl('SELECT 1; /* sneaky */ COMMIT;')).toBe(true)
    expect(hasTransactionControl("SELECT 'commit'")).toBe(false)
  })
  it('records where each statement starts', () => {
    expect(splitStatements('SELECT 1;\n  SELECT 2').map(s => s.start)).toEqual([0, 12])
  })
  it('maps a learner transaction onto a savepoint', () => {
    const steps = compileTransactions('BEGIN; UPDATE t SET x = 1; ROLLBACK; COMMIT; SAVEPOINT a')
    expect(steps.map(s => s.kind === 'internal' ? s.sql : s.kind === 'learner' ? 'learner' : s.code)).toEqual([
      'SAVEPOINT sqllab_txn',
      'learner',
      'ROLLBACK TO SAVEPOINT sqllab_txn; RELEASE SAVEPOINT sqllab_txn',
      '25P01',
    ])
  })
})

describe('PracticeDb', () => {
  it('returns rows as arrays and keeps duplicate column names', async () => {
    const r = await db.run('SELECT c.id, o.id FROM customers c JOIN orders o ON o.customer_id = c.id WHERE o.id = 1')
    expect(r.ok).toBe(true)
    expect(r.results[0]!.columns.map(c => c.name)).toEqual(['id', 'id'])
    expect(r.results[0]!.rows).toEqual([[1, 1]])
  })
  it('prints dates as Postgres text', async () => {
    const r = await db.run('SELECT joined_on, ordered_at FROM customers, orders WHERE customers.id = 1 AND orders.id = 1')
    expect(r.results[0]!.rows[0]).toEqual(['2023-01-14', '2024-01-05 09:12:00'])
  })
  it('rolls back every run', async () => {
    await db.run('DELETE FROM order_items')
    const r = await db.run('SELECT count(*) FROM order_items')
    expect(r.results[0]!.rows[0]![0]).toBe(42)
  })
  it('reports Postgres errors with SQLSTATE and position', async () => {
    const r = await db.run('SELECT city, name FROM customers GROUP BY city')
    expect(r.ok).toBe(false)
    expect(r.error?.code).toBe('42803')
    expect(r.error?.position).toBeGreaterThan(0)
  })
  it('runs a learner transaction inside its own', async () => {
    const rolledBack = await db.run('BEGIN; DELETE FROM order_items; ROLLBACK; SELECT count(*) FROM order_items')
    expect(rolledBack.results.at(-1)!.rows[0]![0]).toBe(42)
    const committed = await db.run('BEGIN; DELETE FROM order_items; COMMIT; SELECT count(*) FROM order_items')
    expect(committed.results.at(-1)!.rows[0]![0]).toBe(0)
    const after = await db.run('SELECT count(*) FROM order_items')
    expect(after.results[0]!.rows[0]![0]).toBe(42)
  })
  it('keeps savepoints and error positions working in a learner transaction', async () => {
    const r = await db.run("BEGIN; UPDATE products SET stock = 0; SAVEPOINT s; DELETE FROM order_items; ROLLBACK TO s; COMMIT; SELECT count(*) FROM order_items, (SELECT max(stock) AS m FROM products) p WHERE p.m = 0")
    expect(r.results.at(-1)!.rows[0]![0]).toBe(42)
    const sql = 'BEGIN;\nSELECT nme FROM customers;'
    const bad = await db.run(sql)
    expect(bad.error?.code).toBe('42703')
    expect(sql.slice(bad.error!.position! - 1, bad.error!.position! + 2)).toBe('nme')
  })
  it('refuses savepoints outside a transaction and PREPARE', async () => {
    expect((await db.run('SAVEPOINT a')).error?.code).toBe('25P01')
    expect((await db.run('PREPARE q AS SELECT 1')).error?.code).toBe('SQLLAB_TXN')
  })
})

describe('grading', () => {
  it('accepts a different query with the same result', async () => {
    const g = await grade(
      'SELECT name FROM customers WHERE country IN (\'China\')',
      "SELECT name FROM customers WHERE country = 'China'",
    )
    expect(g.correct).toBe(true)
  })
  it('ignores row order unless the task asks for it', async () => {
    const sol = 'SELECT id FROM products ORDER BY price DESC'
    expect((await grade('SELECT id FROM products', sol)).correct).toBe(true)
    const g = await grade('SELECT id FROM products', sol, ordered)
    expect(g.issues.map(i => i.code)).toEqual(['order'])
  })
  it('treats numeric scale as the same value', async () => {
    const g = await grade('SELECT 12.5 AS p', 'SELECT 12.50::numeric(6,2) AS p')
    expect(g.correct).toBe(true)
  })
  it('compares NULLs as equal cells', async () => {
    const g = await grade('SELECT city FROM customers WHERE id IN (8, 11)', 'SELECT NULL::text UNION ALL SELECT NULL')
    expect(g.correct).toBe(true)
  })
  it('flags missing DISTINCT as duplicates', async () => {
    const g = await grade('SELECT country FROM customers', 'SELECT DISTINCT country FROM customers')
    expect(g.issues.map(i => i.code)).toContain('duplicates')
  })
  it('flags a join without its condition as row explosion', async () => {
    const g = await grade(
      'SELECT o.id, c.name FROM orders o, customers c',
      'SELECT o.id, c.name FROM orders o JOIN customers c ON c.id = o.customer_id',
    )
    expect(g.issues.map(i => i.code)).toContain('row-explosion')
    expect(g.extra.length).toBeGreaterThan(0)
  })
  it('reports column count and column order separately', async () => {
    expect((await grade('SELECT id FROM products', 'SELECT id, name FROM products')).issues[0]!.code).toBe('column-count')
    expect((await grade('SELECT name, id FROM products', 'SELECT id, name FROM products')).issues[0]!.code).toBe('column-order')
  })
  it('lists the exact missing and extra rows', async () => {
    const g = await grade('SELECT id FROM customers WHERE id <= 3', 'SELECT id FROM customers WHERE id BETWEEN 2 AND 4')
    expect(g.missing.map(i => g.expected!.rows[i]![0])).toEqual([4])
    expect(g.extra.map(i => g.actual!.rows[i]![0])).toEqual([1])
  })
  it('grades data changes by table state', async () => {
    const check: CheckSpec = { mode: 'tables', orderMatters: false, columnNames: true, tables: ['products'] }
    const sol = 'UPDATE products SET stock = stock + 10 WHERE stock < 10'
    expect((await grade('UPDATE products SET stock = stock + 10 WHERE stock <= 9', sol, check)).correct).toBe(true)
    const g = await grade('UPDATE products SET stock = stock + 10', sol, check)
    expect(g.issues[0]).toEqual({ code: 'tables-differ', data: { table: 'products' } })
  })
  it('grades schema changes with a probe query', async () => {
    const check: CheckSpec = { mode: 'probe', orderMatters: false, columnNames: false, tables: [], probe: 'SELECT name FROM cheap' }
    const sol = 'CREATE VIEW cheap AS SELECT name, price FROM products WHERE price < 20'
    expect((await grade('CREATE VIEW cheap AS SELECT name FROM products WHERE price <= 19.99', sol, check)).correct).toBe(true)
    const wrong = await grade('CREATE VIEW cheap AS SELECT name FROM products WHERE price < 10', sol, check)
    expect(wrong.issues[0]!.code).toBe('probe-differs')
    const missing = await grade('SELECT 1', sol, check)
    expect(missing.error?.code).toBe('42P01')
  })
  it('passes the SQL error through', async () => {
    const g = await grade('SELECT nme FROM customers', 'SELECT name FROM customers')
    expect(g.issues[0]!.code).toBe('sql-error')
    expect(g.error?.code).toBe('42703')
  })
})
