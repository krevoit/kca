import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { useEnvironment } from "../../state/environments";
import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { PlusIcon, XIcon } from "lucide-react";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { useClientSettings, useClientSettingsHydrated } from "../../hooks/useSettings";
import { useThreadShell, useThreadStatus } from "../../state/entities";
import { openCommandPalette } from "../../commandPaletteBus";
import { chatTabKey, closeChatTab, useChatTabsStore, type ChatTab } from "../../chatTabsStore";

function ChatTabItem({
  tab,
  active,
  focusable,
  onSelect,
  onClose,
}: {
  tab: ChatTab;
  active: boolean;
  focusable: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const shell = useThreadShell(tab);
  const environment = useEnvironment(tab.environmentId);
  const status = useThreadStatus(tab);
  const button = useRef<HTMLButtonElement>(null);
  const close = useChatTabsStore((state) => state.close);
  const open = useChatTabsStore((state) => state.open);
  useEffect(() => {
    if (tab.draftId && shell?.latestTurn) open({ ...tab, draftId: null });
  }, [tab, shell?.latestTurn, open]);
  useEffect(() => {
    if (status === "deleted") close(chatTabKey(tab));
  }, [status, close, tab]);
  useEffect(() => {
    if (active) button.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  const title = shell?.title ?? (tab.draftId ? "New chat" : "Chat");
  return (
    <div
      className={`group flex shrink-0 items-center rounded-t-md border border-b-0 ${active ? "border-border bg-background text-foreground" : "border-transparent text-muted-foreground hover:bg-accent/50"}`}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              ref={button}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={focusable ? 0 : -1}
              className="flex h-9 max-w-52 min-w-20 items-center gap-2 truncate px-3 text-xs outline-offset-[-2px]"
              onClick={onSelect}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  onClose();
                }
              }}
            >
              {shell?.latestTurn?.state === "running" ? (
                <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="Running" />
              ) : null}
              <span className="truncate">{title}</span>
            </button>
          }
        />
        <TooltipPopup>
          {title} · {environment?.label ?? "Disconnected environment"}
        </TooltipPopup>
      </Tooltip>
      <button
        type="button"
        aria-label={`Close ${title} tab`}
        onClick={onClose}
        className="mr-1 rounded p-1 hover:bg-accent"
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}

export function ChatTabs() {
  const tabsEnabled = useClientSettings((settings) => settings.chatTabsEnabled);
  const hydrated = useClientSettingsHydrated();
  const enabled = tabsEnabled && hydrated;
  const params = useParams({ strict: false });
  const draftId = params.draftId ? DraftId.make(params.draftId) : null;
  const draft = useComposerDraftStore((state) => (draftId ? state.getDraftSession(draftId) : null));
  const draftEnvironmentId = draft?.environmentId;
  const draftThreadId = draft?.threadId;
  const current = useMemo<ChatTab | null>(
    () =>
      params.environmentId && params.threadId
        ? {
            environmentId: EnvironmentId.make(params.environmentId),
            threadId: ThreadId.make(params.threadId),
            draftId: null,
          }
        : draftEnvironmentId && draftThreadId && draftId
          ? { environmentId: draftEnvironmentId, threadId: draftThreadId, draftId }
          : null,
    [params.environmentId, params.threadId, draftEnvironmentId, draftThreadId, draftId],
  );
  const tabs = useChatTabsStore((state) => state.tabs);
  const open = useChatTabsStore((state) => state.open);
  const close = useChatTabsStore((state) => state.close);
  const navigate = useNavigate();
  const key = current ? chatTabKey(current) : null;
  useEffect(() => {
    if (enabled && current) open(current);
  }, [enabled, current, open]);
  const select = (tab: ChatTab) => {
    if (tab.draftId) void navigate({ to: "/draft/$draftId", params: { draftId: tab.draftId } });
    else
      void navigate({
        to: "/$environmentId/$threadId",
        params: { environmentId: tab.environmentId, threadId: tab.threadId },
      });
  };
  if (!enabled) return null;
  return (
    <div className="relative z-10 flex shrink-0 items-center border-b border-border bg-background/90 pt-1 [-webkit-app-region:no-drag]">
      <div
        role="tablist"
        aria-label="Open chats"
        className="flex min-w-0 flex-1 gap-1 overflow-x-auto px-2"
        onKeyDown={(event) => {
          const index = tabs.findIndex((tab) => chatTabKey(tab) === key);
          const next =
            event.key === "ArrowRight"
              ? (index + 1) % tabs.length
              : event.key === "ArrowLeft"
                ? (index - 1 + tabs.length) % tabs.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : -1;
          if (next < 0 || !tabs[next]) return;
          event.preventDefault();
          select(tabs[next]);
          const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]');
          buttons[next]?.focus();
        }}
      >
        {tabs.map((tab, index) => (
          <ChatTabItem
            key={chatTabKey(tab)}
            tab={tab}
            active={chatTabKey(tab) === key}
            focusable={key === null ? index === 0 : chatTabKey(tab) === key}
            onSelect={() => select(tab)}
            onClose={() => {
              const removed = chatTabKey(tab);
              const { next } = closeChatTab(tabs, removed);
              if (removed === key) {
                if (next) select(next);
                else void navigate({ to: "/", search: { empty: true } });
              }
              close(removed);
            }}
          />
        ))}
      </div>
      <button
        type="button"
        aria-label="New chat"
        className="mx-1 rounded-md p-2 hover:bg-accent"
        onClick={() => openCommandPalette({ open: "new-thread-in" })}
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
}
