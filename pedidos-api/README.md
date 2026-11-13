# API de Pedidos — Grupo 5

API REST do Sistema de Pedidos, consumida pelo Grupo 7 (Entregas). **Construída pelo Grupo 7** como simulação da API do Grupo 5, reaproveitando a estrutura de dados do Contrato B (integração por banco de dados): tabelas `cliente`, `pedido` e `item_pedido`, trigger de `data_atualizacao` e a view `integracao.vw_integracao_pedidos`. Contrato: `../contrato-api-pedidos-grupo5-v1.0.md`.

Stack: Node 22 + TypeScript + Express 5 + PostgreSQL 16 (Docker) + `pg` (SQL puro) + Zod + pino + Vitest/Supertest. Mesma arquitetura da API de Entregas (monólito modular + API versionada).

## Como rodar

```bash
npm install
cp .env.example .env     # chaves de API e URL do banco
npm run db:up            # sobe o PostgreSQL em container (porta 5435)
npm run migrate          # cria as tabelas e a view de integração
npm run seed             # clientes 1-7 e pedidos 101-108 (101-107 CONFIRMADO, 108 ABERTO)
npm run dev              # http://localhost:5005/api/v1
```

Testes (usam o banco `pedidos_test`, criado automaticamente no mesmo container): `npm test`.
Produção: `npm run build && npm start`.

## Documentação e Postman

- Swagger UI: `http://localhost:5005/docs` · especificação: `http://localhost:5005/openapi.json`
- `npm run docs:gerar` regenera `docs/openapi.json` e `docs/postman/` a partir de `src/docs/openapi.ts`.
- Com a API no ar e os dados de teste carregados (`npm run seed`): `npm run test:postman` (Newman).

## Chaves de API

| Chave | Permissão |
|---|---|
| `g5-pedidos-admin-2026` | acesso total (uso interno do G5) |
| `g7-entregas-leitura-2026` | somente `GET` em `/integracao/*` (403 nas demais rotas e em escrita) |

## Endpoints (`/api/v1`)

| Método | Rota | Quem usa |
|---|---|---|
| GET | `/integracao/pedidos?pagina&tamanho` | **G7** (pedidos CONFIRMADO/CANCELADO, sem itens, formato do Contrato B) |
| GET, POST | `/clientes` | G5 |
| GET, PUT, DELETE | `/clientes/{codigo_cliente}` (DELETE desativa) | G5 |
| GET, POST | `/pedidos` | G5 |
| GET, PUT, DELETE | `/pedidos/{codigo_pedido}` (DELETE só pedido ABERTO) | G5 |
| PATCH | `/pedidos/{codigo_pedido}/status` (ABERTO → CONFIRMADO/CANCELADO; CONFIRMADO → CANCELADO) | G5 |
| GET | `/health` (sem chave) | todos |

Regras: pedido CONFIRMADO ou CANCELADO nunca é apagado; toda alteração renova `data_atualizacao` (trigger no banco), que o G7 usa para detectar mudanças; `valor_total` é calculado a partir dos itens; erros no formato padrão (`erro`, `caminho`, `data_hora`, `request_id`), ordem 401, 403, 400, 404, 409, 422.

## Estrutura

```
migrations/                 estrutura do banco (Contrato B)
seeds/dados_teste.sql       dados de teste (pedidos 101-108)
src/
  api/v1/                   roteador /api/v1 e perfis de acesso
  modules/clientes|pedidos|health
  shared/                   banco, erros e middlewares
  docs/openapi.ts           especificação OpenAPI (fonte de docs/)
```
