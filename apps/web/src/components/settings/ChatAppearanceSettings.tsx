import { useRef, useState } from "react";
import { useClientSettings, useUpdateClientSettings } from "../../hooks/useSettings";
import { Button } from "../ui/button";
import { Switch } from "../ui/switch";
import { SettingsRow, SettingsSection } from "./settingsLayout";

async function readBackground(file: File): Promise<string> {
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    throw new Error("Choose a PNG, JPEG, or WebP image.");
  }
  if (file.size > 20 * 1024 * 1024) throw new Error("Choose an image smaller than 20 MB.");
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not read this image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = canvas.toDataURL("image/webp", 0.75);
    if (image.length > 1024 * 1024)
      throw new Error("This image is too detailed. Try a smaller image.");
    return image;
  } finally {
    bitmap.close();
  }
}

export function ChatAppearanceSettings() {
  const settings = useClientSettings();
  const update = useUpdateClientSettings();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dim, setDim] = useState<number | null>(null);
  const save = async (patch: Parameters<typeof update>[0]) => {
    setError(null);
    try {
      await update(patch);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save appearance settings.");
    }
  };
  return (
    <SettingsSection title="Chat workspace" id="chat-workspace">
      <SettingsRow
        title="Chat tabs"
        description="Keep opened chats in a tab bar. Closing a tab leaves its chat and agents running."
        control={
          <Switch
            aria-label="Chat tabs"
            checked={settings.chatTabsEnabled}
            onCheckedChange={(checked) => void save({ chatTabsEnabled: checked })}
          />
        }
      />
      <SettingsRow
        title="Background image"
        description="Choose your own artwork or photo. Images are resized for fast loading."
        status={error}
        control={
          <div className="flex gap-2">
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              aria-label="Background image"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                setBusy(true);
                setError(null);
                try {
                  await update({ chatBackgroundImage: await readBackground(file) });
                } catch (cause) {
                  setError(cause instanceof Error ? cause.message : "Could not load image.");
                } finally {
                  setBusy(false);
                }
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => input.current?.click()}
            >
              {busy ? "Loading…" : "Choose image"}
            </Button>
            {settings.chatBackgroundImage ? (
              <Button
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => void save({ chatBackgroundImage: null })}
              >
                Remove
              </Button>
            ) : null}
          </div>
        }
      />
      {settings.chatBackgroundImage ? (
        <>
          <div
            className="relative h-40 overflow-hidden rounded-lg border border-border"
            aria-label="Background preview"
            style={{
              backgroundImage: `url(${JSON.stringify(settings.chatBackgroundImage)})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
            }}
          >
            <div
              className="absolute inset-0 bg-background"
              style={{ opacity: dim ?? settings.chatBackgroundDim }}
            />
            <p className="relative p-4 text-sm text-foreground">
              Your messages stay readable over your background.
            </p>
          </div>
          <SettingsRow
            title="Background dimming"
            description="Fade the image into your current theme."
            control={
              <input
                type="range"
                aria-label="Background dimming"
                min="0"
                max="100"
                value={Math.round((dim ?? settings.chatBackgroundDim) * 100)}
                onChange={(event) => setDim(Number(event.target.value) / 100)}
                onPointerUp={(event) => {
                  void save({ chatBackgroundDim: Number(event.currentTarget.value) / 100 });
                  setDim(null);
                }}
                onKeyUp={(event) => {
                  void save({ chatBackgroundDim: Number(event.currentTarget.value) / 100 });
                  setDim(null);
                }}
              />
            }
          />
          <SettingsRow
            title="Dotted texture"
            description="Add a static halftone texture over the artwork."
            control={
              <Switch
                aria-label="Dotted texture"
                checked={settings.chatBackgroundTexture}
                onCheckedChange={(checked) => void save({ chatBackgroundTexture: checked })}
              />
            }
          />
        </>
      ) : null}
    </SettingsSection>
  );
}
