CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  emp_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE answerers (
  emp_no TEXT PRIMARY KEY
);

CREATE TABLE questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  program_id TEXT NOT NULL CHECK (
    length(program_id) > 0 AND (
      program_id GLOB '[A-Z][A-Z][A-Z][A-Z][0-9][0-9][0-9][0-9]' OR
      program_id GLOB '[A-Z][A-Z][A-Z][A-Z][0-9][0-9][0-9][0-9][A-Z]'
    )
  ),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 100),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  author_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  form_token TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_questions_id_desc ON questions (id DESC);
CREATE INDEX idx_questions_program ON questions (program_id, id DESC);

CREATE TABLE answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  body TEXT NOT NULL CHECK (length(body) BETWEEN 1 AND 4000),
  author_id INTEGER NOT NULL REFERENCES users(id),
  created_at INTEGER NOT NULL,
  form_token TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_answers_question ON answers (question_id, id ASC);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  csrf_token TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
