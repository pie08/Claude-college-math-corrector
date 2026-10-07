# Grading server (services/api) with the SymPy checker (services/cas).
#   docker build -t calc-tutor-api .
#   docker run -p 8787:8787 -e ANTHROPIC_API_KEY=... -e API_SHARED_SECRET=... calc-tutor-api
# Secrets come from the host's environment, never from files baked into the image.
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY services/cas/requirements.txt services/cas/
RUN python3 -m venv /opt/cas && /opt/cas/bin/pip install --no-cache-dir -r services/cas/requirements.txt
ENV CAS_PYTHON=/opt/cas/bin/python

# npm needs every workspace manifest to check the lockfile, but only the
# server's dependencies are installed.
COPY package.json package-lock.json ./
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
COPY services/api/package.json services/api/
RUN npm ci --workspace services/api --no-audit --no-fund

COPY packages/shared packages/shared
COPY services/api/src services/api/src
COPY services/api/tsconfig.json services/api/
COPY services/cas/cas_worker.py services/cas/

ENV NODE_ENV=production PORT=8787
EXPOSE 8787
USER node
CMD ["npx", "tsx", "services/api/src/server.ts"]
