import { THREAD_NOTE_MAX_LENGTH, type EnvironmentId, type ThreadId } from "@t3tools/contracts";
import { useCallback, useState } from "react";
import { Alert, Pressable, TextInput, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { cn } from "../../lib/cn";
import { threadEnvironment } from "../../state/threads";
import { useAtomCommand } from "../../state/use-atom-command";

/**
 * Sticky user note on a thread, mirroring the web ThreadNoteCard.
 *
 * View-only by construction: the note lives on thread metadata and no agent
 * path reads it.
 */
export function ThreadNoteCard({
  environmentId,
  threadId,
  note,
}: {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly note: string | null | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const updateThreadMetadata = useAtomCommand(threadEnvironment.updateMetadata, {
    reportFailure: false,
  });

  const startEditing = useCallback(() => {
    setDraft(note ?? "");
    setEditing(true);
  }, [note]);

  const saveNote = useCallback(async () => {
    if (draft.length > THREAD_NOTE_MAX_LENGTH) return;
    const result = await updateThreadMetadata({
      environmentId,
      input: { threadId, note: draft.trim().length === 0 ? null : draft },
    });
    if (result._tag === "Failure") {
      Alert.alert("Could not save note", "The note could not be saved. Try again.");
      return;
    }
    setEditing(false);
  }, [draft, environmentId, threadId, updateThreadMetadata]);

  const removeNote = useCallback(() => {
    Alert.alert("Remove note?", "This removes the note from the thread.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: () => {
          void updateThreadMetadata({ environmentId, input: { threadId, note: null } }).then(
            (result) => {
              if (result._tag === "Failure") {
                Alert.alert("Could not remove note", "The note could not be removed. Try again.");
                return;
              }
              setEditing(false);
            },
          );
        },
      },
    ]);
  }, [environmentId, threadId, updateThreadMetadata]);

  if ((note === null || note === undefined || note.length === 0) && !editing) return null;

  const tooLong = draft.length > THREAD_NOTE_MAX_LENGTH;

  return (
    <View className="mx-4 mb-2 rounded-2xl border border-adaptive-neutral-200-white-a6 bg-adaptive-amber-500-a12-a16 px-3.5 py-2.5">
      <View className="flex-row items-center gap-1.5">
        <Text className="text-xs font-semibold text-adaptive-amber-700-300">Note</Text>
        <Text className="text-xs text-adaptive-amber-700-300">· only visible to you</Text>
        {!editing ? (
          <View className="ml-auto flex-row items-center gap-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit note"
              onPress={startEditing}
            >
              <Text className="text-xs font-medium text-adaptive-amber-700-300">Edit</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Remove note"
              onPress={removeNote}
            >
              <Text className="text-xs font-medium text-adaptive-amber-700-300">Remove</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {editing ? (
        <View>
          <TextInput
            aria-label="Thread note"
            multiline
            numberOfLines={3}
            maxLength={THREAD_NOTE_MAX_LENGTH + 100}
            placeholder="Jot down context for yourself…"
            className="mt-1.5 min-h-16 text-sm text-foreground"
            value={draft}
            onChangeText={setDraft}
          />
          {tooLong ? (
            <Text className="pt-1 text-xs text-destructive">
              Notes can contain up to {THREAD_NOTE_MAX_LENGTH.toLocaleString()} characters.
            </Text>
          ) : null}
          <View className="mt-1.5 flex-row items-center justify-between">
            <Text className="text-xs text-muted-foreground tabular-nums">
              {draft.length.toLocaleString()}/{THREAD_NOTE_MAX_LENGTH.toLocaleString()}
            </Text>
            <View className="flex-row items-center gap-3">
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Cancel editing note"
                onPress={() => setEditing(false)}
              >
                <Text className="text-xs font-medium text-muted-foreground">Cancel</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Save note"
                disabled={tooLong}
                onPress={() => void saveNote()}
              >
                <Text className={cn("text-xs font-semibold", tooLong && "opacity-40")}>
                  {tooLong ? "Shorten note" : "Save"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      ) : (
        <Text className="mt-1 text-sm">{note}</Text>
      )}
    </View>
  );
}
