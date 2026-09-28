import {
  isAtomCommandInterrupted,
  settlePromise,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import { THREAD_NOTE_MAX_LENGTH, type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import { useCallback, useState } from "react";
import { PencilIcon, StickyNoteIcon, Trash2Icon, XIcon } from "lucide-react";

import { readLocalApi } from "../../localApi";
import { threadEnvironment } from "../../state/threads";
import { closeNoteEditor, useThreadNoteEditorStore } from "../../state/threadNoteEditor";
import { useAtomCommand } from "../../state/use-atom-command";
import { hasThreadNote } from "../threadActionMenu.logic";
import { Button } from "../ui/button";
import { stackedThreadToast, toastManager } from "../ui/toast";

/**
 * Sticky user note kept in the thread's bottom-left corner.
 *
 * Collapsed to a chip by default; expands to view or edit. View-only by
 * construction: the note lives on thread metadata and no agent path reads
 * it. Editing opens from the chip, the expanded card, or the thread action
 * menu (sidebar rows and chat header) through the note-editor store.
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
  const [expanded, setExpanded] = useState(false);
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
      setExpanded(true);
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
    closeNoteEditor();
    if (hasThreadNote(note)) {
      setEditing(false);
    } else {
      setEditing(false);
      setExpanded(false);
    }
  }, [note]);

  const closeWidget = useCallback(() => {
    setExpanded(false);
    setEditing(false);
    closeNoteEditor();
  }, []);

  const openWidget = useCallback(() => {
    setExpanded(true);
    if (!hasThreadNote(note) && canEdit) {
      setDraft(note ?? "");
      setEditing(true);
    }
  }, [note, canEdit]);

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
    setExpanded(false);
    setEditing(false);
    closeNoteEditor();
    toastManager.add(
      stackedThreadToast({ type: "success", title: "Note removed", timeout: 3_000 }),
    );
  }, [environmentId, threadId, updateThreadMetadata]);

  if (!expanded && !editorRequested) {
    // Collapsed chip. Visible whenever there is something to open: an
    // existing note, or the add affordance on capable servers.
    if (!hasThreadNote(note) && !canEdit) return null;
    return (
      <div className="relative z-30" data-thread-note={threadKey}>
        <button
          type="button"
          aria-label={hasThreadNote(note) ? "Open note" : "Add a note to this thread"}
          onClick={openWidget}
          className="flex items-center gap-1.5 rounded-full border border-warning bg-warning-surface py-1.5 pr-3 pl-2.5 text-xs text-warning-foreground shadow-md backdrop-blur transition-colors hover:bg-warning-surface hover:text-warning-foreground dark:border-warning dark:bg-warning-surface dark:text-warning-foreground dark:hover:bg-warning-surface dark:hover:text-warning-foreground"
        >
          <span className="relative flex items-center">
            <StickyNoteIcon
              className="size-3.5 text-warning-foreground dark:text-warning-foreground"
              aria-hidden="true"
            />
            {hasThreadNote(note) ? (
              <span
                aria-hidden
                className="absolute -top-0.5 -right-0.5 size-1.5 rounded-full bg-warning"
              />
            ) : null}
          </span>
          Note
        </button>
      </div>
    );
  }

  const tooLong = draft.length > THREAD_NOTE_MAX_LENGTH;

  // The expanded card stays in the same bottom-left lane as the chip and
  // grows upward within the space reserved by the chat layout.
  return (
    <div
      className="relative z-30 min-w-0 max-h-[calc(100dvh-2rem)] w-full max-w-full"
      data-thread-note={threadKey}
      onKeyDown={(event) => {
        if (event.key === "Escape" && !editing) {
          event.stopPropagation();
          closeWidget();
        }
      }}
    >
      <div className="flex min-w-0 max-h-[calc(100dvh-2rem)] flex-col overflow-hidden rounded-xl border border-warning bg-warning-surface px-3.5 py-2.5 shadow-xl dark:border-warning dark:bg-warning-surface">
        <div className="flex items-center justify-between gap-2 text-xs font-medium text-warning-foreground dark:text-warning-foreground">
          <div className="flex items-center gap-1.5">
            <StickyNoteIcon className="size-3.5" aria-hidden="true" />
            <span>Note</span>
          </div>
          <Button
            variant="warning-outline"
            size="icon-xs"
            aria-label="Close note"
            onClick={closeWidget}
          >
            <XIcon className="size-3" aria-hidden="true" />
          </Button>
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
              className="field-sizing-content mt-1.5 block min-w-0 max-h-[calc(100dvh-12rem)] min-h-16 w-full resize-none overflow-y-auto wrap-anywhere bg-transparent text-sm outline-none placeholder:text-muted-foreground"
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
            <div className="mt-1.5 flex flex-col items-stretch gap-2">
              <span className="text-xs text-muted-foreground tabular-nums">
                {draft.length.toLocaleString()}/{THREAD_NOTE_MAX_LENGTH.toLocaleString()}
              </span>
              <span className="flex justify-end gap-2">
                <Button variant="outline" size="xs" onClick={cancelEditing}>
                  Cancel
                </Button>
                <Button size="xs" disabled={tooLong} onClick={() => void saveNote()}>
                  {tooLong ? "Shorten note" : "Save"}
                </Button>
              </span>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 min-w-0 max-h-[calc(100dvh-10rem)] overflow-y-auto whitespace-pre-wrap wrap-anywhere text-sm">
              {note}
            </p>
            {canEdit ? (
              <div className="mt-2 flex justify-end gap-1">
                <Button variant="warning-outline" size="xs" onClick={startEditing}>
                  <PencilIcon className="size-3" aria-hidden="true" />
                  Edit
                </Button>
                <Button variant="warning-outline" size="xs" onClick={() => void removeNote()}>
                  <Trash2Icon className="size-3" aria-hidden="true" />
                  Remove
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** Reads whether the note editor was requested for a thread key. */
export function useNoteEditorRequested(threadKey: string): boolean {
  return useThreadNoteEditorStore((state) => state.noteEditorThreadKey) === threadKey;
}
