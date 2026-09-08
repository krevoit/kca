import { create } from "zustand";

/**
 * Which thread's sticky-note editor is open, as a scoped thread key, or null.
 *
 * Thread action menus (sidebar rows, chat header) live outside the thread
 * view that hosts the editor, so the request travels through this ephemeral
 * store instead of props. Deliberately not persisted: an in-progress edit is
 * dropped on reload like the inline rename draft.
 */
interface ThreadNoteEditorState {
  readonly noteEditorThreadKey: string | null;
  readonly openNoteEditor: (threadKey: string) => void;
  readonly closeNoteEditor: () => void;
}

export const useThreadNoteEditorStore = create<ThreadNoteEditorState>()((set) => ({
  noteEditorThreadKey: null,
  openNoteEditor: (threadKey) => set({ noteEditorThreadKey: threadKey }),
  closeNoteEditor: () =>
    set((state) => (state.noteEditorThreadKey === null ? state : { noteEditorThreadKey: null })),
}));

export const openNoteEditor = (threadKey: string) =>
  useThreadNoteEditorStore.getState().openNoteEditor(threadKey);

export const closeNoteEditor = () => useThreadNoteEditorStore.getState().closeNoteEditor();
