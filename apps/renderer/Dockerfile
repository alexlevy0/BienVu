FROM node:24.17.0-bookworm-slim@sha256:862263c612aa437e3037674b85419622a9d93bff80aa1eee5398dfe686375532
# Chrome/FFmpeg versions are recorded from the built image in evidence.
RUN apt-get update && apt-get install -y --no-install-recommends \
  ca-certificates ffmpeg fonts-dejavu-core libnss3 libdbus-1-3 libatk1.0-0 \
  libgbm1 libasound2 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 \
  libxdamage1 libatk-bridge2.0-0 libpango-1.0-0 libcairo2 libcups2 \
  && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10.33.2
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc tsconfig.base.json ./
COPY apps/renderer apps/renderer
COPY packages/contracts packages/contracts
COPY packages/video packages/video
COPY packages/voice packages/voice
COPY apps/web/public/fonts/inter-tight.woff2 apps/web/public/fonts/inter-tight.woff2
COPY scripts/generate-fixtures.ts scripts/generate-fixtures.ts
RUN pnpm install --frozen-lockfile --filter @bienvu/renderer... --filter bienvu
RUN pnpm fixtures && pnpm --filter @bienvu/renderer bundle
# Seul le répertoire de travail doit être modifiable à l'exécution.
# Évite aussi de recopier tous les node_modules dans une couche chown.
RUN mkdir -p /app/evidence/local/renderer && chown -R node:node /app/evidence
USER node
ENV PORT=8080
EXPOSE 8080
CMD ["pnpm", "--filter", "@bienvu/renderer", "start"]
