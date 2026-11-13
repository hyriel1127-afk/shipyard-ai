CREATE TABLE users (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  emp_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL
);

CREATE TABLE answerers (
  emp_no TEXT PRIMARY KEY
);

CREATE TABLE questions (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  program_id TEXT NOT NULL CHECK (program_id ~ '^[A-Z]{4}[0-9]{4}[A-Z]?$'),
  title TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 100),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  author_id INTEGER NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  form_token TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_questions_id_desc ON questions (id DESC);
CREATE INDEX idx_questions_program ON questions (program_id, id DESC);

CREATE TABLE answers (
  id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  author_id INTEGER NOT NULL REFERENCES users(id),
  created_at BIGINT NOT NULL,
  form_token TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_answers_question ON answers (question_id, id ASC);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  csrf_token TEXT NOT NULL,
  expires_at BIGINT NOT NULL
);
CREATE INDEX idx_sessions_expires ON sessions (expires_at);
