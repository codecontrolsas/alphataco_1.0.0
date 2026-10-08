# syntax=docker/dockerfile:1
# Next.js 16 standalone + Prisma 7. La imagen se construye en GitHub Actions y se
# publica en el registry del VPS: la VPS no buildea (ver docs/deploy/runbook.md).

##### deps #####
FROM node:24-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

##### tools #####
# Lo unico que el contenedor necesita ademas del standalone de Next:
# - el CLI de Prisma, para `migrate deploy` en el entrypoint (y dotenv, que
#   importa prisma.config.ts);
# - lo que importa scripts/seed-company.ts para instancias nuevas con
#   RUN_SEED=true: @prisma/client (runtime del cliente generado),
#   @prisma/adapter-pg y pg.
# Las versiones salen del lockfile, no de package.json: la imagen usa
# exactamente lo que el repo resolvio. Copiar node_modules entero seria ~1 GB
# para un CLI; el standalone ya trae las dependencias del server.
FROM node:24-bookworm-slim AS tools
# openssl: Prisma lo usa para elegir el binario del schema engine (sin el, en
# slim cae al de openssl 1.1 y `migrate deploy` falla al arrancar).
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /tools
COPY package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
  V() { node -p "require('./package-lock.json').packages['node_modules/$1'].version"; }; \
  npm init -y >/dev/null \
  && npm install --no-audit --no-fund --omit=dev \
       "prisma@$(V prisma)" "@prisma/client@$(V @prisma/client)" \
       "@prisma/adapter-pg@$(V @prisma/adapter-pg)" "pg@$(V pg)" "dotenv@$(V dotenv)" \
  && rm -f package.json package-lock.json

##### demo-tools #####
# Dependencias del reset diario de la demo (scripts/demo/reset.ts). Van a un
# node_modules PROPIO dentro de scripts/demo y no al de la app: npm resolveria las
# transitivas de better-auth y del SDK de S3 por su cuenta y podrian pisar las
# versiones que el standalone de Next trazo para el server.
FROM node:24-bookworm-slim AS demo-tools
WORKDIR /demo-tools
COPY package-lock.json .npmrc ./
RUN --mount=type=cache,target=/root/.npm \
  V() { node -p "require('./package-lock.json').packages['node_modules/$1'].version"; }; \
  npm init -y >/dev/null \
  && npm install --no-audit --no-fund --omit=dev \
       "@faker-js/faker@$(V @faker-js/faker)" "pdf-lib@$(V pdf-lib)" \
       "@aws-sdk/client-s3@$(V @aws-sdk/client-s3)" "better-auth@$(V better-auth)" \
  && rm -f package.json package-lock.json

##### build #####
# Stage completa (node_modules + prisma.config.ts + .next). Ademas de producir el
# standalone, la usa el servicio `migrate` del docker-compose local.
FROM node:24-bookworm-slim AS build
WORKDIR /app
ARG NEXT_PUBLIC_PROJECT_URL
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_POSTHOG_KEY
ARG NEXT_PUBLIC_POSTHOG_HOST
ARG NEXT_PUBLIC_PREPARTE_BUCKET
ARG NEXT_PUBLIC_SHOW_LOGS
# NODE_OPTIONS: el heap por defecto de Node se calcula segun la memoria visible y
# se queda corto para `next build` (muere con "heap out of memory"). Solo aplica
# a este stage, no al runtime.
ENV NEXT_PUBLIC_PROJECT_URL=$NEXT_PUBLIC_PROJECT_URL \
    NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL \
    NEXT_PUBLIC_POSTHOG_KEY=$NEXT_PUBLIC_POSTHOG_KEY \
    NEXT_PUBLIC_POSTHOG_HOST=$NEXT_PUBLIC_POSTHOG_HOST \
    NEXT_PUBLIC_PREPARTE_BUCKET=$NEXT_PUBLIC_PREPARTE_BUCKET \
    NEXT_PUBLIC_SHOW_LOGS=$NEXT_PUBLIC_SHOW_LOGS \
    DATABASE_URL=postgresql://build:build@localhost:5432/build \
    NEXT_TELEMETRY_DISABLED=1 \
    NODE_OPTIONS=--max-old-space-size=4096
# Las NEXT_PUBLIC_* se hornean en el bundle. Sin BASE_URL, auth.ts y los mails
# caen a http://localhost:3000 y el build pasaria igual, dejando localhost en
# produccion sin ningun aviso. Se corta aca.
RUN test -n "$NEXT_PUBLIC_BASE_URL" \
  || { echo "ERROR: falta el build-arg NEXT_PUBLIC_BASE_URL (no se hornea localhost en silencio)"; exit 1; }
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN --mount=type=cache,target=/app/.next/cache npx next build

##### runner #####
FROM node:24-bookworm-slim AS runner
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# CHECKPOINT_DISABLE: el CLI de Prisma no sale a internet a buscar versiones
# nuevas en cada arranque del contenedor.
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 \
    CHECKPOINT_DISABLE=1
RUN groupadd -g 1001 nodejs && useradd -m -u 1001 -g nodejs nextjs

COPY --from=build /app/public ./public
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

# Config, migraciones y cliente generado de Prisma, en las mismas rutas relativas
# que en el repo: prisma.config.ts apunta a prisma/schema.prisma y
# prisma/migrations, y el seed importa ../src/generated/prisma/client.ts.
COPY --from=build --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=build --chown=nextjs:nodejs /app/prisma.config.ts ./prisma.config.ts
COPY --from=build --chown=nextjs:nodejs /app/src/generated ./src/generated
# Seed de empresa (RUN_SEED=true) y los modulos locales que importa.
COPY --from=build --chown=nextjs:nodejs /app/scripts/seed-company.ts ./scripts/seed-company.ts
COPY --from=build --chown=nextjs:nodejs /app/scripts/seed/permission-rows.ts ./scripts/seed/permission-rows.ts
COPY --from=build --chown=nextjs:nodejs /app/src/features/Permissions/permissions-map.ts ./src/features/Permissions/permissions-map.ts
COPY --from=build --chown=nextjs:nodejs /app/src/features/Warehouses/lib/default-units.ts ./src/features/Warehouses/lib/default-units.ts
# CLI de Prisma + deps del seed, encima del node_modules trazado del standalone.
COPY --from=tools --chown=nextjs:nodejs /tools/node_modules ./node_modules
# Reset diario de la demo (lo corre un Schedule de Dokploy, ver scripts/demo/reset.ts)
# con sus dependencias aparte.
COPY --from=build --chown=nextjs:nodejs /app/scripts/demo ./scripts/demo
COPY --from=demo-tools --chown=nextjs:nodejs /demo-tools/node_modules ./scripts/demo/node_modules

COPY --from=build --chown=nextjs:nodejs /app/docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Commit de esta imagen, que /api/health devuelve para que el deploy distinga el
# contenedor nuevo del que todavia esta corriendo. Va al final a proposito:
# cambia en cada commit y aca solo invalida estas ultimas capas.
ARG GIT_SHA=""
ENV GIT_SHA=$GIT_SHA

USER nextjs
EXPOSE 3000
# Sin curl en la imagen slim: el chequeo usa el fetch de Node.
HEALTHCHECK --interval=15s --timeout=5s --start-period=90s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["./entrypoint.sh"]
