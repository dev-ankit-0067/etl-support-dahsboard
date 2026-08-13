# syntax=docker/dockerfile:1
# =============================================================================
# OpsGuardian — single-container image (frontend + backend)
#   Stage 1 builds the React SPA (Vite).
#   Stage 2 runs nginx (serves the SPA + reverse-proxies /api) and the FastAPI
#   backend (gunicorn/uvicorn), supervised by supervisord.
# Target platform for AWS Fargate: linux/amd64 (pass --platform on build).
# =============================================================================

# ---- Stage 1: build the frontend --------------------------------------------
FROM node:24-bookworm-slim AS frontend
ENV CI=true
RUN npm install -g pnpm@9
WORKDIR /repo
# Copy the whole workspace so pnpm can resolve workspace packages
# (the .dockerignore keeps node_modules/.venv/secrets out).
# Not --frozen-lockfile: the committed lockfile's "overrides" snapshot is out of
# sync with pnpm-workspace.yaml, so allow pnpm to reconcile during the build.
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --dir artifacts/etl-dashboard run build
# Vite output: artifacts/etl-dashboard/dist/public

# ---- Stage 2: runtime -------------------------------------------------------
FROM python:3.12-slim AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PORT=8080 \
    WEB_CONCURRENCY=2

# Apply available OS security patches (glibc/perl/nginx CVEs live in base packages),
# then install what we need. `upgrade` pulls the latest patched versions Debian has
# published at build time; combine with `docker build --pull` (see deploy.sh) so the
# base layer itself is refreshed first.
RUN apt-get update \
 && apt-get -y upgrade \
 && apt-get install -y --no-install-recommends nginx supervisor curl ca-certificates \
 && apt-get -y autoremove --purge \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps
COPY aws-backend/requirements.txt ./
RUN pip install --upgrade pip && pip install -r requirements.txt

# Backend source
COPY aws-backend/app ./app
COPY aws-backend/gunicorn_conf.py ./

# Frontend static bundle from stage 1
COPY --from=frontend /repo/artifacts/etl-dashboard/dist/public /var/www/html

# Process/serving config
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/supervisord.conf /etc/supervisord.conf
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN rm -f /etc/nginx/sites-enabled/default \
 && chmod +x /usr/local/bin/entrypoint.sh

EXPOSE 80

# ALB and Docker both probe the backend health endpoint (proxied by nginx).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://localhost/healthz || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
