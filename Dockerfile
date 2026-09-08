# KCA (krevoit/kca) — headless server + bundled WebUI in a single container.
#
# Build:   docker build -t kca .
# Run:     docker run -d --name kca -p 8080:8080 -v kca-data:/data ghcr.io/krevoit/kca:latest
# Then open http://<host>:8080 and pair (see README).
#
# Layout notes:
# - The server bundle lives at /app/dist (bin.mjs) with the built web client
#   at /app/dist/client, mirroring `node apps/server/scripts/cli.ts build`.
# - Runtime state (sqlite, settings, secrets) lives under T3CODE_HOME (/data).
#   Keep it on a volume or pairing tokens, sessions, and settings are lost on
#   container replace.

ARG NODE_VERSION=24

# ---------------------------------------------------------------- build ---
FROM node:${NODE_VERSION}-bookworm AS build

RUN corepack enable

WORKDIR /app

# Install the Vite+ toolchain the repo's scripts expect (provides `vp`;
# `vp pm` forwards to the underlying pnpm). The installer puts the binary in
# ~/.local/share/vite-plus/bin and only amends shell rc files, so extend PATH
# explicitly for non-interactive RUN steps.
RUN curl -fsSL https://vite.plus | bash
ENV PATH="${PATH}:/root/.local/share/vite-plus/bin"
RUN which vp && vp --version

COPY . .

# Full workspace install (respects pnpm-lock.yaml via `vp i`).
RUN vp i

# Build the web client, then bundle the server + web client into
# apps/server/dist (bin.mjs + service-launcher.mjs + client/).
RUN vp run --filter @t3tools/web build
RUN node apps/server/scripts/cli.ts build --verbose

# Trim to a self-contained runtime dir: server package + production deps.
# The base image already ships a corepack pnpm shim resolving to the same pnpm
# 11 line the toolchain vendors; `--legacy` keeps `deploy` working without
# injected workspace deps.
RUN pnpm --version \
  && pnpm --filter t3 deploy --prod --legacy /deploy

# pnpm deploy follows `files: ["dist"]`, so the bundled client comes along.
# Fail loudly here (not at container start) if it did not.
RUN test -f /deploy/dist/bin.mjs && test -f /deploy/dist/client/index.html

# ----------------------------------------------------------------- run ---
FROM node:${NODE_VERSION}-bookworm-slim AS run

# ca-certificates: TLS (relay, provider APIs). curl: HEALTHCHECK + the
# managed-cloudflared bootstrap used by T3 Connect.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=build /deploy /app

ENV NODE_ENV=production \
  T3CODE_HOME=/data \
  T3CODE_HOST=0.0.0.0 \
  T3CODE_PORT=8080 \
  T3CODE_NO_BROWSER=true

VOLUME /data
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD curl -fsS http://127.0.0.1:8080/.well-known/t3/environment || exit 1

ENTRYPOINT ["node", "dist/bin.mjs", "serve"]
