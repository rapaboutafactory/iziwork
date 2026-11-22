FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
ENV COREPACK_HOME=/opt/corepack
RUN corepack enable && corepack prepare pnpm@11.25.0 --activate
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile && node -e "require('fs').rmSync('.data/pnpm-store',{recursive:true,force:true})"

FROM dependencies AS build
ENV NEXT_TELEMETRY_DISABLED=1
COPY . .
RUN pnpm build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
RUN corepack enable
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    COREPACK_HOME=/opt/corepack \
    HOSTNAME=0.0.0.0 \
    PORT=3000
# CLI-команды миграций, администратора и очистки используют TypeScript runtime.
# Поэтому зависимости разработки здесь намеренно сохранены.
COPY --from=build --chown=node:node /app /app
COPY --from=dependencies --chown=node:node /opt/corepack /opt/corepack
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
