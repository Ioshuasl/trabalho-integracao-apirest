#!/bin/sh
set -e
# aplica as migrations pendentes (idempotente) e sobe a API
node dist/shared/database/migrate-cli.js
exec node dist/server.js
