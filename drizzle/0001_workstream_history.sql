CREATE TABLE workstream_history (
  work_id TEXT NOT NULL,
  revision INTEGER NOT NULL,
  state TEXT NOT NULL,
  note TEXT NOT NULL,
  channel TEXT NOT NULL,
  happened_at TEXT NOT NULL,
  PRIMARY KEY (work_id, revision)
);
--> statement-breakpoint
ALTER TABLE project_changes ADD COLUMN work_id TEXT;
--> statement-breakpoint
CREATE INDEX project_changes_work_time ON project_changes(work_id, happened_at DESC);
