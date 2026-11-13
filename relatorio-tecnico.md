# Relatório técnico — Grupo 7 (Sistema de Entregas)

**Trabalho Prático:** Integração de Aplicações via API REST · **Grupo 7:** Ioshua Souza Lopes e Gabriel · **Data:** 13/11/2026

## 1. Visão geral

O Grupo 7 é o Sistema de Entregas. Na cadeia de integração definida pelo professor, ele tem os dois papéis:

```
Grupo 5 (Pedidos)  ──►  Grupo 7 (Entregas)  ──►  Grupo 2 (Vendas)
   fornecedor            fornecedor e                consumidor
                         consumidor
```

| Papel | O que o Grupo 7 faz |
|---|---|
| **Consumidor do Grupo 5** | Importa os pedidos da API de Pedidos e cria, atualiza ou cancela as entregas correspondentes |
| **Fornecedor para o Grupo 2** | Expõe a API de Entregas, que o Grupo 2 consulta para saber em que pé está a entrega de cada venda |

**O que é real e o que é simulação.** A API do Grupo 5 ainda não estava disponível. Para a integração não ficar incompleta, o grupo construiu uma **API de Pedidos que reaproveita a estrutura de dados do Contrato B** (a integração anterior, por banco de dados): as tabelas `cliente`, `pedido` e `item_pedido`, a trigger de `data_atualizacao` e a view `vw_integracao_pedidos`. Ela está em `pedidos-api/`, é independente da API de Entregas e tem seu próprio PostgreSQL. Quando o Grupo 5 tiver a API real, basta trocar a URL e a chave em `.env` e ajustar o que divergir do contrato.

## 2. Arquitetura

### 2.1 Independência dos sistemas

Cada sistema é uma aplicação própria, com banco próprio em container Docker. A comunicação entre eles é **somente por HTTP**: nenhum sistema acessa o banco do outro.

```
 pedidos-api (G5)                 entregas-api (G7)                      Grupo 2
┌────────────────┐   HTTP/JSON   ┌───────────────────────────┐  HTTP/JSON  ┌─────────┐
│ /integracao/   │◄──────────────│ módulo integracao-pedidos │             │ consumo │
│   pedidos      │  X-API-Key    │  (cliente, validação,     │             │ de GET  │
│ /pedidos       │               │   importação, logs)       │             │ /entregas│
│ /clientes      │               │ módulo entregas           │◄────────────│         │
└───────┬────────┘               │  (rotas, regras, SQL)     │  X-API-Key  └─────────┘
        │                        └─────────────┬─────────────┘
   PostgreSQL :5435                       PostgreSQL :5432
   (banco do G5)                          (banco do G7)
```

### 2.2 Monólito modular com API versionada

Cada API é um único processo (monólito), dividido em módulos com fronteiras claras. Um módulo só usa outro pelo `index.ts` dele (sua API pública).

```
entregas-api/
  migrations/                 scripts SQL do banco (entrega: script de criação das tabelas)
  src/
    api/v1/                   roteador /api/v1 (versionamento: uma /api/v2 entraria ao lado)
    modules/
      entregas/               rotas, controller, service, repository, schemas, validation, status
      integracao-pedidos/     cliente HTTP do G5, validação do Contrato B, importação, logs
      health/
    shared/                   banco (pool, transações, migrations), erros e middlewares
    docs/openapi.ts           especificação OpenAPI (fonte da documentação)
    cli/importar-pedidos.ts   importação por linha de comando
```

Dentro de cada módulo, as camadas têm um papel só: **rotas/controller** cuidam de HTTP (ler id, query e corpo); **service** guarda as regras de negócio e as transações; **repository** é só SQL; **schemas** validam a estrutura do JSON e **validation** valida os valores.

### 2.3 Tecnologias

| Item | Escolha | Motivo |
|---|---|---|
| Linguagem e servidor | Node 22, TypeScript, Express 5 | Stack definida pelo grupo; Express 5 trata erros de rotas assíncronas |
| Banco | PostgreSQL 16 em container Docker (um por sistema) | Banco próprio por grupo, reproduzível com `docker compose` |
| Acesso a dados | `pg` com SQL escrito à mão | Controle total das transações e do script SQL que o trabalho exige |
| Validação | Zod (estrutura) + funções próprias (valores) | Separa o erro de estrutura (400) do erro de valor (422), como o contrato manda |
| Logs | pino (JSON) | Logs estruturados com `request_id`, para rastrear uma ocorrência nos dois sistemas |
| Testes | Vitest + Supertest; coleção Postman com Newman | Testes de integração contra PostgreSQL real; Postman serve de documentação executável |
| Documentação | OpenAPI 3 + Swagger UI em `/docs` | A mesma especificação gera a documentação, o `openapi.json` e a coleção Postman |

## 3. Contratos de integração

| Contrato | Fornecedor → Consumidor | Arquivo |
|---|---|---|
| API de Entregas | Grupo 7 → Grupo 2 | `contrato-api-entregas-grupo7-v1.0.md` |
| API de Pedidos | Grupo 5 → Grupo 7 | `contrato-api-pedidos-grupo5-v1.0.md` (proposta do G7, a validar com o G5) |

Os dois contratos definem identificação da API, endpoints, estrutura JSON, códigos HTTP, formato de erro, tratamento de falhas (timeout, repetição), responsabilidades, log mínimo e aceite. O aceite do Grupo 2 e do Grupo 5 ainda precisa ser registrado.

## 4. API de Entregas (Grupo 7 como fornecedor)

### 4.1 Endpoints

| Método | Rota | Finalidade |
|---|---|---|
| GET | `/entregas` | Listar, com filtros `id_pedido`, `status_entrega` e paginação |
| GET | `/entregas/{id}` | Consultar |
| POST | `/entregas` | Cadastrar (uso interno do G7) |
| PUT | `/entregas/{id}` | Atualizar dados cadastrais (só em `AGUARDANDO_COLETA` ou `EM_TRANSITO`) |
| PATCH | `/entregas/{id}/status` | Mudar o status (só transições permitidas) |
| GET | `/entregas/{id}/historico` | Histórico de status |
| DELETE | `/entregas/{id}` | Excluir (só `AGUARDANDO_COLETA`; depois, cancelar pelo PATCH) |
| GET | `/health` | Disponibilidade (sem chave) |

O Grupo 2 usa apenas as leituras: `GET /entregas?id_pedido={número da venda}` e o histórico.

### 4.2 Regras de negócio

- **Status e transições:** `AGUARDANDO_COLETA → EM_TRANSITO → SAIU_PARA_ENTREGA → ENTREGUE`, com `NAO_ENTREGUE`, `DEVOLVIDA` e `CANCELADA`; os estados finais não têm saída. Toda mudança entra no histórico.
- **Uma entrega ativa por pedido:** garantida por um índice único parcial no banco (`id_pedido` onde o status não é `CANCELADA`), o que vale também sob requisições simultâneas.
- **`data_entrega`:** obrigatória e não futura em `ENTREGUE`, proibida nos demais.
- **PUT:** o status só muda pelo PATCH; `id_pedido` e `id_cliente` são imutáveis (o `id_cliente` pode ser preenchido uma vez, se vier nulo).

### 4.3 Autenticação, erros e códigos HTTP

- **Autenticação:** cabeçalho `X-API-Key`. A chave de leitura (entregue ao G2) recebe 403 em escrita; a chave de escrita é de uso interno do G7.
- **Códigos:** 200, 201, 204, 400, 401, 403, 404, 409, 422, 500 e 503, cada um com uso fixo no contrato. Regra de classificação: **400** é estrutura (JSON malformado, campo ausente, tipo errado, parâmetro inválido); **422** é valor com tipo certo que viola formato, faixa ou regra de negócio.
- **Formato de erro único:** `erro` (`status`, `codigo`, `mensagem`, `detalhes` por campo), `caminho`, `data_hora` e `request_id`. O consumidor decide pelo `codigo`, não pelo texto.
- **Ordem de verificação:** 401, 403, 400, 404, 409, 422.

## 5. Consumo da API de Pedidos (Grupo 7 como consumidor)

### 5.1 Fluxo da importação

A importação é disparada sob demanda (`POST /integracoes/pedidos/importar` ou `npm run importar:pedidos`). Ela lê todas as páginas de `GET /integracao/pedidos`, valida cada pedido e aplica as regras do Contrato B:

| Situação do pedido no G5 | O que o G7 faz |
|---|---|
| CONFIRMADO que o G7 ainda não tem | Cria a entrega (`id_pedido` = `codigo_pedido`, `id_cliente` = `codigo_cliente`) |
| Já importado, `data_atualizacao` igual | Sem alteração |
| Já importado, `data_atualizacao` mais nova | Atualiza endereço e nome da entrega, se ela ainda está `AGUARDANDO_COLETA` ou `EM_TRANSITO`; senão, `REGRA_NEGOCIO` para tratamento manual |
| Já importado, `data_atualizacao` mais antiga | Rejeita (`REGRA_NEGOCIO`): o pedido não volta no tempo |
| CANCELADO que o G7 já tinha | Cancela a entrega, se ela ainda não saiu; senão, rejeita para decisão manual |
| CANCELADO que o G7 nunca recebeu | Ignora, sem erro |
| `codigo_pedido` repetido na leitura | Rejeita todas as cópias (`REGISTRO_DUPLICADO`) |
| Campo nulo, tipo errado, CEP ou UF inválidos, valor ≤ 0, data futura | Rejeita só esse pedido (`CAMPO_OBRIGATORIO`, `TIPO_INVALIDO`, `VALOR_INVALIDO`) |

Um pedido com problema nunca interrompe os demais. Como o pedido rejeitado não é gravado como integrado, ele é lido de novo na execução seguinte, depois que o G5 corrige.

### 5.2 Mapeamento pedido → entrega

| Pedido do G5 | Entrega do G7 |
|---|---|
| `codigo_pedido` | `id_pedido` |
| `codigo_cliente` | `id_cliente` |
| `nome_cliente` | `nome_destinatario` |
| `endereco_entrega` (rua, número e bairro juntos) | `endereco_destino.logradouro` |
| `cidade_entrega`, `uf_entrega` | `endereco_destino.cidade`, `.uf` |
| `cep_entrega` (8 dígitos) | `endereco_destino.cep` (formato `00000-000`) |

**Pendências.** O G5 não envia transportadora, número e bairro separados, data prevista nem frete. A decisão do grupo foi importar apenas o que se recebe e deixar o restante como **pendência**, a ser completada pelo próprio G7 com `PUT /entregas/{id}`. A entrega traz `pendencias`, a lista dos campos ainda nulos (`transportadora`, `endereco_destino.numero`, `endereco_destino.bairro`, `data_prevista`, `valor_frete`), e `origem = PEDIDOS_G5`.

### 5.3 Comunicação resiliente

| Falha | Tratamento |
|---|---|
| Timeout (5 s), conexão recusada, 503 | Até 3 novas tentativas, com espera de 1 s, 2 s e 4 s; cada tentativa fica em `integracao_logs`. Esgotadas, a importação responde 503 e nada é gravado |
| 500 ou 502 | Uma nova tentativa |
| 401, 403, 404 e demais 4xx | Não repete; responde 502 (`INTEGRACAO_AUTENTICACAO`, `INTEGRACAO_ERRO`) |
| Resposta que não é JSON ou fora do formato | Rejeita a resposta (`VIOLACAO_CONTRATO`); 502 |

O consumidor **não confia nos dados**: valida campos, tipos, tamanhos e regras de cada pedido antes de gravar qualquer coisa.

### 5.4 Registro de ocorrências

Cada chamada ao G5 e cada ocorrência local (pedido rejeitado, ignorado, conflito) vira uma linha em `integracao_logs`, com data/hora, `request_id`, método e endpoint, status HTTP, tipo de ocorrência, código de erro, descrição, ação tomada, tentativa e duração. O `request_id` enviado no cabeçalho `X-Request-Id` aparece também nos logs do G5. A consulta é `GET /integracoes/logs`.

## 6. Persistência

Banco `entregas` (PostgreSQL), criado pelas migrations em `migrations/`:

| Tabela | Conteúdo |
|---|---|
| `entregas` | Entregas, com índice único parcial por pedido ativo |
| `entregas_historico` | Cada mudança de status, com data/hora e observação |
| `pedidos_importados` | Última leitura de cada pedido do G5 (`data_atualizacao` do G5 detecta mudanças) |
| `integracao_logs` | Registro das chamadas ao G5 e das ocorrências |
| `schema_migrations` | Controle das migrations aplicadas |

O banco do G5 (`pedidos-api`) tem `cliente`, `pedido`, `item_pedido` e a view `integracao.vw_integracao_pedidos`.

## 7. Decisões técnicas

| Decisão | Motivo |
|---|---|
| Uma API do G5 própria em vez de acessar o banco dele | O enunciado proíbe acesso direto ao banco de outro grupo; a API cumpre a Regra 2 e dá algo real para consumir |
| Chave do G7 limitada a `GET /integracao/*` na API do G5 | Reproduz o Contrato B ("acesso somente pela view, com permissão apenas de SELECT") e limita o que o consumidor enxerga |
| Dois níveis de erro de validação (400 estrutura, 422 valor) | Evita ambiguidade: o consumidor sabe se corrige a forma ou o conteúdo |
| Índice único parcial para "uma entrega ativa por pedido" | A regra vale mesmo com duas requisições simultâneas, sem depender só de checagem no código |
| Bloqueio de linha (`SELECT ... FOR UPDATE`) em PUT, PATCH, DELETE e importação | Evita que duas alterações simultâneas se atropelem |
| Importação idempotente, com `pedidos_importados` | Reexecutar não duplica; permite detectar mudança e cancelamento |
| Pedido rejeitado não é gravado como integrado | Volta a ser lido na execução seguinte, depois da correção do G5 |
| Pendências em vez de inventar dados que o G5 não envia | Não gravar transportadora, frete ou data prevista inventados; o G7 completa depois |
| `data_atualizacao` com milissegundos (G5 e G7) | Duas alterações no mesmo segundo se distinguem, o que a detecção de mudança exige |
| Documentação gerada de um único arquivo (`openapi.ts`) | OpenAPI, Swagger e coleção Postman nunca divergem entre si |

## 8. Respostas às questões de discussão

1. **Diferença entre disponibilizar e consumir uma API REST.** Quem disponibiliza define o contrato, valida o que recebe, aplica regras e persiste. Quem consome depende do contrato, não confia nos dados, trata erros e falhas de comunicação. No G7: fornecemos a API de Entregas ao G2 e consumimos a API de Pedidos do G5.
2. **Importância do contrato.** É o acordo técnico que permite aos dois lados evoluir sem combinar tudo de novo: endpoints, JSON, códigos e erros definem o que é correto. A validação de cada pedido contra o contrato é o que detecta um fornecedor que mudou algo sem avisar.
3. **Por que usar corretamente os métodos HTTP.** O método diz a intenção: GET não altera nada (pode ser repetido e guardado), POST cria, PUT substitui, PATCH muda uma parte e DELETE remove. Usar errado quebra a segurança de repetição, o cache e a leitura da API. Por isso o status só muda por PATCH, que registra o histórico.
4. **400, 401, 403 e 404.** 400: a requisição está malformada ou inválida. 401: não sabemos quem é (chave ausente ou inválida). 403: sabemos quem é, mas não pode (chave de leitura tentando escrever). 404: o recurso ou a rota não existe.
5. **API indisponível.** Repetir com espera crescente (1 s, 2 s, 4 s), registrar cada tentativa e, esgotadas, responder 503 sem derrubar a aplicação nem gravar dados pela metade. A execução pode ser repetida depois sem duplicar nada.
6. **Confiar automaticamente nos dados?** Não. O G7 valida tipo, formato, faixa e regra de cada pedido, e rejeita só o que está errado. Confiar às cegas deixaria um preço ausente ou um CEP inválido entrar no sistema.
7. **Evitar POST duplicado.** Índice único parcial no banco (uma entrega ativa por pedido, 409 `ENTREGA_DUPLICADA`) mais a consulta `GET /entregas?id_pedido=` antes de reenviar após um timeout. A importação é idempotente pela chave primária de `pedidos_importados`.
8. **Importância de validar o JSON.** É a primeira barreira contra dado errado: separa estrutura (400) de valor (422), devolve cada campo com problema e impede que um registro ruim chegue ao banco.
9. **Riscos de alterar um endpoint sem avisar.** O consumidor quebra sem saber o motivo, ou pior, passa a gravar dado errado. Por isso o contrato prevê aviso prévio e mudança incompatível só em nova versão (`/api/v2`).
10. **Atributo renomeado por uma API.** O consumidor deixa de encontrar o campo: a validação o rejeita como campo obrigatório ausente (`CAMPO_OBRIGATORIO`) e o registro vai para o log. Sem validação, entraria nulo e geraria dado inconsistente.
11. **Por que cada sistema tem seu banco.** Independência: cada grupo muda sua estrutura interna sem quebrar os outros, controla o que expõe e responde pela consistência dos próprios dados. O contrato é o único ponto de acoplamento.
12. **API REST × CSV × banco compartilhado.** *API REST:* contrato explícito, validação e regras no fornecedor, resposta imediata, controle de acesso por chave, mas depende de a API estar no ar e exige tratar falhas de rede. *CSV:* simples e funciona offline, mas sem validação no envio, sem tempo real e com formato frágil. *Banco compartilhado:* rápido de implementar, mas acopla os sistemas à estrutura interna, espalha as regras de negócio e quebra a independência.

## 9. Conceitos de integração observados

| Conceito | Onde aparece |
|---|---|
| Arquitetura REST, provider e consumer, comunicação síncrona, HTTP, métodos, endpoints | Seções 2, 4 e 5 |
| JSON, contrato de integração, status codes | Seção 3; `contrato-*.md` |
| Autenticação e autorização | `X-API-Key` com perfis; 401 e 403 |
| Validação de dados, tratamento de erros | 400 e 422; validação campo a campo do consumidor |
| Timeout e retry | 5 s e 3 novas tentativas (1 s, 2 s, 4 s) |
| Idempotência | Importação idempotente; índice único; `GET` antes de reenviar `POST` |
| Versionamento | `/api/v1`, com `/api/v2` para mudanças incompatíveis |
| Interoperabilidade | Estrutura do Contrato B, mapeamento pedido → entrega, vocabulário de status |
| Persistência | PostgreSQL próprio por sistema; migrations |
| Logs e rastreabilidade | `X-Request-Id`, `request_id` nos erros, `integracao_logs` |

## 10. Dificuldades encontradas

- **Mudança da cadeia no meio do trabalho.** O G7 passou de consumir o G2 e fornecer ao G5 para consumir o G5 e fornecer ao G2. Foi preciso trocar o módulo consumidor, refazer o contrato de Entregas e criar o do G5. A arquitetura em módulos com fronteiras claras reduziu o custo: só o módulo de integração foi trocado.
- **API do G5 inexistente.** Não havia o que consumir. A solução foi construir a API de Pedidos sobre a estrutura do Contrato B, mantendo-a independente (outro projeto, outro banco) e documentando que é uma simulação.
- **Dados que o G5 não fornece.** Transportadora, número, bairro, data prevista e frete não vêm no pedido. Tratamos como pendências a completar via PUT, em vez de gravar valores inventados. Isso fez alguns campos da entrega aceitarem nulo.
- **Detecção de mudança.** A comparação de `data_atualizacao` com precisão de segundos deixaria passar duas alterações no mesmo segundo. Passamos a usar milissegundos.
- **Fuso horário.** A API usa `America/Sao_Paulo` para definir "hoje"; um teste Postman calculado em UTC errava o dia à noite e foi corrigido.
- **Concorrência.** Duas requisições simultâneas podiam criar duas entregas ativas do mesmo pedido; resolvido com índice único parcial e bloqueio de linha, e coberto por testes.

## 11. Limitações e pendências

- A API de Pedidos é uma simulação do grupo: o contrato com o Grupo 5 é uma **proposta** e precisa ser validado com eles. Nenhum teste foi feito contra a API real do G5 nem contra o consumo real do G2.
- Premissa a confirmar com o G2: o `id_pedido` da entrega equivale ao número da venda. O G2 também usava `nome_entregador`, que a API do G7 não expõe; `dt_saida` pode ser derivada do histórico.
- O aceite dos contratos (Grupo 2 e Grupo 5) ainda não foi registrado.
- As chaves de API são fixas por ambiente (arquivo `.env`); não há emissão, expiração ou rotação.
- As entregas importadas só estão completas depois que o G7 preenche as pendências; a API não impede mudar o status antes disso.

## 12. Como executar

Ver os `README.md` de `entregas-api/` e `pedidos-api/`, e o roteiro de reprodução em `evidencias-testes.md`. Em resumo:

```bash
cd pedidos-api && npm install && npm run db:up && npm run migrate && npm run seed && npm run dev   # :5005
cd entregas-api && npm install && npm run db:up && npm run migrate && npm run dev                  # :5007
cd entregas-api && npm run importar:pedidos     # importa os pedidos do G5
```

Documentação interativa: `http://localhost:5007/docs` (Entregas) e `http://localhost:5005/docs` (Pedidos).
