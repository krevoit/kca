import {
  CommandId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationReadModel,
} from "@t3tools/contracts";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";

import { decideOrchestrationCommand } from "./decider.ts";

const UPDATED_AT = "2026-01-01T00:00:00.000Z";

const readModel: OrchestrationReadModel = {
  snapshotSequence: 0,
  projects: [],
  threads: [
    {
      id: ThreadId.make("thread-1"),
      projectId: ProjectId.make("project-1"),
      title: "Manual title",
      modelSelection: { instanceId: ProviderInstanceId.make("codex"), model: "gpt-5.4" },
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      latestTurn: null,
      createdAt: UPDATED_AT,
      updatedAt: UPDATED_AT,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      snoozedUntil: null,
      snoozedAt: null,
      deletedAt: null,
      messages: [],
      proposedPlans: [],
      activities: [],
      checkpoints: [],
      session: null,
    },
  ],
  updatedAt: UPDATED_AT,
};

const decideMetaUpdate = (input: { note?: string | null }) =>
  Effect.gen(function* () {
    const result = yield* decideOrchestrationCommand({
      command: {
        type: "thread.meta.update",
        commandId: CommandId.make("cmd-note"),
        threadId: ThreadId.make("thread-1"),
        ...input,
      },
      readModel,
    });
    const event = Array.isArray(result) ? result[0] : result;
    expect(event.type).toBe("thread.meta-updated");
    if (event.type !== "thread.meta-updated") throw new Error("unexpected event type");
    return event.payload;
  });

it.layer(NodeServices.layer)("thread sticky note decider", (it) => {
  it.effect("carries a note through to the meta-updated payload", () =>
    Effect.gen(function* () {
      const payload = yield* decideMetaUpdate({ note: "ship it" });
      expect(payload.note).toBe("ship it");
    }),
  );

  it.effect("normalises blank notes to null", () =>
    Effect.gen(function* () {
      const payload = yield* decideMetaUpdate({ note: "   " });
      expect(payload.note).toBeNull();
    }),
  );

  it.effect("clears the note on explicit null", () =>
    Effect.gen(function* () {
      const payload = yield* decideMetaUpdate({ note: null });
      expect(payload.note).toBeNull();
    }),
  );

  it.effect("leaves the note untouched when absent", () =>
    Effect.gen(function* () {
      const payload = yield* decideMetaUpdate({});
      expect("note" in payload).toBe(false);
    }),
  );
});
