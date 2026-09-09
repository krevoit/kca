import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { DraftId } from "./composerDraftStore";
import { resolveStorage } from "./lib/storage";

const ChatTabSchema = Schema.Struct({
  environmentId: EnvironmentId,
  threadId: ThreadId,
  draftId: Schema.NullOr(DraftId),
});
export type ChatTab = typeof ChatTabSchema.Type;
const decodeTabs = Schema.decodeUnknownOption(Schema.Array(ChatTabSchema));
export function chatTabKey(tab: ChatTab): string {
  return JSON.stringify([tab.environmentId, tab.threadId]);
}

export function openChatTab(tabs: readonly ChatTab[], tab: ChatTab): readonly ChatTab[] {
  const index = tabs.findIndex((existing) => chatTabKey(existing) === chatTabKey(tab));
  if (index < 0) return [...tabs, tab];
  if (tabs[index]?.draftId === tab.draftId) return tabs;
  return tabs.map((existing, i) => (i === index ? tab : existing));
}

export function closeChatTab(tabs: readonly ChatTab[], key: string) {
  const index = tabs.findIndex((tab) => chatTabKey(tab) === key);
  const remaining = tabs.filter((tab) => chatTabKey(tab) !== key);
  return { tabs: remaining, next: remaining[Math.min(index, remaining.length - 1)] ?? null };
}

export const useChatTabsStore = create<{
  tabs: readonly ChatTab[];
  open: (tab: ChatTab) => void;
  close: (key: string) => void;
}>()(
  persist(
    (set) => ({
      tabs: [],
      open: (tab) =>
        set((state) => {
          const tabs = openChatTab(state.tabs, tab);
          return tabs === state.tabs ? state : { tabs };
        }),
      close: (key) => set((state) => ({ tabs: closeChatTab(state.tabs, key).tabs })),
    }),
    {
      name: "kca.chat-tabs.v1",
      storage: createJSONStorage(() =>
        resolveStorage(typeof window === "undefined" ? undefined : window.localStorage),
      ),
      partialize: ({ tabs }) => ({ tabs }),
      merge: (persisted, current) => {
        const parsed = decodeTabs(
          persisted && typeof persisted === "object" && "tabs" in persisted ? persisted.tabs : [],
        );
        return {
          ...current,
          tabs:
            parsed._tag === "Some"
              ? parsed.value.reduce<readonly ChatTab[]>((tabs, tab) => openChatTab(tabs, tab), [])
              : [],
        };
      },
    },
  ),
);
