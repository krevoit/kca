import { ChevronRightIcon } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "~/lib/utils";
import { ScrollArea } from "../ui/scroll-area";

/**
 * Two side-by-side panes inside the thread sidebar: a narrow projects pane
 * for picking the scope, and the threads pane beside it. Each pane scrolls
 * on its own so a long thread list never pushes the project list away.
 * Shared by the grouped project tree and the flat thread sidebar so the
 * two-pane model reads the same everywhere. Passing `projects` as null
 * collapses the rail and gives the threads pane the full sidebar width.
 */
export function SidebarDualPane(props: {
  projects: ReactNode;
  threads: ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className={cn("flex min-h-0 min-w-0 flex-1 flex-row", props.className)}>
      {props.projects ? (
        <>
          <ScrollArea
            hideScrollbars
            scrollFade
            scrollFadePadding={false}
            className="h-auto min-h-0 w-16 flex-none [&>[data-slot=scroll-area-viewport]]:[--fade-size:0.75rem]"
          >
            <div className="flex w-full min-w-0 flex-col py-[var(--sidebar-content-inset)] pl-[var(--sidebar-content-inset)]">
              {props.projects}
            </div>
          </ScrollArea>
          <div aria-hidden className="mx-1 w-px shrink-0 self-stretch bg-sidebar-border/60" />
        </>
      ) : null}
      <ScrollArea
        hideScrollbars
        scrollFade
        scrollFadePadding={false}
        className="h-auto min-h-0 min-w-0 flex-1 [&>[data-slot=scroll-area-viewport]]:[--fade-size:0.75rem]"
      >
        <div className="flex w-full min-w-0 flex-col py-[var(--sidebar-content-inset)] pr-[var(--sidebar-content-inset)]">
          {props.threads}
        </div>
      </ScrollArea>
    </div>
  );
}

/**
 * The way back when the projects pane is collapsed: a slim strip at the top
 * of the threads pane that restores it.
 */
export function SidebarExpandProjectsButton(props: { onExpand: () => void }) {
  return (
    <button
      type="button"
      onClick={props.onExpand}
      aria-label="Show projects"
      className="mb-1 flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-left text-xs font-medium text-sidebar-muted-foreground/80 outline-none hover:bg-sidebar-row-hover hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring"
    >
      <ChevronRightIcon aria-hidden className="size-3.5 shrink-0" />
      <span className="min-w-0 flex-1 truncate">Projects</span>
    </button>
  );
}
