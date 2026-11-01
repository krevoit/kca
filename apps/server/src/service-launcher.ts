import { isEntrypoint } from "./entrypoint.ts";
import { main } from "./serviceLauncher.ts";

// Standalone entry point for the boot service unit: `node service-launcher.mjs`.
if (
  isEntrypoint({
    moduleUrl: import.meta.url,
    entryPath: process.argv[1],
    runtimeMain: import.meta.main,
  })
) {
  main().catch((cause: unknown) => {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    process.stderr.write(`[service-launcher] ${error.message}\n`);
    process.exitCode = 1;
  });
}
