# Contrato de Integração REST — API de Entregas (Grupo 7)

Este contrato é o acordo técnico entre o **Grupo 7 (Entregas)**, fornecedor da API, e o **Grupo 2 (Vendas)**, consumidor, conforme a cadeia de integração "Grupo 2 → Grupo 7" do enunciado. O consumidor deve depender **apenas do que está escrito aqui**, nunca de detalhes internos da implementação.

| Item | Valor |
|---|---|
| Versão do documento | 1.0 |
| Data da revisão | 2026-11-04 |
| Versão da API | 1.0 (prefixo `/api/v1`) |

---

## 1. Identificação da API

| Item | Valor |
|---|---|
| Nome | API de Entregas |
| Finalidade | Permitir que o Sistema de Vendas consulte e acompanhe a entrega de cada venda até a conclusão. As entregas são criadas pelo próprio Grupo 7 a partir dos pedidos do Grupo 5 |
| Sistema fornecedor | Grupo 7 — Sistema de Entregas |
| Sistema consumidor | Grupo 2 — Sistema de Vendas |
| URL-base | `http://localhost:5007/api/v1` |
| Formato | `application/json; charset=utf-8` |
| Versão da API | 1.0 |
| Comunicação | Síncrona, requisições HTTP |
| Autenticação | Chave de API no cabeçalho `X-API-Key` |
| Fuso horário de referência | `America/Sao_Paulo` (UTC-03:00); define o que é "data atual" nas validações |

O Grupo 7 também consome a API de Pedidos do Grupo 5 (cadeia "Grupo 5 → Grupo 7"); esse outro contrato é o `contrato-api-pedidos-grupo5-v1.0.md`, em que o Grupo 5 é o fornecedor.

**Premissa de identificação:** `id_pedido` da entrega é o `codigo_pedido` do Grupo 5, que o Grupo 2 trata como o **número da venda**. É por ele que o Grupo 2 localiza a entrega de uma venda: `GET /entregas?id_pedido={número da venda}`.

### 1.1 Cabeçalhos de requisição

| Cabeçalho | Valor | Obrigatoriedade | Observação |
|---|---|---|---|
| `Content-Type` | `application/json` | Obrigatório em POST, PUT e PATCH | Outro tipo retorna **400** |
| `Accept` | `application/json` | Recomendado | — |
| `X-API-Key` | ver 1.3 | Obrigatório (exceto em `/health`) | Ausente ou inválida retorna **401** |
| `X-Request-Id` | UUID v4 gerado pelo consumidor | **Obrigatório para o Grupo 2** (ver seção 7); a API aceita a ausência | Se ausente, a API gera um UUID e o devolve |

### 1.2 Cabeçalhos de resposta

| Cabeçalho | Quando | Descrição |
|---|---|---|
| `X-Request-Id` | Sempre | Eco do valor enviado (ou o gerado pela API); mesmo valor do campo `request_id` do corpo de erro |
| `Location` | 201 | Caminho do recurso criado, ex.: `/api/v1/entregas/701` |
| `Retry-After` | 503 | Segundos de espera antes de nova tentativa |

### 1.3 Chaves de API (autorização)

O Grupo 7 entrega ao Grupo 2 uma chave **somente leitura**. A chave de escrita é de uso interno do Grupo 7 (operação, importação de pedidos e testes):

| Chave | Permissões | Uso |
|---|---|---|
| `g2-vendas-leitura-2026` | Somente leitura (GET) | **Grupo 2 (consumidor)** |
| `g7-entregas-admin-2026` | Leitura e escrita (GET, POST, PUT, PATCH, DELETE) | Uso interno do Grupo 7 |

- Chave ausente, malformada ou desconhecida → **401** (`NAO_AUTENTICADO`).
- Chave válida usada em operação que não permite → **403** (`SEM_PERMISSAO`). Aplica-se a **POST, PUT, PATCH e DELETE** com a chave somente leitura.

---

## 2. Definição dos endpoints

Todas as rotas são relativas à URL-base `http://localhost:5007/api/v1`. Rota ou combinação rota+método inexistente retorna **404** (`NAO_ENCONTRADO`).

| # | Método | Endpoint | Finalidade | Parâmetros | Dados enviados | Resposta | Sucesso | Erros previstos |
|---|---|---|---|---|---|---|---|---|
| 1 | GET | `/entregas` | Listar entregas | Query (opcionais): `id_pedido`, `status_entrega`, `pagina` (padrão 1), `tamanho` (padrão 20, máx. 100) | — | Lista paginada de entregas | 200 | 400, 401, 500, 503 |
| 2 | GET | `/entregas/{id_entrega}` | Consultar uma entrega | Path: `id_entrega` (inteiro > 0) | — | Objeto entrega completo | 200 | 400, 401, 404, 500, 503 |
| 3 | POST | `/entregas` | Cadastrar a entrega de um pedido | — | Objeto entrega (sem `id_entrega`, `codigo_rastreio`, status e datas geradas) | Entrega criada, com `id_entrega`, `codigo_rastreio` e status `AGUARDANDO_COLETA`; cabeçalho `Location` | 201 | 400, 401, 403, 409, 422, 500, 503 |
| 4 | PUT | `/entregas/{id_entrega}` | Atualizar dados cadastrais da entrega | Path: `id_entrega` | Campos editáveis (ver 3.3) | Entrega atualizada | 200 | 400, 401, 403, 404, 409, 422, 500, 503 |
| 5 | PATCH | `/entregas/{id_entrega}/status` | Alterar o status da entrega | Path: `id_entrega` | `status_entrega`, `observacao` (opcional) e, se `ENTREGUE`, `data_entrega` | Entrega com o novo status | 200 | 400, 401, 403, 404, 409, 422, 500, 503 |
| 6 | GET | `/entregas/{id_entrega}/historico` | Consultar o histórico de status | Path: `id_entrega` | — | Lista de mudanças de status, da mais antiga para a mais recente | 200 | 400, 401, 404, 500, 503 |
| 7 | DELETE | `/entregas/{id_entrega}` | Excluir uma entrega ainda não coletada | Path: `id_entrega` | — | Sem corpo | 204 | 400, 401, 403, 404, 409, 500, 503 |
| 8 | GET | `/health` | Verificar disponibilidade da API | — | — | `{"status": "UP"}` | 200 | 503 |

Observações:

- `/health` **não exige** `X-API-Key`. Em caso de falha retorna 503 no formato de erro padrão (seção 5.2).
- O PUT **não altera o status**: o status só muda pelo `PATCH /status`, para que toda mudança fique no histórico.
- **Uso pelo Grupo 2 (somente leitura):** `GET /entregas?id_pedido={número da venda}`, `GET /entregas/{id_entrega}`, `GET /entregas/{id_entrega}/historico` e `GET /health`. POST, PUT, PATCH e DELETE são operações internas do Grupo 7: com a chave do Grupo 2 retornam **403**.
- Uma venda pode ter mais de uma entrega ao longo do tempo (uma `CANCELADA` e outra criada depois). A entrega vigente é a de status diferente de `CANCELADA`.
- Parâmetros de rota ou de query inválidos (ex.: `id_entrega=abc`, `pagina=0`, `tamanho=500`, `status_entrega` fora do enum usado como filtro) retornam **400**.
- Para métodos de escrita (POST, PUT, PATCH) a ordem de verificação é: 401 → 403 → 400 → 404 → 409 → 422. Assim o consumidor recebe sempre o primeiro erro aplicável na mesma ordem.

### 2.1 Regras de negócio por operação

- **POST:** só pode existir **uma entrega ativa** (status diferente de `CANCELADA`) por `id_pedido`. Uma segunda retorna **409** (`ENTREGA_DUPLICADA`). Após cancelamento, o mesmo `id_pedido` pode ganhar nova entrega.
- **PUT:** permitido apenas enquanto o status for `AGUARDANDO_COLETA` ou `EM_TRANSITO`; depois disso retorna **409**.
- **PATCH /status:** só aceita as transições da tabela 2.2. Transição fora dela, **inclusive para o mesmo status atual**, retorna **409** (`TRANSICAO_INVALIDA`).
- **DELETE:** permitido apenas com status `AGUARDANDO_COLETA`; nos demais casos retorna **409** e o consumidor deve usar `PATCH` com `CANCELADA`. O DELETE remove a entrega e seu histórico; consultas posteriores retornam 404.

### 2.2 Transições de status permitidas

| Status atual | Pode mudar para |
|---|---|
| `AGUARDANDO_COLETA` | `EM_TRANSITO`, `CANCELADA` |
| `EM_TRANSITO` | `SAIU_PARA_ENTREGA`, `CANCELADA` |
| `SAIU_PARA_ENTREGA` | `ENTREGUE`, `NAO_ENTREGUE` |
| `NAO_ENTREGUE` | `SAIU_PARA_ENTREGA`, `DEVOLVIDA` |
| `ENTREGUE` | — (final) |
| `DEVOLVIDA` | — (final) |
| `CANCELADA` | — (final) |

---

## 3. Estrutura dos dados JSON

Atributos em `snake_case`. Datas em ISO 8601 (`AAAA-MM-DD`); data-hora em ISO 8601 com fuso. Valores monetários são números JSON com ponto decimal e **no máximo duas casas** (ex.: `25.9` e `25.90` são equivalentes).

### 3.1 Objeto `entrega`

| Atributo | Tipo | Obrigatório no POST | Regras de validação |
|---|---|---|---|
| `id_entrega` | inteiro | Não (gerado) | Gerado pela API; somente leitura |
| `codigo_rastreio` | string | Não (gerado) | Formato `ENT-AAAA-NNNNNN`; somente leitura |
| `id_pedido` | inteiro | Sim | > 0; único entre entregas não canceladas (409 se repetido); **imutável** após o cadastro. Igual ao `codigo_pedido` do G5 / número da venda no G2 |
| `id_cliente` | inteiro (ou null) | Sim | > 0; **imutável** após o cadastro. Nunca nulo em entregas importadas do G5 (vem de `codigo_cliente`) |
| `nome_destinatario` | string | Sim | 3 a 100 caracteres, sem ser só espaços |
| `transportadora` | string (ou null) | Sim | 2 a 60 caracteres. `null` só em entrega importada do G5, até o G7 completar (ver `pendencias`) |
| `endereco_destino` | objeto | Sim | Ver 3.2 |
| `data_prevista` | string (data) ou null | Sim | `AAAA-MM-DD`; não pode ser anterior à data atual. `null` só em entrega importada, até ser completada |
| `valor_frete` | número (ou null) | Sim | >= 0,00 e <= 9999,99; até 2 casas decimais. `null` só em entrega importada, até ser completada |
| `status_entrega` | string (enum) | Não | Definido pela API como `AGUARDANDO_COLETA` no POST (valor enviado é ignorado). Valores: `AGUARDANDO_COLETA`, `EM_TRANSITO`, `SAIU_PARA_ENTREGA`, `ENTREGUE`, `NAO_ENTREGUE`, `DEVOLVIDA`, `CANCELADA` |
| `data_entrega` | string (data) ou null | Não | `null` até o status `ENTREGUE`; então obrigatória e não futura |
| `origem` | string (enum) | Não (gerado) | `API` (cadastrada pelo POST) ou `PEDIDOS_G5` (criada pela importação de pedidos do G5); somente leitura |
| `pendencias` | lista de strings | Não (gerado) | Campos ainda nulos a completar via PUT, na entrega importada. Valores possíveis: `id_cliente`, `transportadora`, `endereco_destino.numero`, `endereco_destino.bairro`, `data_prevista`, `valor_frete`. Lista vazia (`[]`) quando está completa; sempre vazia em entregas cadastradas pelo POST; somente leitura |
| `data_criacao` | string (data-hora) | Não (gerado) | ISO 8601 com fuso e milissegundos, ex.: `2026-11-04T20:40:00.123-03:00`; somente leitura |
| `data_atualizacao` | string (data-hora) | Não (gerado) | Mesma regra de `data_criacao`; **muda a cada alteração da entrega** (PUT, PATCH, atualização vinda do G5), com precisão de milissegundos; o consumidor pode compará-la com a leitura anterior para detectar mudanças |

### 3.2 Objeto `endereco_destino`

| Atributo | Tipo | Obrigatório | Regras de validação |
|---|---|---|---|
| `logradouro` | string | Sim | 3 a 120 caracteres no POST/PUT. Em entrega importada do G5 traz o `endereco_entrega` do pedido inteiro (rua, número e bairro, até 200 caracteres) |
| `numero` | string (ou null) | Sim | 1 a 10 caracteres (aceita "S/N"). `null` só em entrega importada, até ser completada |
| `complemento` | string ou null | Não | Até 60 caracteres |
| `bairro` | string (ou null) | Sim | 2 a 60 caracteres. `null` só em entrega importada, até ser completada |
| `cidade` | string | Sim | 2 a 60 caracteres |
| `uf` | string | Sim | 2 letras maiúsculas, uma das 27 UFs do Brasil |
| `cep` | string | Sim | Formato `00000-000` |

### 3.3 Campos editáveis no PUT

O PUT é uma **substituição completa dos campos editáveis**: todos os campos da coluna "Editável" devem ser enviados (ausência → 400).

| Campo | Editável no PUT? | Comportamento |
|---|---|---|
| `nome_destinatario`, `transportadora`, `endereco_destino`, `valor_frete` | Sim | Mesmas validações do POST |
| `data_prevista` | Sim | Mesmas validações do POST, mas a regra "não anterior à data atual" só é aplicada se o valor **for diferente** do já gravado (permite editar outros campos de entrega atrasada) |
| `id_pedido`, `id_cliente` | Não | Pode ser omitido; se enviado com valor **diferente** do gravado → **422**; se igual, é aceito |
| `status_entrega`, `data_entrega` | Não | Se enviados com valor diferente do gravado → **422** (o status só muda pelo PATCH) |
| `id_entrega`, `codigo_rastreio`, `data_criacao`, `data_atualizacao` | Não (somente leitura) | Ignorados se enviados |

Campos **desconhecidos** (não listados neste contrato) no corpo são ignorados.

### 3.4 Corpo do PATCH `/entregas/{id}/status`

| Atributo | Tipo | Obrigatório | Regras |
|---|---|---|---|
| `status_entrega` | string (enum) | Sim | Valor do enum (valor fora do enum → 422) |
| `observacao` | string ou null | Não | Até 200 caracteres |
| `data_entrega` | string (data) | Obrigatória se `status_entrega` = `ENTREGUE`; proibida nos demais | `AAAA-MM-DD`, não futura. Ausente com `ENTREGUE`, ou presente com outro status → 422 |

### 3.5 Regra de classificação de erros de validação (400 × 422)

Para evitar ambiguidade, o fornecedor aplica sempre esta regra:

| Situação | Código |
|---|---|
| JSON malformado; corpo ausente; `Content-Type` diferente de `application/json`; campo **incondicionalmente** obrigatório ausente; tipo JSON errado (ex.: texto onde se espera número; objeto onde se espera string); parâmetro de rota ou query inválido | **400** |
| Tipo JSON correto, mas valor viola formato, tamanho, faixa, enum ou regra de negócio: data fora do padrão `AAAA-MM-DD`, CEP fora do padrão, UF inexistente ou minúscula, texto menor/maior que o permitido, `valor_frete` negativo ou com mais de 2 casas, `status_entrega` fora do enum no corpo, `data_prevista` no passado, `data_entrega` futura / ausente com `ENTREGUE` / presente sem `ENTREGUE`, alteração de campo imutável | **422** |

Em ambos os casos o campo `detalhes` do erro lista cada campo com problema.

### 3.6 Exemplos

**Requisição `POST /entregas`**

```json
{
  "id_pedido": 5012,
  "id_cliente": 1034,
  "nome_destinatario": "Maria Souza",
  "transportadora": "Correios",
  "endereco_destino": {
    "logradouro": "Rua das Flores",
    "numero": "120",
    "complemento": "Apto 32",
    "bairro": "Centro",
    "cidade": "Campinas",
    "uf": "SP",
    "cep": "13010-100"
  },
  "data_prevista": "2026-11-10",
  "valor_frete": 25.90
}
```

**Resposta `201 Created`** (cabeçalho `Location: /api/v1/entregas/701`)

```json
{
  "id_entrega": 701,
  "codigo_rastreio": "ENT-2026-000701",
  "id_pedido": 5012,
  "id_cliente": 1034,
  "nome_destinatario": "Maria Souza",
  "transportadora": "Correios",
  "endereco_destino": {
    "logradouro": "Rua das Flores",
    "numero": "120",
    "complemento": "Apto 32",
    "bairro": "Centro",
    "cidade": "Campinas",
    "uf": "SP",
    "cep": "13010-100"
  },
  "data_prevista": "2026-11-10",
  "valor_frete": 25.90,
  "status_entrega": "AGUARDANDO_COLETA",
  "data_entrega": null,
  "data_criacao": "2026-11-04T20:40:00-03:00",
  "data_atualizacao": "2026-11-04T20:40:00-03:00"
}
```

**Requisição `PUT /entregas/701`**

```json
{
  "nome_destinatario": "Maria Souza Lima",
  "transportadora": "Correios",
  "endereco_destino": {
    "logradouro": "Rua das Flores",
    "numero": "120",
    "complemento": "Apto 33",
    "bairro": "Centro",
    "cidade": "Campinas",
    "uf": "SP",
    "cep": "13010-100"
  },
  "data_prevista": "2026-11-12",
  "valor_frete": 25.90
}
```

A resposta 200 traz o objeto entrega completo, com `data_atualizacao` renovada.

**Requisição `PATCH /entregas/701/status`**

```json
{
  "status_entrega": "ENTREGUE",
  "data_entrega": "2026-11-08",
  "observacao": "Recebido pela destinatária"
}
```

A resposta 200 traz o objeto entrega completo, com `status_entrega` e `data_entrega` atualizados.

**Resposta 200 de `GET /entregas?id_pedido=5012`**

```json
{
  "dados": [
    {
      "id_entrega": 701,
      "codigo_rastreio": "ENT-2026-000701",
      "id_pedido": 5012,
      "status_entrega": "ENTREGUE",
      "...": "demais campos do objeto entrega"
    }
  ],
  "paginacao": { "pagina": 1, "tamanho": 20, "total_registros": 1, "total_paginas": 1 }
}
```

Lista vazia retorna **200** com `"dados": []` e `total_registros` 0, nunca 404.

**Resposta 200 de `GET /entregas/701/historico`** (mesmo envelope `dados` da listagem, ordem cronológica crescente)

```json
{
  "dados": [
    { "status_entrega": "AGUARDANDO_COLETA", "data_hora": "2026-11-04T20:40:00-03:00", "observacao": null },
    { "status_entrega": "EM_TRANSITO", "data_hora": "2026-11-05T09:15:00-03:00", "observacao": "Coletado na loja" },
    { "status_entrega": "ENTREGUE", "data_hora": "2026-11-08T14:02:00-03:00", "observacao": "Recebido pela destinatária" }
  ]
}
```

---

## 4. Códigos de resposta HTTP

Cada código tem um uso fixo nesta API; o consumidor deve decidir o que fazer **pelo código** (e por `erro.codigo`), não pelo texto da mensagem.

| Código | Significado | Quando a API de Entregas retorna | O que o consumidor deve fazer |
|---|---|---|---|
| 200 | OK | Consulta, atualização (PUT) ou mudança de status (PATCH) bem-sucedida | Validar o corpo contra este contrato antes de usar |
| 201 | Created | Entrega cadastrada pelo POST | Guardar `id_entrega` e `codigo_rastreio` no pedido |
| 204 | No Content | Entrega excluída pelo DELETE | Não tentar ler corpo |
| 400 | Bad Request | Ver regra 3.5 (JSON malformado, obrigatório ausente, tipo errado, `Content-Type` inválido, parâmetro de rota/query inválido) | Corrigir a requisição; não repetir igual |
| 401 | Unauthorized | `X-API-Key` ausente ou inválida | Verificar a chave; registrar ocorrência |
| 403 | Forbidden | Chave válida sem permissão de escrita (chave somente leitura em POST, PUT, PATCH ou DELETE) | Não repetir; registrar ocorrência |
| 404 | Not Found | `id_entrega` inexistente ou rota inexistente | Tratar como entrega não encontrada |
| 409 | Conflict | Já existe entrega ativa para o `id_pedido`; transição de status não permitida; PUT ou DELETE em status que não permite | Consultar o estado atual com GET antes de tentar de novo |
| 422 | Unprocessable Content | Ver regra 3.5 (valor com tipo correto que viola formato, faixa ou regra de negócio) | Corrigir o valor indicado em `detalhes` |
| 500 | Internal Server Error | Erro inesperado no servidor do Grupo 7 | Registrar e tentar de novo (ver seção 6) |
| 503 | Service Unavailable | API ou banco de dados temporariamente indisponível; vem com cabeçalho `Retry-After` (segundos) | Repetir após `Retry-After`, no máximo 3 tentativas |

---

## 5. Formato de erro

### 5.1 Formato padrão (todos os códigos 4xx e 5xx)

```json
{
  "erro": {
    "status": 422,
    "codigo": "VALIDACAO_SEMANTICA",
    "mensagem": "Um ou mais campos têm valores inválidos.",
    "detalhes": [
      { "campo": "data_prevista", "problema": "não pode ser anterior a 2026-11-04" },
      { "campo": "endereco_destino.uf", "problema": "UF 'XX' inexistente" }
    ]
  },
  "caminho": "/api/v1/entregas",
  "data_hora": "2026-11-04T20:45:10-03:00",
  "request_id": "3f6c1e2a-8b7d-4c11-9a52-0e4b7d9f1a23"
}
```

### 5.2 Códigos de erro (`erro.codigo`)

| `erro.codigo` | Status HTTP |
|---|---|
| `REQUISICAO_INVALIDA` | 400 |
| `NAO_AUTENTICADO` | 401 |
| `SEM_PERMISSAO` | 403 |
| `NAO_ENCONTRADO` | 404 |
| `ENTREGA_DUPLICADA` | 409 |
| `TRANSICAO_INVALIDA` | 409 |
| `OPERACAO_NAO_PERMITIDA` | 409 |
| `VALIDACAO_SEMANTICA` | 422 |
| `ERRO_INTERNO` | 500 |
| `SERVICO_INDISPONIVEL` | 503 |

`OPERACAO_NAO_PERMITIDA` cobre o 409 de PUT ou DELETE em status que não permitem a operação, distinguindo-o de duplicidade e de transição inválida.

O campo `detalhes` é **obrigatório em 400 e 422** (lista com ao menos um item) e pode ser lista vazia nos demais.

---

## 6. Falhas de comunicação, retry e idempotência

| Situação | Tratamento combinado (consumidor) |
|---|---|
| Sem resposta em 5 segundos (timeout) | Considerar falha; repetir até 3 vezes com espera de 1 s, 2 s e 4 s |
| Conexão recusada / API fora do ar | Mesmo tratamento do timeout; depois disso, marcar o pedido como "entrega pendente de integração" e tentar mais tarde |
| 503 com `Retry-After` | Aguardar o tempo indicado; máximo de 3 tentativas |
| 500 | Uma nova tentativa; persistindo, registrar e suspender a operação |
| 400, 401, 403, 404, 409, 422 | **Não** repetir a mesma requisição; seguir a coluna "O que o consumidor deve fazer" da seção 4 |
| Corpo que não é JSON válido, ou falta campo obrigatório na resposta | Rejeitar a resposta, registrar como violação de contrato, não atualizar o pedido |

**Idempotência:**

- GET, PUT e DELETE são idempotentes quanto ao estado final. Um DELETE repetido após sucesso retorna 404, o que o consumidor deve tratar como "já excluída".
- **POST** não é idempotente por natureza. Para evitar duplicidade após timeout ou queda de conexão, o consumidor **deve**, antes de reenviar, consultar `GET /entregas?id_pedido=<id>`; se já existir entrega ativa, usa a existente. Como segunda barreira, o fornecedor garante a unicidade por `id_pedido` (409 `ENTREGA_DUPLICADA`).
- O PATCH para o mesmo status atual retorna 409, então um reenvio após timeout deve ser precedido de um GET da entrega para conferir se a mudança já foi aplicada.

---

## 7. Responsabilidades

### Grupo 7 — fornecedor

- Persistir as entregas em banco de dados próprio; nenhum outro grupo acessa esse banco.
- Validar todo dado recebido e retornar os códigos e o formato de erro das seções 4 e 5.
- Manter a API disponível em `http://localhost:5007/api/v1` durante os testes combinados.
- Entregar ao Grupo 2 a chave de leitura `X-API-Key` (seção 1.3), a coleção de requisições de exemplo (Postman) e a especificação OpenAPI (`/openapi.json`, `/docs`).
- Criar as entregas a partir dos pedidos do Grupo 5 (importação), cancelar a entrega quando o pedido for cancelado e manter `data_atualizacao` coerente (muda a cada alteração).
- Disponibilizar a documentação das rotas (OpenAPI/Swagger ou equivalente) coerente com este contrato.
- Avisar o Grupo 2 antes de qualquer mudança no contrato; mudança incompatível (remover ou renomear campo, mudar tipo) só em nova versão, `/api/v2`.

### Grupo 2 — consumidor

- Usar apenas as rotas, campos e códigos deste contrato.
- Validar cada resposta: presença dos campos obrigatórios, tipos, `status_entrega` dentro do enum e `id_pedido` igual ao enviado. Resposta fora do contrato é tratada como **erro de integração**, e o pedido **não** é atualizado com ela.
- Tratar todos os códigos da seção 4 sem encerrar a aplicação.
- **Enviar `X-Request-Id` (UUID v4) em cada requisição.**
- Registrar cada ocorrência de integração (seção 8).
- Usar os dados da entrega no seu próprio processo (ex.: guardar `id_entrega` e `codigo_rastreio` na venda e refletir o status de entrega nela), e não apenas exibir o JSON.
- Tratar campos nulos de entregas importadas (`pendencias`) sem tratá-los como violação de contrato.
- Ignorar campos novos que não conhece: acréscimo de campos dentro da versão 1.0 não é mudança incompatível.
- Considerar apenas a entrega vigente da venda (status diferente de `CANCELADA`); uma entrega `CANCELADA` pode ser seguida de outra.

### Orientações ao Grupo 2: correspondência com os campos que o Grupo 2 já usa

Sugestão para o mapeamento (a decisão é do Grupo 2), a partir da estrutura que o Grupo 2 usa na integração por banco de dados:

| Campo usado pelo G2 | Na API do Grupo 7 |
|---|---|
| `id_entrega` | `id_entrega` |
| `num_venda` | `id_pedido` |
| `cod_rastreio` | `codigo_rastreio` |
| `situacao` | `status_entrega` (ver tabela de status abaixo) |
| `dt_prevista` | `data_prevista` (pode ser `null` até o G7 completar) |
| `dt_saida` | **não existe como campo**: é o `data_hora` do primeiro item `EM_TRANSITO` de `GET /entregas/{id}/historico` |
| `dt_entrega` | `data_entrega` (data, `AAAA-MM-DD`; não há hora) |
| `nome_entregador` | **não disponível** nesta API (o Grupo 7 não expõe entregador) |
| `cidade_destino`, `uf_destino` | `endereco_destino.cidade`, `endereco_destino.uf` |
| `ultima_alteracao` | `data_atualizacao` |

Vocabulário de status (a API do Grupo 7 tem mais estados do que o Grupo 2 usava):

| `status_entrega` (Grupo 7) | Sugestão de correspondência no Grupo 2 |
|---|---|
| `AGUARDANDO_COLETA` | `AGUARDANDO_COLETA` |
| `EM_TRANSITO`, `SAIU_PARA_ENTREGA` | `EM_TRANSPORTE` |
| `ENTREGUE` | `ENTREGUE` |
| `NAO_ENTREGUE` | tentativa frustrada, a entrega continua ativa (volta a `SAIU_PARA_ENTREGA` ou segue para `DEVOLVIDA`): manter em transporte |
| `DEVOLVIDA` | `DEVOLVIDA` |
| `CANCELADA` | sem equivalente: a venda não tem entrega vigente (pode haver outra entrega depois) |
| — | `EXTRAVIADA` não existe nesta API |

---

## 8. Registro de ocorrências (log mínimo do consumidor)

| Campo | Exemplo |
|---|---|
| `data_hora` | `2026-11-04T20:45:10-03:00` |
| `request_id` | `3f6c1e2a-8b7d-4c11-9a52-0e4b7d9f1a23` |
| `metodo` e `endpoint` | `POST /entregas` |
| `status_http` | `422` |
| `tipo_ocorrencia` | `SUCESSO`, `ERRO_HTTP`, `TIMEOUT`, `INDISPONIVEL`, `VIOLACAO_CONTRATO` |
| `descricao` | `data_prevista no passado` |
| `acao_tomada` | `Requisição corrigida e reenviada` |

O fornecedor registra, do seu lado, ao menos `data_hora`, `request_id`, método, endpoint e status devolvido, para que uma ocorrência possa ser rastreada nos logs dos dois grupos pelo mesmo `request_id`.

---

## 9. Aceite

Este contrato foi elaborado conjuntamente pelos grupos fornecedor e consumidor e passa a valer a partir do aceite abaixo.

| Grupo | Sistema | Responsável | Data do aceite |
|---|---|---|---|
| 7 | Entregas (fornecedor) | Ioshua Souza Lopes e Gabriel | 04/11/2026 |
| 2 | Vendas (consumidor) | | |

---

## 10. Histórico de revisões

| Revisão | Data | Alterações |
|---|---|---|
| 1.0 | 2026-11-04 | Versão inicial do contrato do Grupo 7 |
| 1.0 | 2026-11-13 | Revisão antes do aceite, por mudança da cadeia de integração (o consumidor passa a ser o Grupo 2, e o Grupo 7 passa a consumir o Grupo 5): chaves de API (leitura para o G2, escrita interna), campos `origem` e `pendencias`, campos que podem ser nulos em entregas importadas, `data_atualizacao` com milissegundos e orientações ao G2. Versão mantida em 1.0 porque nenhum consumidor chegou a aceitar a versão anterior |
