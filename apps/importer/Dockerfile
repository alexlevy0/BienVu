FROM node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates chromium=154.0.8037.92-1~deb12u1 && rm -rf /var/lib/apt/lists/*
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
