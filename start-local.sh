#!/usr/bin/env bash
set -euo pipefail
if [ ! -f .env ]; then
  cp .env.example .env
  echo "Created .env. Replace JWT_SECRET before production use."
fi
docker compose up --build
