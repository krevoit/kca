import { assert, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/unstable/sql/SqlClient";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";

import { runMigrations } from "../Migrations.ts";
import migrateNote from "./050_ProjectionThreadNote.ts";

it.layer(NodeSqliteClient.layerMemory())("050_ProjectionThreadNote", (it) => {
  it.effect("adds a nullable note column without touching existing rows", () =>
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* runMigrations({ toMigrationInclusive: 49 });
      const now = "2026-01-01T00:00:00.000Z";
      yield* sql`
        INSERT INTO projection_threads (
          thread_id, project_id, title, model_selection_json, runtime_mode,
          created_at, updated_at
        ) VALUES (
          'thread-1', 'project-1', 'Existing thread',
          '{"instanceId":"codex","model":"gpt-5.4"}', 'full-access', ${now}, ${now}
        )
      `;
      yield* runMigrations({ toMigrationInclusive: 50 });
      const migrated = yield* sql<{ readonly note: string | null }>`
        SELECT note FROM projection_threads WHERE thread_id = 'thread-1'
      `;
      assert.deepEqual(migrated, [{ note: null }]);
      // Recovery may run the same migration against a database that already
      // has the column, including a note written after the upgrade.
      yield* sql`UPDATE projection_threads SET note = 'ship it' WHERE thread_id = 'thread-1'`;
      yield* migrateNote;
      const rows = yield* sql<{
        readonly note: string | null;
        readonly createdAt: string;
        readonly updatedAt: string;
      }>`
        SELECT note, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM projection_threads WHERE thread_id = 'thread-1'
      `;
      assert.deepEqual(rows, [{ note: "ship it", createdAt: now, updatedAt: now }]);
    }),
  );
});
