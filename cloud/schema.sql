-- Timeapp - databaseskjema (Cloudflare D1 / SQLite)
-- Kjores en gang: Workers & Pages -> D1 -> timeapp -> Console, lim inn og kjor.

CREATE TABLE IF NOT EXISTS companies (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  refresh_token TEXT,                     -- Infrakit refresh-token, AES-GCM-kryptert
  connected_by  TEXT,                     -- e-post til koordinatoren som koblet til
  connected_at  TEXT,
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  email      TEXT PRIMARY KEY,            -- alltid smaa bokstaver
  name       TEXT NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('coordinator', 'employee')),
  salt       TEXT NOT NULL,               -- PBKDF2-salt, brukes av appen
  verifier   TEXT NOT NULL,               -- SHA-256 av avledet noekkel + pepper
  created_at TEXT NOT NULL,
  last_login TEXT
);
CREATE INDEX IF NOT EXISTS idx_users_company ON users(company_id);

CREATE TABLE IF NOT EXISTS invites (
  code       TEXT PRIMARY KEY,
  email      TEXT NOT NULL,
  name       TEXT,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('coordinator', 'employee')),
  expires_at INTEGER NOT NULL,            -- unix-sekunder
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invites_company ON invites(company_id);

CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  email      TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,            -- unix-sekunder
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_email ON sessions(email);

CREATE TABLE IF NOT EXISTS integrations (
  company_id   TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  system       TEXT NOT NULL,             -- f.eks. 'tripletex'
  config       TEXT NOT NULL,             -- tokens m.m., AES-GCM-kryptert JSON
  connected_by TEXT,
  connected_at TEXT,
  PRIMARY KEY (company_id, system)
);
