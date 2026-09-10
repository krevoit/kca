import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { THREAD_NOTE_MAX_LENGTH, type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import { useCallback, useState } from "react";
import { PencilIcon, StickyNoteIcon, Trash2Icon } from "lucide-react";

import { readLocalApi } from "../../localApi";
import { threadEnvironment } from "../../state/threads";
import { closeNoteEditor, useThreadNoteEditorStore } from "../../state/threadNoteEditor";
import { useAtomCommand } from "../../state/use-atom-command";
import { hasThreadNote } from "../threadActionMenu.logic";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";

/**
 * Sticky user note pinned above a thread's timeline.
 *
 * View-only by construction: the note lives on thread metadata and no agent
 * path reads it. Editing opens from the thread action menu (sidebar rows and
 * chat header) through the note-editor store, or from the card itself.
 */
export function ThreadNoteCard({
  environmentId,
  threadId,
  threadKey,
  note,
  editorRequested,
  canEdit,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly threadKey: string;
  readonly note: string | null | undefined;
  readonly editorRequested: boolean;
  readonly canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  // A menu-opened editor takes over whenever the signal targets this thread.
  // Render-time adjustment (not an effect): opening is event-driven and the
  // card remounts per thread, so there is no stale state to reconcile.
  const [seenEditorRequest, setSeenEditorRequest] = useState(false);
  if (editorRequested !== seenEditorRequest) {
    setSeenEditorRequest(editorRequested);
    if (editorRequested) {
      setDraft(note ?? "");
      setEditing(true);
    }
  }
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });

  const startEditing = useCallback(() => {
    setDraft(note ?? "");
    setEditing(true);
  }, [note]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    closeNoteEditor();
  }, []);

  const saveNote = useCallback(async () => {
    if (draft.length > THREAD_NOTE_MAX_LENGTH) return;
    // Saving an emptied draft clears the note; explicit removal below confirms.
    const result = await updateThreadMetadata({
      environmentId,
      input: { threadId, note: draft.trim().length === 0 ? null : draft },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to save note",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
      return;
    }
    setEditing(false);
    closeNoteEditor();
  }, [draft, environmentId, threadId, updateThreadMetadata]);

  const removeNote = useCallback(async () => {
    const api = readLocalApi();
    if (api) {
      const confirmed = await settlePromise(() =>
        api.dialogs.confirm("Remove this note?", { variant: "destructive" }),
      );
      if (confirmed._tag === "Failure" || !confirmed.value) return;
    }
    const result = await updateThreadMetadata({
      environmentId,
      input: { threadId, note: null },
    });
    if (result._tag === "Failure") {
      if (!isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add(
          stackedThreadToast({
            type: "error",
            title: "Failed to remove note",
            description: error instanceof Error ? error.message : "An error occurred.",
          }),
        );
      }
      return;
    }
    setEditing(false);
    closeNoteEditor();
    toastManager.add(
      stackedThreadToast({ type: "success", title: "Note removed", timeout: 3_000 }),
    );
  }, [environmentId, threadId, updateThreadMetadata]);

  if (!hasThreadNote(note) && !editorRequested && !editing && !canEdit) return null;
  const showEmptyAffordance = !hasThreadNote(note) && !editorRequested && !editing;

  const tooLong = draft.length > THREAD_NOTE_MAX_LENGTH;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-2" data-thread-note={threadKey}>
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3.5 py-2.5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-300">
          <StickyNoteIcon className="size-3.5" aria-hidden="true" />
          <span>Note</span>
          <span className="font-normal text-amber-700/70 dark:text-amber-300/70">
            · only visible to you
          </span>
          {!editing && canEdit ? (
            <span className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="xs"
                className="h-6 gap-1 px-1.5 text-amber-700 dark:text-amber-300"
                onClick={startEditing}
              >
                <PencilIcon className="size-3" aria-hidden="true" />
                Edit
              </Button>
              <Button
                variant="ghost"
                size="xs"
                className="h-6 gap-1 px-1.5 text-amber-700 dark:text-amber-300"
                onClick={() => void removeNote()}
              >
                <Trash2Icon className="size-3" aria-hidden="true" />
                Remove
              </Button>
            </span>
          ) : null}
        </div>
        {editing ? (
          <div
            onKeyDown={(event) => {
              event.stopPropagation();
              if (event.nativeEvent.isComposing || event.keyCode === 229) return;
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEditing();
              }
            }}
          >
            <textarea
              aria-label="Thread note"
              aria-description="Enter to save; Shift+Enter for a new line; Escape to cancel."
              aria-invalid={tooLong || undefined}
              placeholder="Jot down context for yourself…"
              rows={3}
              className="field-sizing-content mt-1.5 block max-h-48 min-h-16 w-full resize-none bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229
                ) {
                  event.preventDefault();
                  void saveNote();
                }
              }}
            />
            {tooLong ? (
              <p role="status" className="pt-1 text-xs text-destructive">
                Notes can contain up to {THREAD_NOTE_MAX_LENGTH.toLocaleString()} characters.
              </p>
            ) : null}
            <div className="mt-1.5 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {draft.length.toLocaleString()}/{THREAD_NOTE_MAX_LENGTH.toLocaleString()}
              </span>
              <span className="flex items-center gap-2">
                <Button variant="outline" size="xs" onClick={cancelEditing}>
                  Cancel
                </Button>
                <Button size="xs" disabled={tooLong} onClick={() => void saveNote()}>
                  {tooLong ? "Shorten note" : "Save"}
                </Button>
              </span>
            </div>
          </div>
        ) : showEmptyAffordance ? (
          <button
            type="button"
            aria-label="Add a note to this thread"
            onClick={startEditing}
            className="mt-1 flex w-full items-center gap-1.5 rounded-lg border border-dashed border-amber-500/40 px-2.5 py-2 text-left text-sm text-amber-700/80 transition-colors hover:bg-amber-500/10 dark:text-amber-300/80"
          >
            <StickyNoteIcon className="size-3.5 shrink-0" aria-hidden="true" />
            Add a note…
          </button>
        ) : (
          <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-sm">{note}</p>
        )}
      </div>
    </div>
  );
}

/** Reads whether the note editor was requested for a thread key. */
export function useNoteEditorRequested(threadKey: string): boolean {
  return useThreadNoteEditorStore((state) => state.noteEditorThreadKey) === threadKey;
}
