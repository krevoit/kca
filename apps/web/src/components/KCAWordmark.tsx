import { cn } from "../lib/utils";

/**
 * KCA wordmark for brand lockups (sidebar, welcome wizard).
 *
 * The upstream T3 lettermark is an SVG glyph; the fork renders the mark as
 * text so every lockup reads "KCA Code" without a custom font asset. Sizing
 * comes from the caller, matching the surrounding "Code" label.
 */
export function KCAWordmark({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...props} className={cn("text-xs font-semibold tracking-tight", className)}>
      KCA
    </span>
  );
}
