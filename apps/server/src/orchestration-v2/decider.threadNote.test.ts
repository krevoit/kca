import { assert, describe, it } from "@effect/vitest";
import {
  CommandId,
  ProjectId,
  ProviderDriverKind,
  ProviderInstanceId,
  ThreadId,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import * as SqlitePersistence from "../persistence/Sqlite.ts";
import { CodexProviderCapabilitiesV2 } from "./Adapters/CodexAdapterV2.ts";
import type { ProviderAdapterV2Shape } from "@t3tools/provider-core/server/ProviderAdapter";
import * as ProviderAdapterRegistry from "./ProviderAdapterRegistry.ts";
import * as ThreadManagement from "./ThreadManagementService.ts";
import * as ProviderReplayHarness from "./testkit/ProviderReplayHarness.ts";

// KCA fork sticky-note behavior, ported from the deleted V1
// `thread.meta.update` decider to the V2 `thread.metadata.update` path.
// Requires `note` support in the V2 contracts (`thread.metadata.update` /
// `thread.metadata-updated` / thread shell), the Orchestrator decision fold,
// and the projection store; those land with the corresponding merges.
const projectId = ProjectId.make("project:thread-note");
const modelSelection = {
  instanceId: ProviderInstanceId.make("codex"),
  model: "gpt-5.1-codex",
} as const;

const adapter = {
  instanceId: modelSelection.instanceId,
  driver: ProviderDriverKind.make("codex"),
  getCapabilities: () => Effect.succeed(CodexProviderCapabilitiesV2),
  planSelectionTransition: () => Effect.succeed({ type: "apply_on_next_turn" as const }),
  openSession: () => Effect.die("provider execution is disabled in thread note tests"),
} as ProviderAdapterV2Shape;

function makeHarness() {
  const layerDatabase = SqlitePersistence.layerMemory;
  const layerRegistry = ProviderAdapterRegistry.layerFromAdapters([adapter]);
  const layerOrchestrator = ProviderReplayHarness.layerWithRegistry(
    { name: "thread-note" },
    layerRegistry,
    { databaseLayer: layerDatabase, runEffectWorker: false },
  );
  const layerThreadManagement = ThreadManagement.layer.pipe(Layer.provide(layerOrchestrator));
  return { layer: Layer.mergeAll(layerThreadManagement, layerDatabase) };
}

function createThread(input: { readonly command: string; readonly thread: string }) {
  return Effect.gen(function* () {
    const threads = yield* ThreadManagement.ThreadManagementService;
    const threadId = ThreadId.make(input.thread);
    yield* threads.dispatch({
      type: "thread.create",
      commandId: CommandId.make(input.command),
      threadId,
      projectId,
      title: "Seed title",
      modelSelection,
      runtimeMode: "full-access",
      interactionMode: "default",
      branch: null,
      worktreePath: null,
      createdBy: "user",
      creationSource: "web",
    });
    return threadId;
  });
}

function readNote(threadId: ThreadId) {
  return Effect.gen(function* () {
    const threads = yield* ThreadManagement.ThreadManagementService;
    const projection = yield* threads.getThreadProjection(threadId);
    return projection.thread.note;
  });
}

describe("thread sticky notes", () => {
  it.effect("carries a note through to the projection", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadManagement.ThreadManagementService;
      const threadId = yield* createThread({
        command: "command:note:carry:create",
        thread: "thread:note:carry",
      });
      yield* threads.dispatch({
        type: "thread.metadata.update",
        commandId: CommandId.make("command:note:carry:1"),
        threadId,
        note: "ship it",
      });
      assert.equal(yield* readNote(threadId), "ship it");
    }).pipe(Effect.provide(makeHarness().layer)),
  );

  it.effect("normalises blank notes to null", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadManagement.ThreadManagementService;
      const threadId = yield* createThread({
        command: "command:note:blank:create",
        thread: "thread:note:blank",
      });
      yield* threads.dispatch({
        type: "thread.metadata.update",
        commandId: CommandId.make("command:note:blank:1"),
        threadId,
        note: "   ",
      });
      assert.isNull(yield* readNote(threadId));
    }).pipe(Effect.provide(makeHarness().layer)),
  );

  it.effect("clears the note on explicit null", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadManagement.ThreadManagementService;
      const threadId = yield* createThread({
        command: "command:note:clear:create",
        thread: "thread:note:clear",
      });
      yield* threads.dispatch({
        type: "thread.metadata.update",
        commandId: CommandId.make("command:note:clear:1"),
        threadId,
        note: "ship it",
      });
      yield* threads.dispatch({
        type: "thread.metadata.update",
        commandId: CommandId.make("command:note:clear:2"),
        threadId,
        note: null,
      });
      assert.isNull(yield* readNote(threadId));
    }).pipe(Effect.provide(makeHarness().layer)),
  );

  it.effect("leaves the note untouched when absent", () =>
    Effect.gen(function* () {
      const threads = yield* ThreadManagement.ThreadManagementService;
      const threadId = yield* createThread({
        command: "command:note:keep:create",
        thread: "thread:note:keep",
      });
      yield* threads.dispatch({
        type: "thread.metadata.update",
        commandId: CommandId.make("command:note:keep:1"),
        threadId,
        note: "ship it",
      });
      yield* threads.dispatch({
        type: "thread.metadata.update",
        commandId: CommandId.make("command:note:keep:2"),
        threadId,
        title: "Renamed",
      });
      assert.equal(yield* readNote(threadId), "ship it");
    }).pipe(Effect.provide(makeHarness().layer)),
  );
});
