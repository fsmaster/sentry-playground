#!/bin/sh
# on fsmaster.com: cd /opt/sentry-playground && sh deploy/deploy.sh
set -e
cd "$(dirname "$0")"
docker compose -p sentry-playground pull -q
docker compose -p sentry-playground up -d --remove-orphans
docker image prune -f >/dev/null
