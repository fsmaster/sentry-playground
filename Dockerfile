# ---- build the browser bundle, upload source maps, drop them -----------------
FROM node:24-slim AS web
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY vite.config.js ./
COPY web web
ARG RELEASE=dev
ENV RELEASE=${RELEASE} SENTRY_ORG=fsmaster
# token comes in as a build secret, so it never lands in an image layer
RUN --mount=type=secret,id=sentry_token \
    SENTRY_AUTH_TOKEN=$(cat /run/secrets/sentry_token 2>/dev/null) npx vite build

# ---- runtime -------------------------------------------------------------------
FROM node:24-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY server server
COPY web/src/sdks.json web/src/sdks.json
COPY --from=web /app/dist dist
ARG RELEASE=dev
ENV RELEASE=${RELEASE} NODE_ENV=production PORT=3090
EXPOSE 3090
CMD ["node", "--disable-warning=ExperimentalWarning", "--import", "./server/instrument.js", "server/server.js"]
