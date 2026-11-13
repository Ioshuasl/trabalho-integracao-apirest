# API de Entregas — Grupo 7

Implementação do contrato de integração `contrato-api-entregas-grupo7-v1.0.md`.
Stack: Node 22 + TypeScript + Express 5 + PostgreSQL 16 (Docker) + `pg` (SQL puro) + Zod + pino + Vitest/Supertest.

## Como rodar

```bash
npm install
cp .env.example .env     # chaves de API e URL do banco
npm run db:up            # sobe o PostgreSQL em container (porta 5432)
npm run migrate          # cria as tabelas
npm run dev              # http://localhost:5007/api/v1
```

Testes (usam o banco `entregas_test`, criado automaticamente no mesmo container):

```bash
npm test
```

Produção: `npm run build && npm start`.

## Documentação da API e coleção Postman

- Swagger UI: `http://localhost:5007/docs` · especificação: `http://localhost:5007/openapi.json` (sem X-API-Key)
- Arquivos gerados em `docs/` (`npm run docs:gerar` regenera a partir de `src/docs/openapi.ts`):
  - `docs/openapi.json`
  - `docs/postman/entregas-g7.postman_collection.json` e `docs/postman/entregas-g7-local.postman_environment.json`
- A coleção traz testes automáticos (fluxo completo, exclusão, cenários de erro 400/401/403/404/409/422 e integração G5).
  Com a API no ar: `npm run test:postman` (Newman). Evidência de testes: `npm test` e esta execução.

## Cadeia de integração

```
Grupo 5 (Pedidos)  ──►  Grupo 7 (Entregas)  ──►  Grupo 2 (Vendas)
    fornecedor            esta API                 consumidor
```

- **G7 consome o G5:** importa pedidos da API de Pedidos (`../pedidos-api`, contrato `../contrato-api-pedidos-grupo5-v1.0.md`).
- **G2 consome o G7:** consulta entregas por `GET /entregas?id_pedido={número da venda}` com a chave somente leitura (contrato `../contrato-api-entregas-grupo7-v1.0.md`).

## Integração com a API de Pedidos (Grupo 5)

Configure em `.env`: `G5_BASE_URL` (`http://localhost:5005/api/v1`) e `G5_API_KEY` (`g7-entregas-leitura-2026`). Com a API do G5 no ar (`cd ../pedidos-api && npm run db:up && npm run migrate && npm run seed && npm run dev`):

```bash
npm run importar:pedidos        # ou: POST /api/v1/integracoes/pedidos/importar (chave de escrita)
```

Regras (Contrato B, estrutura reaproveitada do G5):

1. Lê todas as páginas de `GET /integracao/pedidos`, com timeout de 5 s e até 3 repetições (1, 2 e 4 s) em falha de rede, timeout e 503; 500/502 repetem uma vez; 401/403/4xx não repetem.
2. Valida cada pedido (campos obrigatórios, tipos, CEP de 8 dígitos, UF válida, valor e quantidade > 0, data não futura, status CONFIRMADO/CANCELADO). Pedido inválido é rejeitado com `CAMPO_OBRIGATORIO`, `TIPO_INVALIDO` ou `VALOR_INVALIDO` e registrado; os demais continuam. `codigo_pedido` repetido na leitura é rejeitado como `REGISTRO_DUPLICADO`.
3. **Inclusão:** pedido CONFIRMADO novo cria a entrega (`id_pedido` = `codigo_pedido`, `id_cliente` = `codigo_cliente`, `origem = PEDIDOS_G5`) só com o que o G5 fornece: nome, endereço (como veio), cidade, UF e CEP. O restante fica nulo e listado em `pendencias` (`transportadora`, `endereco_destino.numero`, `endereco_destino.bairro`, `data_prevista`, `valor_frete`). O Grupo 7 completa depois com `PUT /entregas/{id}`.
4. **Atualização:** `data_atualizacao` mais recente atualiza endereço e nome da entrega enquanto ela estiver `AGUARDANDO_COLETA` ou `EM_TRANSITO`; depois disso é `REGRA_NEGOCIO` (tratamento manual). Igual: sem alteração. Mais antiga: rejeitada.
5. **Cancelamento:** pedido CANCELADO cancela a entrega se ela ainda não saiu para entrega (com registro no histórico); se já saiu, rejeita para decisão manual. CANCELADO que nunca chegou confirmado é ignorado, sem erro. CANCELADO não volta a CONFIRMADO.
6. É idempotente (`pedidos_importados` guarda a última leitura de cada pedido; reexecutar não duplica) e um pedido rejeitado é lido de novo na próxima execução, depois que o G5 corrige.
7. Registra cada chamada e ocorrência em `integracao_logs` (`GET /api/v1/integracoes/logs`); pedidos importados em `GET /api/v1/integracoes/pedidos`.

Falha do G5 na leitura: `503 INTEGRACAO_INDISPONIVEL` (fora do ar/timeout/503), `502 INTEGRACAO_CONTRATO_INVALIDO`, `502 INTEGRACAO_AUTENTICACAO` ou `502 INTEGRACAO_ERRO`. A API nunca cai por causa do G5.

## Estrutura (monólito modular + API versionada)

```
migrations/                 scripts SQL (entrega: script do banco)
src/
  server.ts                 bootstrap e shutdown gracioso
  app.ts                    composição do Express
  config/env.ts             variáveis de ambiente validadas
  api/v1/index.ts           roteador /api/v1 (autenticação + módulos)
  modules/
    entregas/               módulo de negócio
      entregas.routes.ts      rotas
      entregas.controller.ts  HTTP (parse de id/query/corpo)
      entregas.service.ts     regras de negócio e transações
      entregas.repository.ts  SQL
      entregas.schemas.ts     validação estrutural (400)
      entregas.validation.ts  validação semântica (422)
      status.ts               enum e transições de status
    integracao-pedidos/     consumidor do G5 (cliente HTTP, validação, importação, logs)
    health/                 GET /health
  docs/openapi.ts           especificação OpenAPI (fonte de docs/)
  cli/importar-pedidos.ts   importação via linha de comando
  shared/
    database/               pool, transações, migrations
    http/                   erros do contrato e middlewares
```

Uma versão nova da API (`/api/v2`) entra como `src/api/v2/` reaproveitando os módulos.

## Chaves de API (contrato, seção 1.3)

| Chave | Permissão |
|---|---|
| `g7-entregas-admin-2026` | leitura e escrita (uso interno do G7) |
| `g2-vendas-leitura-2026` | somente leitura, entregue ao G2 (403 em POST/PUT/PATCH/DELETE) |

Configuradas em `API_KEY_WRITE` e `API_KEY_READ` no `.env`.

## Decisões de implementação

- Ordem dos erros: 401 → 403 → 400 → 404 → 409 → 422. Exceção: `status_entrega` fora do enum no PATCH retorna 422 antes de checar a transição, pois não existe transição para um valor inválido.
- `POST` duplicado é barrado por checagem e por índice único parcial (`id_pedido` onde status ≠ `CANCELADA`), cobrindo requisições simultâneas.
- PUT, PATCH e DELETE usam `SELECT ... FOR UPDATE` em transação para evitar corrida entre mudanças de status.
- Banco fora do ar vira `503` com `Retry-After: 5`, inclusive em `/health`.
- Logs JSON (pino) com `request_id`, o mesmo valor devolvido no cabeçalho `X-Request-Id` e no corpo de erro.
