import type { ComponentProps } from "react";
import { useClientSettings } from "../../hooks/useSettings";
import { SidebarInset } from "../ui/sidebar";

export function ChatWorkspace({ children, ...props }: ComponentProps<typeof SidebarInset>) {
  const { chatBackgroundImage, chatBackgroundDim, chatBackgroundTexture } = useClientSettings();
  return (
    <SidebarInset {...props} data-chat-wallpaper={chatBackgroundImage ? "true" : undefined}>
      {chatBackgroundImage ? (
        <div
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
          aria-hidden="true"
        >
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${JSON.stringify(chatBackgroundImage)})` }}
          />
          <div className="absolute inset-0 bg-background" style={{ opacity: chatBackgroundDim }} />
          <div
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(to bottom, transparent 15%, var(--background) 100%)",
            }}
          />
          {chatBackgroundTexture ? (
            <div
              className="absolute inset-0 opacity-30"
              style={{
                backgroundImage: "radial-gradient(black 0.7px, transparent 0.7px)",
                backgroundSize: "3px 3px",
              }}
            />
          ) : null}
        </div>
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-col">{children}</div>
    </SidebarInset>
  );
}
