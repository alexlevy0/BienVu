FROM node:24.21.0-bookworm-slim@sha256:d6aa754f16b3197301076f047b5def2f02ea1dbbc2ca920407d46d7ec7f87b20
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
