-- A learner database as schema version 2 left it (SCHEMA_SQL before sittings),
-- with a little history, so tests can check that migrating keeps everything.

CREATE TABLE IF NOT EXISTS settings (
  key    text PRIMARY KEY,
  value  text NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_progress (
  lesson_id   text        PRIMARY KEY,
  status      text        NOT NULL CHECK (status IN ('reading', 'done')),
  started_at  timestamptz NOT NULL DEFAULT now(),
  done_at     timestamptz
);

-- Every submission, right or wrong, exactly as written. A reveal (Show answer)
-- is recorded as a wrong attempt with revealed = true: the exercise enters the
-- mistake bank and is solved only by a later correct submission.
CREATE TABLE IF NOT EXISTS attempts (
  id           bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  exercise_id  text        NOT NULL,
  lesson_id    text        NOT NULL,
  kind         text        NOT NULL,
  lang         text        NOT NULL,
  submitted    text        NOT NULL,
  is_correct   boolean     NOT NULL,
  error        text,
  error_code   text,
  issues       jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  revealed     boolean     NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS attempts_exercise_idx ON attempts (exercise_id, id);

-- The learner's own words on why they got something wrong.
CREATE TABLE IF NOT EXISTS mistake_notes (
  exercise_id  text        PRIMARY KEY,
  note         text        NOT NULL,
  updated_at   timestamptz NOT NULL DEFAULT now()
);

INSERT INTO settings (key, value) VALUES
  ('lang', 'zh'),
  ('mastery_streak', '2')
ON CONFLICT (key) DO NOTHING;

-- An exercise enters the bank the first time it is answered wrong (or its
-- answer is revealed), and counts as mastered once it has been answered right
-- mastery_streak times in a row since the most recent wrong answer.
-- New columns go at the end: CREATE OR REPLACE VIEW can only append.
CREATE OR REPLACE VIEW mistake_bank AS
WITH wrong AS (
  SELECT exercise_id,
         min(lesson_id)  AS lesson_id,
         count(*)        AS wrong_count,
         max(id)         AS last_wrong_id,
         max(created_at) AS last_wrong_at,
         bool_or(revealed) AS revealed
  FROM attempts
  WHERE NOT is_correct
  GROUP BY exercise_id
), streak AS (
  SELECT w.exercise_id, count(a.id) AS correct_streak
  FROM wrong w
  LEFT JOIN attempts a
    ON a.exercise_id = w.exercise_id AND a.id > w.last_wrong_id
  GROUP BY w.exercise_id
)
SELECT w.exercise_id,
       w.lesson_id,
       w.wrong_count,
       w.last_wrong_at,
       s.correct_streak,
       s.correct_streak >= (SELECT value::int FROM settings WHERE key = 'mastery_streak') AS mastered,
       n.note,
       w.revealed
FROM wrong w
JOIN streak s USING (exercise_id)
LEFT JOIN mistake_notes n USING (exercise_id);

INSERT INTO settings (key, value) VALUES ('schema_version', '2');
INSERT INTO lesson_progress (lesson_id, status, done_at) VALUES ('basics', 'done', '2026-09-01 10:00:00+00');
INSERT INTO attempts (exercise_id, lesson_id, kind, lang, submitted, is_correct, error, error_code, revealed) VALUES
  ('basics/02-fix', 'basics', 'debug', 'en', 'SELECT nam FROM pets', false, 'column "nam" does not exist', '42703', false),
  ('basics/02-fix', 'basics', 'debug', 'en', '', false, NULL, NULL, true),
  ('basics/02-fix', 'basics', 'debug', 'en', 'SELECT name FROM pets', true, NULL, NULL, false);
