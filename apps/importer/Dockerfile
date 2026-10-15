FROM node:26.11.1-bookworm-slim@sha256:86f07bc9c5dce4578cf37e5a418b7bfc7f817cda25cde66e2b66e95ed86c4567
# Debian replaces old Chromium packages when publishing security updates.
# Use the current package while enforcing the reviewed minimum version.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates chromium \
  && dpkg --compare-versions "$(dpkg-query -W -f='${Version}' chromium)" ge '155.0.8059.39-1~deb12u1' \
  && chromium --version \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.33.2
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/importer apps/importer
COPY packages/contracts packages/contracts
COPY packages/importers packages/importers
COPY scripts/import-transport.ts scripts/import-transport.ts
COPY scripts/import-browser-transport.ts scripts/import-browser-transport.ts
COPY scripts/import-photo-preview.ts scripts/import-photo-preview.ts
RUN pnpm install --frozen-lockfile --filter @bienvu/importer... --filter bienvu
USER node
ENV PORT=8080
ENV CHROMIUM_PATH=/usr/bin/chromium
EXPOSE 8080
CMD ["node", "--import", "tsx", "apps/importer/src/server.ts"]
