CREATE TABLE project_records (
  id TEXT PRIMARY KEY NOT NULL,
  details TEXT NOT NULL,
  file_name TEXT,
  byte_size INTEGER,
  object_key TEXT,
  updated_at TEXT NOT NULL
);
--> statement-breakpoint
CREATE TABLE project_changes (
  id TEXT PRIMARY KEY NOT NULL,
  record_id TEXT NOT NULL,
  action TEXT NOT NULL,
  title TEXT NOT NULL,
  happened_at TEXT NOT NULL
);

