import { describe, expect, it } from "vite-plus/test";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { DraftId } from "./composerDraftStore";
import { chatTabKey, closeChatTab, openChatTab, type ChatTab } from "./chatTabsStore";

const tab = (environment: string, thread: string): ChatTab => ({
  environmentId: EnvironmentId.make(environment),
  threadId: ThreadId.make(thread),
  draftId: null,
});

describe("chat tab navigation", () => {
  it("keeps identical thread ids on different environments separate", () => {
    const first = tab("local", "thread-1");
    const second = tab("remote", "thread-1");
    const tabs = openChatTab([first], second);
    expect(tabs).toEqual([first, second]);
    expect(openChatTab(tabs, first)).toBe(tabs);
  });
  it("promotes a draft in place without creating a duplicate tab", () => {
    const first = tab("local", "thread-1");
    const draft = { ...first, draftId: DraftId.make("draft-1") };
    expect(openChatTab([draft, tab("local", "thread-2")], first)).toEqual([
      first,
      tab("local", "thread-2"),
    ]);
  });
  it("selects a neighboring chat when closing and leaves other tabs intact", () => {
    const tabs = [tab("local", "a"), tab("local", "b"), tab("remote", "c")];
    expect(closeChatTab(tabs, chatTabKey(tabs[1]!))).toEqual({
      tabs: [tabs[0], tabs[2]],
      next: tabs[2],
    });
    expect(closeChatTab(tabs, chatTabKey(tabs[2]!)).next).toEqual(tabs[1]);
    expect(closeChatTab([tabs[0]!], chatTabKey(tabs[0]!))).toEqual({ tabs: [], next: null });
  });
});
