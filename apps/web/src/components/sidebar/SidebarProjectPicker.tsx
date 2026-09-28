import { FolderIcon } from "lucide-react";
import { memo } from "react";

import { cn } from "~/lib/utils";
import type { SidebarProjectSnapshot } from "~/sidebarProjectGrouping";
import type { SidebarThreadDensity } from "~/uiStateStore";
import { ProjectFavicon } from "../ProjectFavicon";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import type { SidebarSection } from "../Sidebar.logic";

/**
 * The sidebar's projects pane: a compact selectable project list beside the
 * threads pane. One small tile per project — logo on top, directory name
 * below it — plus an "All" tile that clears the scope. Selecting a project
 * scopes the threads pane to that project (the `sidebarProjectScopeKey` in
 * the persisted UI store, shared by both sidebars). Clicking the selected
 * project again also clears it, so there is always a way out without
 * hunting for the All tile.
 *
 * Thread density (comfortable/compact) lives in Settings, not here. Both
 * sidebars read the same `sidebarThreadDensity` value: the flat thread
 * sidebar renders live threads as full cards when comfortable and slim rows
 * when compact, while the grouped project tree shows thread status pills
 * when comfortable and hides them when compact.
 */

export function resolveSidebarRowVariant(
  section: SidebarSection,
  density: SidebarThreadDensity,
): "card" | "slim" {
  // Settled and snoozed rows are always slim; density only decides whether
  // live work gets the full card (comfortable) or joins them as slim rows
  // (compact).
  if (section !== "active" && section !== "pinned") return "slim";
  return density === "comfortable" ? "card" : "slim";
}

export interface SidebarProjectPickerProps {
  readonly projects: ReadonlyArray<SidebarProjectSnapshot>;
  readonly selectedKey: string | null;
  readonly onSelect: (projectKey: string | null) => void;
}

const pickerTileClassName =
  "flex w-full cursor-pointer flex-col items-center gap-0.5 rounded-md px-0.5 py-1.5 text-center outline-none select-none hover:bg-sidebar-row-hover focus-visible:ring-2 focus-visible:ring-ring";

export const SidebarProjectPicker = memo(function SidebarProjectPicker(
  props: SidebarProjectPickerProps,
) {
  const { onSelect, projects, selectedKey } = props;
  if (projects.length === 0) return null;
  return (
    <section aria-label="Projects" className="flex w-full min-w-0 flex-col gap-1">
      <ul role="list" className="flex w-full min-w-0 flex-col gap-1">
        <li className="list-none">
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  data-testid="sidebar-project-picker-all"
                  aria-current={selectedKey === null ? "true" : undefined}
                  onClick={() => onSelect(null)}
                  className={cn(
                    pickerTileClassName,
                    selectedKey === null
                      ? "bg-sidebar-row-selected text-sidebar-foreground"
                      : "text-sidebar-muted-foreground/80",
                  )}
                />
              }
            >
              <FolderIcon className="size-6 shrink-0" />
              <span className="w-full text-4xs leading-tight font-medium wrap-break-word">All</span>
            </TooltipTrigger>
            <TooltipPopup side="right">All projects</TooltipPopup>
          </Tooltip>
        </li>
        {projects.map((project) => {
          const selected = selectedKey === project.projectKey;
          return (
            <li key={project.projectKey} className="list-none">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <button
                      type="button"
                      data-testid={`sidebar-project-picker-item-${project.projectKey}`}
                      aria-current={selected ? "true" : undefined}
                      onClick={() => onSelect(selected ? null : project.projectKey)}
                      className={cn(
                        pickerTileClassName,
                        selected
                          ? "bg-sidebar-row-selected text-sidebar-foreground"
                          : "text-sidebar-muted-foreground/80",
                      )}
                    />
                  }
                >
                  <ProjectFavicon project={project} className="size-6 shrink-0" />
                  <span className="w-full text-4xs leading-tight font-medium wrap-break-word">
                    {project.displayName}
                  </span>
                </TooltipTrigger>
                <TooltipPopup side="right">{project.displayName}</TooltipPopup>
              </Tooltip>
            </li>
          );
        })}
      </ul>
    </section>
  );
});
