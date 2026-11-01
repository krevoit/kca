import { create } from "zustand";

// Which thread's sticky-note editor is open, as a scoped thread key, or null.
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
