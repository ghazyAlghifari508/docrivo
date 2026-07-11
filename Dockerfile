# InsForge compute worker for docrivo — persistent Playwright + DESIGN.md generation.
# Built on Fly.io remote builder via `insforge compute deploy`. No local Docker needed.
FROM node:22-bookworm-slim

# Playwright needs OS libs; install browsers + system deps in one layer.
# --with-deps pulls the apt packages chromium needs at runtime.
RUN npx --yes playwright@1.61.1 install --with-deps chromium

WORKDIR /app

# Install deps. npm install (not ci) tolerates lockfile-version drift
# between local npm 11 and the image's bundled npm.
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund

# Bundle app source: worker + src/lib + tsconfig.
COPY tsconfig.json ./
COPY worker ./worker
COPY src ./src

# Worker reads .env on local runs; compute injects env via --env-file / --env.
ENV NODE_ENV=production
ENV PORT=8080

# tsx runs TS directly — no build step, matches `npm run worker` dev flow.
CMD ["npx", "tsx", "worker/index.ts"]
