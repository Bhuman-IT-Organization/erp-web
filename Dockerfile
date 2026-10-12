# erp-web local/dev image, Next.js standalone output. API_BASE_URL comes from env/local/web.env at runtime (ADR-0014).
FROM node:22-alpine AS build
WORKDIR /app
RUN corepack enable
COPY package.json yarn.lock .yarnrc.yml ./
# yarn.lock references patch:… protocol entries; the patch files must be in the install layer.
COPY .yarn/patches ./.yarn/patches
# configs/ before install: package.json links @erp/configs to ./configs, and tsconfig.json extends it.
COPY configs ./configs
RUN corepack yarn install --immutable
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# The type check of `next build` passes Node's default heap since Phase 4.10's screens; 3 GB fits Docker Desktop's 4 GB VM.
ENV NODE_OPTIONS=--max-old-space-size=3072
# /status is force-dynamic, so the build needs no env.
RUN corepack yarn build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=3000
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]
