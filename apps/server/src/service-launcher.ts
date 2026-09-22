import { isEntrypoint } from "./entrypoint.ts";
import { main } from "./serviceLauncher.ts";

// Standalone entry point for the boot service unit: `node service-launcher.mjs`.
// Kept separate from the CLI bundle because a single-file bundle shares one
// import.meta.url, which would make the entrypoint check below fire for every
// `kca` invocation as well. (Upstream hosts the launcher as a hidden
// subcommand of its self-contained executable instead.)
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
