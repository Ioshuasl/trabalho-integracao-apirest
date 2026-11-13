# Contrato de Integração REST — API de Pedidos (Grupo 5)

> **PROPOSTA do Grupo 7 para validação com o Grupo 5.** A API do Grupo 5 ainda não está disponível. Para não deixar a integração incompleta, o Grupo 7 construiu uma API de Pedidos (`pedidos-api/`) que **reaproveita a estrutura de dados do Contrato B** (integração por banco de dados, versão 1.0 de 02/10/2026): as tabelas `cliente`, `pedido` e `item_pedido`, a view `integracao.vw_integracao_pedidos` e as mesmas regras de negócio. Quando o Grupo 5 tiver a API real, basta trocar `G5_BASE_URL` e ajustar o que divergir deste contrato.

Este contrato é o acordo técnico entre o **Grupo 5 (Pedidos)**, fornecedor da API, e o **Grupo 7 (Entregas)**, consumidor, conforme a cadeia "Grupo 5 → Grupo 7" do enunciado. O consumidor deve depender **apenas do que está escrito aqui**, nunca de detalhes internos da implementação.

---

## 1. Identificação da API

| Item | Valor |
|---|---|
| Nome | API de Pedidos |
| Finalidade | Informar ao Grupo 7 quais pedidos devem ser entregues, para onde, e quais foram cancelados |
| Sistema fornecedor | Grupo 5 — Sistema de Pedidos |
| Sistema consumidor | Grupo 7 — Sistema de Entregas |
| URL-base | `http://localhost:5005/api/v1` |
| Formato | `application/json; charset=utf-8` |
| Versão da API | 1.0 |
| Comunicação | Síncrona, requisições HTTP |
| Frequência | Sob demanda (execução manual da importação pelo Grupo 7) |
| Autenticação | Chave de API no cabeçalho `X-API-Key` |
| Fuso horário de referência | `America/Sao_Paulo` (UTC-03:00) |
| Documentação | `GET /docs` (Swagger) e `GET /openapi.json` |

### 1.1 Cabeçalhos

| Cabeçalho | Valor | Observação |
|---|---|---|
| `Accept` | `application/json` | Recomendado |
| `X-API-Key` | ver 1.2 | Obrigatório (exceto em `/health`); ausente ou inválida retorna **401** |
| `X-Request-Id` | UUID v4 gerado pelo consumidor | Opcional para a API, **obrigatório para o Grupo 7**; devolvido na resposta e no campo `request_id` do erro |
| `Content-Type` | `application/json` | Obrigatório em POST, PUT e PATCH (rotas de uso interno do Grupo 5) |

### 1.2 Chaves de API (autorização)

| Chave | Permissões | Uso |
|---|---|---|
| `g7-entregas-leitura-2026` | **Somente `GET`, somente em `/integracao/*`** | Grupo 7 (consumidor) |
| `g5-pedidos-admin-2026` | Acesso total | Uso interno do Grupo 5 |

Como no Contrato B ("acesso somente pela view de integração, com usuário próprio e permissão apenas de SELECT"), a chave do Grupo 7 **só enxerga a estrutura de integração**: em `/pedidos` e `/clientes` ela recebe **403**, e em qualquer método de escrita também.

---

## 2. Endpoints

### 2.1 Usados pelo Grupo 7

| Método | Endpoint | Finalidade | Sucesso | Erros previstos |
|---|---|---|---|---|
| GET | `/integracao/pedidos` | Listar a estrutura de integração (equivale à view `integracao.vw_integracao_pedidos`) | 200 | 400, 401, 403, 500, 503 |
| GET | `/health` | Verificar disponibilidade (sem `X-API-Key`) | 200 | 503 |

`GET /integracao/pedidos`:

- Retorna **um pedido por linha**, **somente com `status_pedido` CONFIRMADO ou CANCELADO**; pedidos ABERTO (ainda sendo montados) não aparecem. Não expõe itens, preços internos nem dados de pagamento.
- Ordenado por `codigo_pedido`.
- Parâmetros de query (opcionais): `pagina` (padrão 1) e `tamanho` (padrão 20, **máximo 100**). O consumidor lê todas as páginas, até `pagina` ≥ `paginacao.total_paginas`.
- Parâmetro inválido (`pagina=0`, `tamanho=500`, texto) retorna **400**.
- O Grupo 5 nunca apaga um pedido da estrutura: cancelar muda o status para `CANCELADO`.

### 2.2 Uso interno do Grupo 5 (informativo)

Para que a API tenha funcionamento real (persistência e regras de negócio), o Grupo 5 mantém as operações abaixo, **fora do alcance da chave do Grupo 7**:

| Método | Endpoint | Finalidade |
|---|---|---|
| GET / POST | `/clientes` | Listar / cadastrar clientes |
| GET / PUT / DELETE | `/clientes/{codigo_cliente}` | Consultar / atualizar / **desativar** cliente (não apaga fisicamente) |
| GET / POST | `/pedidos` | Listar (todos os status) / criar pedido ABERTO com itens |
| GET / PUT / DELETE | `/pedidos/{codigo_pedido}` | Consultar com itens / alterar endereço (e itens, se ABERTO) / excluir pedido ABERTO |
| PATCH | `/pedidos/{codigo_pedido}/status` | Confirmar ou cancelar |

Transições de status do pedido: `ABERTO` → `CONFIRMADO` ou `CANCELADO`; `CONFIRMADO` → `CANCELADO`; `CANCELADO` é final. Cada alteração do pedido renova `data_atualizacao`.

---

## 3. Estrutura dos dados JSON

Os nomes são os da view do Contrato B. Resposta de `GET /integracao/pedidos`:

```json
{
  "dados": [
    {
      "codigo_pedido": 5001,
      "codigo_cliente": 101,
      "nome_cliente": "João Silva",
      "endereco_entrega": "Rua 10, 250, Setor Oeste",
      "cidade_entrega": "Goiânia",
      "uf_entrega": "GO",
      "cep_entrega": "74120020",
      "data_pedido": "2026-10-02T10:15:00.000-03:00",
      "quantidade_itens": 3,
      "valor_total": 179.70,
      "status_pedido": "CONFIRMADO",
      "data_atualizacao": "2026-10-02T10:20:00.000-03:00"
    }
  ],
  "paginacao": { "pagina": 1, "tamanho": 20, "total_registros": 1, "total_paginas": 1 }
}
```

Lista vazia retorna 200 com `"dados": []`, nunca 404.

| Campo | Tipo | Tam. | Obrig. | Nulo | Regra | Exemplo |
|---|---|---|---|---|---|---|
| `codigo_pedido` | inteiro | — | Sim | Não | Identificador único, maior que 0 | `5001` |
| `codigo_cliente` | inteiro | — | Sim | Não | Identificador do cliente no Grupo 5, maior que 0 | `101` |
| `nome_cliente` | texto | 100 | Sim | Não | Não vazio | `João Silva` |
| `endereco_entrega` | texto | 200 | Sim | Não | Rua, número e bairro | `Rua 10, 250, Setor Oeste` |
| `cidade_entrega` | texto | 80 | Sim | Não | Não vazio | `Goiânia` |
| `uf_entrega` | texto | 2 | Sim | Não | Sigla de UF válida, maiúscula | `GO` |
| `cep_entrega` | texto | 8 | Sim | Não | 8 dígitos, só números | `74120020` |
| `data_pedido` | data-hora | — | Sim | Não | ISO 8601 com fuso; não pode ser futura | `2026-10-02T10:15:00.000-03:00` |
| `quantidade_itens` | inteiro | — | Sim | Não | Maior que 0 (soma das quantidades dos itens) | `3` |
| `valor_total` | número | 10,2 | Sim | Não | Maior que 0; até 2 casas decimais | `179.70` |
| `status_pedido` | texto | 20 | Sim | Não | `CONFIRMADO` ou `CANCELADO` | `CONFIRMADO` |
| `data_atualizacao` | data-hora | — | Sim | Não | ISO 8601 com fuso e milissegundos; **muda a cada alteração do pedido** | `2026-10-02T10:20:00.000-03:00` |

Diferenças em relação à view do banco (necessárias no JSON): `data_pedido` e `data_atualizacao` deixam de ser `TIMESTAMP` sem fuso e passam a ISO 8601 com fuso `-03:00`; `data_atualizacao` ganha milissegundos para que duas alterações no mesmo segundo se distingam. O consumidor ignora campos que não conhece (acréscimo de campos não é mudança incompatível).

---

## 4. Regras de negócio

| Regra | Comportamento |
|---|---|
| **Identificação** | O Grupo 7 guarda `codigo_pedido` como identificador de origem (único) para saber se o pedido já foi integrado. |
| **Inclusão** | Pedido `CONFIRMADO` que o Grupo 7 ainda não tem → cria a entrega (`id_pedido` da entrega = `codigo_pedido`; `id_cliente` = `codigo_cliente`). |
| **Atualização** | `data_atualizacao` mais recente que a última leitura → o Grupo 7 atualiza endereço, totais ou status. Igual → sem alteração. Mais antiga → rejeitado (`REGRA_NEGOCIO`: não volta no tempo). |
| **Cancelamento** | O Grupo 5 nunca apaga o pedido da estrutura: muda o status para `CANCELADO`. O Grupo 7 cancela a entrega correspondente, se ela ainda não saiu para entrega; se já saiu, rejeita para tratamento manual. |
| **Cancelado inexistente** | `CANCELADO` que o Grupo 7 nunca recebeu como `CONFIRMADO` → ignorado, sem erro. |
| **Duplicados** | O Grupo 5 garante `codigo_pedido` único. Se aparecer repetido na leitura, o Grupo 7 rejeita todas as cópias como `REGISTRO_DUPLICADO` e avisa o Grupo 5. |
| **Nulos e valores inválidos** | Campo obrigatório nulo (`CAMPO_OBRIGATORIO`), tipo errado (`TIPO_INVALIDO`), CEP fora do formato, UF inválida, valor ou quantidade ≤ 0, data futura ou texto maior que o limite (`VALOR_INVALIDO`) → rejeitado pelo Grupo 7 e registrado no seu log. Os demais pedidos continuam, e o pedido rejeitado é lido de novo na próxima execução. |
| **Normalização** | O Grupo 7 remove espaços nas pontas dos textos e converte a UF para maiúscula. |
| **Integridade** | `codigo_cliente` aponta para um cliente que existe no Grupo 5; a estrutura já entrega nome e endereço, então o Grupo 7 não consulta outra base. |
| **Mudança na estrutura** | Qualquer alteração (campo novo incompatível, renomeado ou removido) é combinada com o Grupo 7 antes, registrada no histórico, e incompatível só em nova versão (`/api/v2`). |

---

## 5. Códigos de resposta HTTP e formato de erro

| Código | Quando a API de Pedidos retorna | O que o consumidor faz |
|---|---|---|
| 200 | Consulta bem-sucedida | Validar cada pedido contra a seção 3 |
| 400 | Parâmetro inválido, JSON malformado, campo ausente ou tipo errado | Corrigir a requisição; não repetir igual |
| 401 | `X-API-Key` ausente ou inválida | Verificar a chave; registrar; não repetir |
| 403 | Chave válida sem permissão (chave do G7 fora de `/integracao/*` ou em método de escrita) | Não repetir; registrar |
| 404 | Rota ou registro inexistente | Registrar |
| 500 | Erro inesperado | Uma nova tentativa; persistindo, registrar e interromper |
| 503 | API ou banco indisponível; vem com `Retry-After` (segundos) | Repetir até 3 vezes, com espera crescente |

As rotas de uso interno usam também 201, 204, 409 (`TRANSICAO_INVALIDA`, `OPERACAO_NAO_PERMITIDA`) e 422 (`VALIDACAO_SEMANTICA`). Ordem de verificação: 401, 403, 400, 404, 409, 422.

Formato padrão de erro (todo 4xx e 5xx):

```json
{
  "erro": {
    "status": 400,
    "codigo": "REQUISICAO_INVALIDA",
    "mensagem": "A requisição é inválida.",
    "detalhes": [ { "campo": "tamanho", "problema": "deve ser um inteiro positivo (máximo 100)" } ]
  },
  "caminho": "/api/v1/integracao/pedidos",
  "data_hora": "2026-11-13T10:45:10-03:00",
  "request_id": "3f6c1e2a-8b7d-4c11-9a52-0e4b7d9f1a23"
}
```

Códigos (`erro.codigo`): `REQUISICAO_INVALIDA` (400), `NAO_AUTENTICADO` (401), `SEM_PERMISSAO` (403), `NAO_ENCONTRADO` (404), `TRANSICAO_INVALIDA` e `OPERACAO_NAO_PERMITIDA` (409), `VALIDACAO_SEMANTICA` (422), `ERRO_INTERNO` (500), `SERVICO_INDISPONIVEL` (503). `detalhes` é obrigatório (não vazio) em 400 e 422.

---

## 6. Falhas de comunicação (consumidor)

| Situação | Tratamento combinado |
|---|---|
| Sem resposta em 5 segundos (timeout) | Considerar falha; repetir até 3 vezes com espera de 1 s, 2 s e 4 s |
| Conexão recusada / API fora do ar | Mesmo tratamento do timeout; depois, interromper a importação e tentar mais tarde (nada é gravado pela execução que falhou na leitura) |
| 503 | Mesmo tratamento: até 3 repetições |
| 500 ou 502 | Uma nova tentativa; persistindo, registrar e interromper |
| 401, 403, 404, demais 4xx | Não repetir; registrar e interromper |
| Corpo que não é JSON, ou sem `dados` e `paginacao.total_paginas` | Rejeitar a resposta, registrar como violação de contrato, interromper |
| Pedido individual fora do contrato | Rejeitar só aquele pedido, registrar e seguir com os demais |

Como a importação lê todas as páginas, uma falha em qualquer página interrompe a execução inteira; ela pode ser repetida sem duplicar nada (a importação é idempotente).

---

## 7. Responsabilidades

### Grupo 5 — fornecedor

- Manter a API disponível em `http://localhost:5005/api/v1` durante os testes combinados.
- Garantir `codigo_pedido` único na estrutura de integração, `data_atualizacao` renovada a cada alteração e nunca apagar pedidos CONFIRMADO ou CANCELADO.
- Entregar ao Grupo 7 a chave `X-API-Key` de leitura (seção 1.2), a coleção Postman e a especificação OpenAPI.
- Avisar o Grupo 7 antes de qualquer mudança no contrato.

### Grupo 7 — consumidor

- Usar apenas `GET /integracao/pedidos` e `GET /health`.
- Validar cada pedido recebido (seção 3) e tratar todos os códigos da seção 5 sem encerrar a aplicação.
- Enviar `X-Request-Id` (UUID v4) em cada requisição e registrar cada ocorrência (data/hora, `request_id`, método e endpoint, status HTTP, tipo de ocorrência, descrição e ação tomada) na tabela `integracao_logs`.
- Persistir os pedidos recebidos e as entregas criadas em banco próprio.

---

## 8. Aceite

Este contrato passa a valer após o aceite dos dois grupos.

| Grupo | Integrantes | Data do aceite |
|---|---|---|
| 5 — Pedidos (fornecedor) | Nathalia Marcelino Lima, Amanda Carmo dos Santos, Ana Carolina Carmo dos Santos | |
| 7 — Entregas (consumidor) | Ioshua Souza Lopes e Gabriel | |

---

## 9. Histórico de revisões

| Versão | Data | Alteração | Combinado com |
|---|---|---|---|
| 1.0 | 2026-11-13 | Proposta inicial da versão REST, derivada do Contrato B (integração por banco de dados, 02/10/2026) | — |
