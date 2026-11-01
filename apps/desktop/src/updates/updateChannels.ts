// Preview builds share nightly branding but ship without an update feed.
const PRERELEASE_VERSION_PATTERN = /^[^-+]+-(?:nightly|preview)\.\d{8}\.\d+$/;

export function isNightlyDesktopVersion(version: string): boolean {
  return PRERELEASE_VERSION_PATTERN.test(version);
}
import type { DesktopUpdateChannel } from "@t3tools/contracts";

export function resolveDefaultDesktopUpdateChannel(version: string): DesktopUpdateChannel {
  return /^[^-+]+-nightly\.\d{8}\.\d+$/.test(version) ? "nightly" : "latest";
}
