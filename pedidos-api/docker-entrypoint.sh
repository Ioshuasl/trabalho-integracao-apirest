#!/bin/sh
set -e
# aplica as migrations pendentes (idempotente)
node dist/shared/database/migrate-cli.js

# SEED_ON_START=true carrega os dados de teste (clientes 1-7, pedidos 101-108) só se o banco estiver vazio
if [ "$SEED_ON_START" = "true" ]; then
  node dist/cli/seed.js --se-vazio
fi

exec node dist/server.js
