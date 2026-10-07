import * as Effect from "effect/Effect";
import * as Migrator from "effect/sql/Migrator";
import * as SqlClient from "effect/sql/SqlClient";

import TitleState from "./Migrations/052_ProjectionThreadTitleState.ts";
import PullRequestFilesViewed from "./Migrations/053_PullRequestFilesViewed.ts";
import AutoSettleDisabledAt from "./Migrations/054_ProjectionThreadsAutoSettleDisabledAt.ts";

// Published previews assigned V2 to 53, then 54. Keep their schema and import
// progress intact while reserving main's migration ids for upgrades from main.
// Fork final ids: 53 TitleState, 54 PullRequestFilesViewed,
// 55 AutoSettleDisabledAt, 56 OrchestrationV2, 57 RemoveRedundantProjectionIndexes.
export const reconcileV2PreviewMigration = Effect.fn("reconcileV2PreviewMigration")(function* () {
  const sql = yield* SqlClient.SqlClient;
  return yield* sql.withTransaction(
    Effect.gen(function* () {
      const tables = yield* sql`
        SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'effect_sql_migrations'
      `;
      if (tables.length === 0) return [];
      const history = yield* sql<{ readonly migration_id: number; readonly name: string }>`
        SELECT migration_id, name FROM effect_sql_migrations WHERE migration_id >= 53
      `;
      const legacy = history.find(
        (row) =>
          row.name === "OrchestrationV2" && (row.migration_id === 53 || row.migration_id === 54),
      );
      if (!legacy) return [];
      const valid = history.every(
        (row) =>
          row === legacy ||
          (legacy.migration_id === 54 &&
            ((row.migration_id === 53 && row.name === "ProjectionThreadTitleState") ||
              (row.migration_id === 56 && row.name === "RemoveRedundantProjectionIndexes"))),
      );
      if (!valid) {
        return yield* new Migrator.MigrationError({
          kind: "BadState",
          message: "Cannot upgrade V2 preview with unexpected later migrations.",
        });
      }
      const executed: Array<readonly [number, string]> = [];
      if (legacy.migration_id === 53) {
        yield* TitleState;
        executed.push([53, "ProjectionThreadTitleState"]);
        yield* PullRequestFilesViewed;
        executed.push([54, "PullRequestFilesViewed"]);
      } else {
        // Legacy 54 preview already has TitleState at 53; only backfill PullRequestFilesViewed.
        yield* PullRequestFilesViewed;
        executed.push([54, "PullRequestFilesViewed"]);
      }
      yield* AutoSettleDisabledAt;
      executed.push([55, "ProjectionThreadsAutoSettleDisabledAt"]);
      // Move the later entry first to avoid a primary-key collision.
      yield* sql`UPDATE effect_sql_migrations SET migration_id = 57 WHERE migration_id = 56 AND name = 'RemoveRedundantProjectionIndexes'`;
      yield* sql`UPDATE effect_sql_migrations SET migration_id = 56 WHERE migration_id = ${legacy.migration_id} AND name = 'OrchestrationV2'`;
      if (legacy.migration_id === 53) {
        yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (53, 'ProjectionThreadTitleState')`;
        yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (54, 'PullRequestFilesViewed')`;
      } else {
        yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (54, 'PullRequestFilesViewed')`;
      }
      yield* sql`INSERT INTO effect_sql_migrations (migration_id, name) VALUES (55, 'ProjectionThreadsAutoSettleDisabledAt')`;
      return executed;
    }),
  );
});
