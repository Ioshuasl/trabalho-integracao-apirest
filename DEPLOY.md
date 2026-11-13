# Deploy no Easypanel

Repositório: `https://github.com/Ioshuasl/trabalho-integracao-apirest.git` (monorepo com duas aplicações).

| Serviço | Domínio | Porta | Pasta do build |
|---|---|---|---|
| API de Pedidos (Grupo 5) | `grupo5-apirest.ioshuavps.com.br` | 5005 | `/pedidos-api` |
| API de Entregas (Grupo 7) | `grupo7-apirest.ioshuavps.com.br` | 5007 | `/entregas-api` |

Os valores secretos (senhas dos bancos e chaves de API) estão em `deploy-segredos.env`, que **não** vai para o Git.

## 1. Projeto e bancos

No Easypanel, crie um projeto (ex.: `trabalho-apirest`) e dois serviços **Postgres** (um por sistema, como manda o enunciado):

| Serviço Postgres | Banco | Usuário | Senha |
|---|---|---|---|
| `grupo5-db` | `pedidos` | `pedidos` | `G5_POSTGRES_PASSWORD` |
| `grupo7-db` | `entregas` | `entregas` | `G7_POSTGRES_PASSWORD` |

O host interno de cada banco é `<projeto>_<serviço>` (ex.: `trabalho-apirest_grupo5-db`), porta 5432.

## 2. API de Pedidos (Grupo 5)

Serviço **App**, nome `grupo5-api`:

- **Source:** GitHub, repositório acima, branch `main`.
- **Build:** Dockerfile, caminho de build `/pedidos-api`.
- **Domain:** `grupo5-apirest.ioshuavps.com.br`, porta do proxy **5005**, HTTPS ligado.
- **Environment:**

```
NODE_ENV=production
PORT=5005
DATABASE_URL=postgres://pedidos:<G5_POSTGRES_PASSWORD>@<projeto>_grupo5-db:5432/pedidos
API_KEY_ADMIN=<G5_API_KEY_ADMIN>
API_KEY_G7=<G5_API_KEY_G7>
SEED_ON_START=true
```

`SEED_ON_START=true` carrega os pedidos de teste (101 a 108) só no primeiro start, com o banco vazio. As migrations rodam sozinhas a cada start.

## 3. API de Entregas (Grupo 7)

Serviço **App**, nome `grupo7-api`:

- **Source:** o mesmo repositório e branch.
- **Build:** Dockerfile, caminho de build `/entregas-api`.
- **Domain:** `grupo7-apirest.ioshuavps.com.br`, porta do proxy **5007**, HTTPS ligado.
- **Environment:**

```
NODE_ENV=production
PORT=5007
DATABASE_URL=postgres://entregas:<G7_POSTGRES_PASSWORD>@<projeto>_grupo7-db:5432/entregas
API_KEY_WRITE=<G7_API_KEY_WRITE>
API_KEY_READ=<G7_API_KEY_READ>
G5_BASE_URL=https://grupo5-apirest.ioshuavps.com.br/api/v1
G5_API_KEY=<G5_API_KEY_G7>
```

(Também dá para usar o endereço interno `http://<projeto>_grupo5-api:5005/api/v1` em `G5_BASE_URL`.)

## 4. Conferir

```bash
curl https://grupo5-apirest.ioshuavps.com.br/api/v1/health      # {"status":"UP"}
curl https://grupo7-apirest.ioshuavps.com.br/api/v1/health      # {"status":"UP"}
curl -X POST -H "X-API-Key: <G7_API_KEY_WRITE>" https://grupo7-apirest.ioshuavps.com.br/api/v1/integracoes/pedidos/importar
```

Documentação interativa: `https://grupo5-apirest.ioshuavps.com.br/docs` e `https://grupo7-apirest.ioshuavps.com.br/docs`.

## Observações

- Cloudflare em modo Proxied: use SSL/TLS "Full" (ou "Full strict" com o certificado do Easypanel). Em "Flexible" o Traefik pode entrar em laço de redirecionamento.
- Os contratos citam as chaves de demonstração (`g7-entregas-admin-2026` etc.). Em produção use as geradas em `deploy-segredos.env` e entregue as chaves de leitura aos grupos consumidores (a do G2 é `G7_API_KEY_READ`).
- Deploy automático: ative o webhook/auto-deploy do Easypanel para redeploy a cada push no `main`.
