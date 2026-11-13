# Evidências de execução real (G5 e G7 no ar)

Gerado em 13/11/2026 12:02 com a API de Pedidos (G5, porta 5005) e a API de Entregas (G7, porta 5007) rodando, cada uma com seu Postgres em container. Estado inicial: G5 com os dados de teste (pedidos 101 a 108) e G7 sem nenhuma entrega.

### 1. G5: estrutura de integração com a chave do G7 (2 primeiros pedidos)

```
$ GET /integracao/pedidos?tamanho=2   (X-API-Key do G7)
{
  "dados": [
    {
      "codigo_pedido": 101,
      "codigo_cliente": 1,
      "nome_cliente": "João Silva",
      "endereco_entrega": "Rua 10, 250, Setor Oeste",
      "cidade_entrega": "Goiânia",
      "uf_entrega": "GO",
      "cep_entrega": "74120020",
      "data_pedido": "2026-10-19T09:00:00.000-03:00",
      "quantidade_itens": 3,
      "valor_total": 179.7,
      "status_pedido": "CONFIRMADO",
      "data_atualizacao": "2026-10-19T09:05:00.000-03:00"
    },
    {
      "codigo_pedido": 102,
      "codigo_cliente": 2,
      "nome_cliente": "Maria Souza",
      "endereco_entrega": "Av. Brasil, 1200, Centro",
      "cidade_entrega": "Anápolis",
      "uf_entrega": "GO",
      "cep_entrega": "75024050",
      "data_pedido": "2026-10-19T09:30:00.000-03:00",
      "quantidade_itens": 1,
      "valor_total": 89.9,
      "status_pedido": "CONFIRMADO",
      "data_atualizacao": "2026-10-19T09:35:00.000-03:00"
    }
  ],
  "paginacao": {
    "pagina": 1,
    "tamanho": 2,
    "total_registros": 7,
    "total_paginas": 4
  }
}
...
```

### 2. G5: a chave do G7 fora de /integracao é recusada

```
$ GET /pedidos   (X-API-Key do G7)
HTTP/1.1 403 Forbidden

{"erro":{"status":403,"codigo":"SEM_PERMISSAO","mensagem":"A chave informada não tem permissão para esta operação.","detalhes":[]},"caminho":"/api/v1/pedidos","data_hora":"2026-11-13T12:02:42-03:00","request_id":"f417a4b1-3a07-4e5a-aa50-2f08f52d1558"}
```

### 3. G7: primeira importação (7 pedidos CONFIRMADOS viram 7 entregas; o 108 está ABERTO e não aparece)

```
$ POST /integracoes/pedidos/importar
{
  "importacao_id": "8a6f19df-e7db-4948-84bb-ccf72d19575b",
  "consultados": 7,
  "inseridos": [
    {
      "codigo_pedido": 101,
      "id_entrega": 1,
      "codigo_rastreio": "ENT-2026-000001",
      "pendencias": [
        "transportadora",
        "endereco_destino.numero",
        "endereco_destino.bairro",
        "data_prevista",
        "valor_frete"
      ]
    },
    {
      "codigo_pedido": 102,
      "id_entrega": 2,
      "codigo_rastreio": "ENT-2026-000002",
      "pendencias": [
        "transportadora",
        "endereco_destino.numero",
        "endereco_destino.bairro",
        "data_prevista",
        "valor_frete"
      ]
    },
    {
      "...": "mais 5 entregas"
    }
  ],
  "atualizados": [],
  "sem_alteracao": [],
  "ignorados": [],
  "rejeitados": []
}
```

### 4. G7: segunda importação logo em seguida (idempotência: nada é duplicado)

```
$ POST /integracoes/pedidos/importar
{
  "consultados": 7,
  "inseridos": [],
  "atualizados": [],
  "sem_alteracao": 7,
  "ignorados": 0,
  "rejeitados": 0
}
```

### 5. G5: o Grupo 5 altera o endereço do pedido 101, cancela o 102 e confirma o 108

```
$ PUT /pedidos/101 · PATCH /pedidos/102/status · PATCH /pedidos/108/status
HTTP 200
HTTP 200
HTTP 200
```

### 6. G7: terceira importação (1 inserido, 2 atualizados: endereço do 101 e cancelamento do 102)

```
$ POST /integracoes/pedidos/importar
{
  "consultados": 8,
  "inseridos": [
    108
  ],
  "atualizados": [
    {
      "codigo_pedido": 101,
      "acao": "ENDERECO_ATUALIZADO"
    },
    {
      "codigo_pedido": 102,
      "acao": "ENTREGA_CANCELADA"
    }
  ],
  "sem_alteracao": 5,
  "ignorados": 0,
  "rejeitados": 0
}
```

### 7. Persistência: entregas no banco do G7 (banco próprio, não compartilhado com o G5)

```
$ SELECT ... FROM entregas
 id_entrega | id_pedido | id_cliente |  status_entrega   |        cidade        |    cep    |   origem   
------------+-----------+------------+-------------------+----------------------+-----------+------------
          1 |       101 |          1 | AGUARDANDO_COLETA | Senador Canedo       | 75250-000 | PEDIDOS_G5
          2 |       102 |          2 | CANCELADA         | Anápolis             | 75024-050 | PEDIDOS_G5
          3 |       103 |          3 | AGUARDANDO_COLETA | Aparecida de Goiânia | 74915-230 | PEDIDOS_G5
          4 |       104 |          4 | AGUARDANDO_COLETA | Brasília             | 70862-030 | PEDIDOS_G5
          5 |       105 |          5 | AGUARDANDO_COLETA | Uberlândia           | 38400-242 | PEDIDOS_G5
          6 |       106 |          6 | AGUARDANDO_COLETA | Formosa              | 73801-330 | PEDIDOS_G5
          7 |       107 |          7 | AGUARDANDO_COLETA | Rio Verde            | 75901-010 | PEDIDOS_G5
          8 |       108 |          1 | AGUARDANDO_COLETA | Goiânia              | 74120-020 | PEDIDOS_G5
(8 rows)

```

### 8. G2 (consumidor do G7): consulta a entrega da venda 101 com a chave de leitura

```
$ GET /entregas?id_pedido=101   (X-API-Key do G2)
{
  "dados": [
    {
      "id_entrega": 1,
      "codigo_rastreio": "ENT-2026-000001",
      "id_pedido": 101,
      "id_cliente": 1,
      "nome_destinatario": "João Silva",
      "transportadora": null,
      "endereco_destino": {
        "logradouro": "Rua 5, 10, Centro",
        "numero": null,
        "complemento": null,
        "bairro": null,
        "cidade": "Senador Canedo",
        "uf": "GO",
        "cep": "75250-000"
      },
      "data_prevista": null,
      "valor_frete": null,
      "status_entrega": "AGUARDANDO_COLETA",
      "data_entrega": null,
      "origem": "PEDIDOS_G5",
      "pendencias": [
        "transportadora",
        "endereco_destino.numero",
        "endereco_destino.bairro",
        "data_prevista",
        "valor_frete"
      ],
      "data_criacao": "2026-11-13T12:02:42.962-03:00",
      "data_atualizacao": "2026-11-13T12:02:43.525-03:00"
    }
  ],
  "paginacao": {
    "pagina": 1,
    "tamanho": 20,
    "total_registros": 1,
    "total_paginas": 1
  }
}
```

### 9. G2: histórico da entrega do pedido 102, cancelada pela importação

```
$ GET /entregas/2/historico
{
  "dados": [
    {
      "status_entrega": "AGUARDANDO_COLETA",
      "data_hora": "2026-11-13T12:02:42-03:00",
      "observacao": "Importada do pedido 102 do G5"
    },
    {
      "status_entrega": "CANCELADA",
      "data_hora": "2026-11-13T12:02:43-03:00",
      "observacao": "Pedido cancelado no G5"
    }
  ]
}
```

### 10. G2: a chave de leitura não escreve

```
$ POST /entregas   (X-API-Key do G2)
HTTP/1.1 403 Forbidden

{"erro":{"status":403,"codigo":"SEM_PERMISSAO","mensagem":"A chave informada não tem permissão para esta operação.","detalhes":[]},"caminho":"/api/v1/entregas","data_hora":"2026-11-13T12:02:44-03:00","request_id":"18e53f19-4d72-4129-a3b1-9c3e7b793eba"}
```

### 11. G7: registro de ocorrências da integração (cada chamada ao G5 fica em integracao_logs)

```
$ GET /integracoes/logs?limite=4
{
  "dados": [
    {
      "data_hora": "2026-11-13T12:02:43-03:00",
      "importacao_id": "ef3e21fa-616d-46c1-9434-362e90081f12",
      "request_id": "4be08c00-6d26-41ee-bfd9-bb8f35391281",
      "metodo": "GET",
      "endpoint": "/integracao/pedidos?pagina=1&tamanho=100",
      "status_http": 200,
      "tipo_ocorrencia": "SUCESSO",
      "erro_codigo": null,
      "descricao": "resposta recebida",
      "acao_tomada": "dados processados",
      "tentativa": 1,
      "duracao_ms": 9
    },
    {
      "data_hora": "2026-11-13T12:02:43-03:00",
      "importacao_id": "864aa5c5-21c8-4a50-b64d-977dd795f012",
      "request_id": "b8ee1359-5d57-4bfa-87e7-3510d162e5a5",
      "metodo": "GET",
      "endpoint": "/integracao/pedidos?pagina=1&tamanho=100",
      "status_http": 200,
      "tipo_ocorrencia": "SUCESSO",
      "erro_codigo": null,
      "descricao": "resposta recebida",
      "acao_tomada": "dados processados",
      "tentativa": 1,
      "duracao_ms": 12
    },
    {
      "data_hora": "2026-11-13T12:02:42-03:00",
      "importacao_id": "8a6f19df-e7db-4948-84bb-ccf72d19575b",
      "request_id": "9002965d-9500-426d-b525-6132f6b906ac",
      "metodo": "GET",
      "endpoint": "/integracao/pedidos?pagina=1&tamanho=100",
      "status_http": 200,
      "tipo_ocorrencia": "SUCESSO",
      "erro_codigo": null,
      "descricao": "resposta recebida",
      "acao_tomada": "dados processados",
      "tentativa": 1,
      "duracao_ms": 7
    }
  ]
}
```

### 12. Situação-problema: API do G5 fora do ar (3 novas tentativas com espera de 1 s, 2 s e 4 s, depois 503; a API do G7 continua no ar)

```
$ POST /integracoes/pedidos/importar   (G5 parado)
HTTP/1.1 503 Service Unavailable
Retry-After: 30
{"erro":{"status":503,"codigo":"INTEGRACAO_INDISPONIVEL","mensagem":"API de Pedidos (G5) indisponível: G5 inalcançável (ECONNREFUSED)","detalhes":[]},"caminho":"/api/v1/integracoes/pedidos/importar","data_hora":"2026-11-13T12:03:29-03:00","request_id":"77411f82-46b0-4347-8431-b830cdaa6b14"}
tempo total: 7.184496s
```

Evidência no registro (tentativas e espera crescente):

```
$ SELECT tentativa, tipo_ocorrencia, descricao, acao_tomada FROM integracao_logs (última importação)
 tentativa | tipo_ocorrencia |           descricao            |             acao_tomada             
-----------+-----------------+--------------------------------+-------------------------------------
         1 | INDISPONIVEL    | G5 inalcançável (ECONNREFUSED) | nova tentativa em 1000 ms
         2 | INDISPONIVEL    | G5 inalcançável (ECONNREFUSED) | nova tentativa em 2000 ms
         3 | INDISPONIVEL    | G5 inalcançável (ECONNREFUSED) | nova tentativa em 4000 ms
         4 | INDISPONIVEL    | G5 inalcançável (ECONNREFUSED) | desistiu após esgotar as tentativas
(4 rows)

```

A API do G7 segue respondendo:

```
$ GET /health
{"status":"UP"}
```
