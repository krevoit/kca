import { Tooltip, TooltipTrigger, TooltipPopup } from "../ui/tooltip";
import { useEnvironment } from "../../state/environments";
import { useAtomValue } from "@effect/atom-react";
import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { PlusIcon, XIcon } from "lucide-react";
import { shouldShowInstanceBadge } from "@t3tools/client-runtime/state/provider-instance-display";
import { EnvironmentId, ThreadId } from "@t3tools/contracts";
import { DraftId, useComposerDraftStore } from "../../composerDraftStore";
import { useClientSettings, useClientSettingsHydrated } from "../../hooks/useSettings";
import { useThreadShell, useThreadStatus } from "../../state/entities";
import { environmentServerConfigsAtom } from "../../state/server";
import { openCommandPalette } from "../../commandPaletteBus";
import { chatTabKey, closeChatTab, useChatTabsStore, type ChatTab } from "../../chatTabsStore";
import {
  deriveProviderEntriesByEnvironment,
  type ProviderInstanceEntry,
} from "../../providerInstances";
import { cn } from "~/lib/utils";
import { ProviderInstanceIcon } from "./ProviderInstanceIcon";
import { getTriggerDisplayModelLabel } from "./providerIconUtils";

const EMPTY_PROVIDER_ENTRIES: ReadonlyMap<string, ProviderInstanceEntry> = new Map();

function ChatTabItem({
  tab,
  active,
  focusable,
  providerEntryByInstanceId,
  onSelect,
  onClose,
}: {
  tab: ChatTab;
  active: boolean;
  focusable: boolean;
  providerEntryByInstanceId: ReadonlyMap<string, ProviderInstanceEntry>;
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
  const modelInstanceId =
    shell?.session?.providerInstanceId ?? shell?.modelSelection.instanceId ?? null;
  const providerEntry =
    modelInstanceId === null ? null : (providerEntryByInstanceId.get(modelInstanceId) ?? null);
  const driverKind = providerEntry?.driverKind ?? null;
  const selectedModel = providerEntry?.models.find(
    (model) => model.slug === shell?.modelSelection.model,
  );
  const modelLabel = selectedModel
    ? getTriggerDisplayModelLabel(selectedModel)
    : (shell?.modelSelection.model ?? null);
  const tooltip = `${title}${modelLabel ? ` · ${modelLabel}` : ""} · ${environment?.label ?? "Disconnected environment"}`;
  return (
    <div
      className={cn(
        "group relative flex shrink-0 items-center rounded-md border transition-colors",
        active
          ? "border-border bg-card text-foreground shadow-sm"
          : "border-transparent text-muted-foreground hover:bg-accent/60 hover:text-foreground",
      )}
    >
      {active ? (
        <span aria-hidden className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-primary" />
      ) : null}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              ref={button}
              type="button"
              role="tab"
              aria-selected={active}
              tabIndex={focusable ? 0 : -1}
              className="flex h-7 max-w-52 min-w-20 items-center gap-1.5 truncate px-2.5 text-xs outline-offset-[-2px]"
              onClick={onSelect}
              onAuxClick={(event) => {
                if (event.button === 1) {
                  event.preventDefault();
                  onClose();
                }
              }}
            >
              {shell?.latestTurn?.state === "running" ? (
                <span
                  className="size-1.5 shrink-0 animate-pulse rounded-full bg-primary"
                  aria-label="Running"
                />
              ) : null}
              {driverKind ? (
                <ProviderInstanceIcon
                  driverKind={driverKind}
                  displayName={
                    providerEntry?.displayName ??
                    shell?.session?.providerName ??
                    modelInstanceId ??
                    "Unknown provider"
                  }
                  accentColor={providerEntry?.accentColor}
                  showBadge={
                    providerEntry !== null &&
                    shouldShowInstanceBadge(providerEntry, providerEntryByInstanceId.values())
                  }
                  iconClassName="size-3.5"
                />
              ) : null}
              <span className={cn("truncate", active && "font-medium")}>{title}</span>
            </button>
          }
        />
        <TooltipPopup>{tooltip}</TooltipPopup>
      </Tooltip>
      <button
        type="button"
        aria-label={`Close ${title} tab`}
        onClick={onClose}
        className={cn(
          "mr-0.5 rounded p-0.5 hover:bg-accent",
          !active &&
            "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-visible:opacity-100",
        )}
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
  const serverConfigs = useAtomValue(environmentServerConfigsAtom);
  // Same per-environment provider lookup the sidebar rows use: default
  // instance ids are driver slugs, so resolution must stay scoped per env.
  const providerEntriesByEnvironment = useMemo(
    () =>
      deriveProviderEntriesByEnvironment(
        [...serverConfigs].map(
          ([environmentId, config]) => [environmentId, config.providers] as const,
        ),
      ),
    [serverConfigs],
  );
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
    <div className="relative z-10 flex shrink-0 items-center border-b border-border bg-background/90 pt-0.5 [-webkit-app-region:no-drag]">
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
            providerEntryByInstanceId={
              providerEntriesByEnvironment.get(tab.environmentId) ?? EMPTY_PROVIDER_ENTRIES
            }
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
        className="mx-1 rounded-md p-1.5 hover:bg-accent"
        onClick={() => openCommandPalette({ open: "new-thread-in" })}
      >
        <PlusIcon className="size-4" />
      </button>
    </div>
  );
}
