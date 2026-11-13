# Evidências de testes — Grupo 7 (Entregas)

Trabalho Prático de Integração de Aplicações via API REST. Este documento reúne as evidências de testes e o tratamento das situações-problema. Os registros brutos estão na pasta `evidencias/`.

## 1. Resumo dos resultados

| Verificação | Alvo | Resultado | Registro bruto |
|---|---|---|---|
| Testes automatizados (Vitest + Supertest, contra PostgreSQL real) | API de Entregas (G7) | **76 de 76 passaram** (2 arquivos) | `evidencias/testes-automatizados-g7.txt` |
| Testes automatizados (Vitest + Supertest, contra PostgreSQL real) | API de Pedidos (G5, simulada) | **33 de 33 passaram** | `evidencias/testes-automatizados-g5.txt` |
| Coleção Postman executada com Newman | API de Entregas (G7) | **29 requisições, 59 asserções, 0 falhas** | `evidencias/postman-g7.txt` |
| Coleção Postman executada com Newman | API de Pedidos (G5) | **38 requisições, 74 asserções, 0 falhas** | `evidencias/postman-g5.txt` |
| Execução real dos dois sistemas integrados (curl, dois servidores e dois bancos) | G5 → G7 → G2 | 12 cenários, ver seção 3 | `evidencias/execucao-real.md` |

Os testes de integração com o G5 no `tests/integracao-pedidos.test.ts` usam um servidor HTTP simulado do G5 (`tests/fake-g5.ts`), o que permite provocar falhas e dados inválidos de propósito. A execução real (seção 3) usa a API de Pedidos construída pelo grupo.

## 2. Como reproduzir

```bash
# bancos (um container PostgreSQL por sistema)
cd pedidos-api && npm run db:up && npm run migrate && npm run seed
cd ../entregas-api && npm run db:up && npm run migrate

# testes automatizados
cd pedidos-api && npm test
cd ../entregas-api && npm test

# coleções Postman (com cada API no ar: npm run dev)
cd pedidos-api && npm run test:postman
cd ../entregas-api && npm run test:postman
```

## 3. Execução real dos sistemas integrados

Roteiro de `evidencias/execucao-real.md` (saídas reais de cada requisição):

| # | Cenário | O que mostra |
|---|---|---|
| 1 | G5: `GET /integracao/pedidos` com a chave do G7 | Estrutura do Contrato B em JSON; só pedidos CONFIRMADO/CANCELADO |
| 2 | G5: chave do G7 em `/pedidos` | **403** `SEM_PERMISSAO`: o G7 só enxerga a estrutura de integração |
| 3 | G7: primeira importação | 7 pedidos CONFIRMADOS viram 7 entregas; o pedido 108 (ABERTO) não vem |
| 4 | G7: segunda importação | Idempotência: 7 sem alteração, nada duplicado |
| 5 | G5: altera endereço do 101, cancela o 102, confirma o 108 | Mudanças feitas pelo fornecedor |
| 6 | G7: terceira importação | 1 inserido (108), 2 atualizados (endereço do 101; entrega do 102 cancelada) |
| 7 | Banco do G7 | Persistência: entregas com `origem = PEDIDOS_G5`, endereço novo e entrega 102 `CANCELADA` |
| 8 | G2: `GET /entregas?id_pedido=101` com a chave de leitura | Consumo do G7 pelo G2 |
| 9 | G2: histórico da entrega 102 | Histórico com a importação e o cancelamento |
| 10 | G2: `POST /entregas` com a chave de leitura | **403**: o G2 só lê |
| 11 | G7: `GET /integracoes/logs` | Cada chamada ao G5 registrada com `request_id`, status, tentativa e duração |
| 12 | **G5 fora do ar** | 4 tentativas (espera de 1 s, 2 s e 4 s), depois **503** `INTEGRACAO_INDISPONIVEL` em 7,2 s; a API do G7 continua no ar (`/health` UP) |

## 4. Situações-problema: identificação e tratamento

Cada linha mostra o problema que o fornecedor pode introduzir, como o consumidor o identifica, o que faz (sem encerrar a aplicação) e onde está a prova.

### 4.1 G7 consumindo o G5

| Situação-problema | Como o G7 identifica | Tratamento | Evidência |
|---|---|---|---|
| G5 fora do ar (conexão recusada) | Falha de rede (`ECONNREFUSED`) | 3 novas tentativas (1 s, 2 s, 4 s); depois responde 503 `INTEGRACAO_INDISPONIVEL`; nada é gravado; a API segue no ar | Execução real 12; teste "G5 fora do ar" |
| G5 lento (timeout de 5 s) | `AbortSignal` do `fetch` | Mesmas novas tentativas; cada uma registrada como `TIMEOUT` | Teste "timeout: repete e registra TIMEOUT" |
| G5 devolve 503 | Código HTTP | Repete até 3 vezes e conclui se voltar; se não voltar, 503 | Testes "repete após 503 e conclui" e "desiste após esgotar as tentativas" |
| G5 devolve 500 | Código HTTP | Uma nova tentativa; persistindo, 502 `INTEGRACAO_ERRO` | Teste "500 é repetido uma vez só" |
| G5 recusa a chave (401) | Código HTTP | Não repete; 502 `INTEGRACAO_AUTENTICACAO`; registra `erro.codigo` do G5 | Teste "401 do G5 não é repetido" |
| G5 devolve HTML ou JSON fora do formato | Corpo não é JSON, ou sem `dados` e `paginacao` | Rejeita a resposta, registra `VIOLACAO_CONTRATO`; 502 | Teste "corpo que não é JSON ou fora do formato combinado" |
| Pedido com campo obrigatório nulo ou ausente | Validação campo a campo | Rejeita só esse pedido (`CAMPO_OBRIGATORIO`); os demais seguem | Teste "rejeita cada pedido inválido com o tipo de erro certo" |
| Tipo errado (ex.: `quantidade_itens: "3"`) | Validação de tipo | `TIPO_INVALIDO` | Mesmo teste |
| UF inexistente, CEP com 4 dígitos, valor negativo, quantidade 0, data futura, status fora do enum | Validação de valor | `VALOR_INVALIDO` | Mesmo teste |
| Mesmo `codigo_pedido` duas vezes na leitura | Contagem por código | Rejeita todas as cópias (`REGISTRO_DUPLICADO`) e registra para avisar o G5 | Teste "rejeita todas as cópias de um codigo_pedido repetido" |
| Pedido corrigido pelo G5 depois de rejeitado | Nova leitura | Pedido rejeitado não é gravado como integrado, então entra na execução seguinte | Teste "pedido rejeitado volta a ser lido" |
| Pedido CANCELADO que o G7 nunca recebeu | Não existe em `pedidos_importados` | Ignorado, sem erro (contrato) | Teste "CANCELADO que nunca chegou confirmado é ignorado" |
| `data_atualizacao` mais antiga que a já integrada | Comparação de instantes | Rejeita (`REGRA_NEGOCIO`): o pedido não volta no tempo | Teste "data_atualizacao mais antiga que a gravada é rejeitada" |
| Endereço alterado com a entrega já em rota | Status da entrega | Rejeita para tratamento manual e mantém a mudança pendente | Teste "endereço alterado com a entrega em andamento" |
| Pedido cancelado com a entrega já em rota | Status da entrega | Rejeita para decisão manual; a entrega não é tocada | Teste "pedido cancelado com a entrega já em rota" |
| Conflito: já existe entrega ativa para o mesmo `id_pedido` | 409 interno | `CONFLITO` registrado; o pedido não é importado | Teste "registra conflito quando já existe entrega ativa" |
| Duas importações ao mesmo tempo | Chave primária e bloqueio de linha | Cada entrega é criada uma única vez | Teste "importações simultâneas criam cada entrega uma única vez" |

### 4.2 G7 como fornecedor (para o G2) e G5 como fornecedor (para o G7)

| Situação-problema | Tratamento da API | Evidência |
|---|---|---|
| Consumidor sem chave, ou com chave inválida | 401 `NAO_AUTENTICADO` | Testes de autenticação (G5 e G7); Postman "401" |
| Chave de leitura tentando escrever (G7 para o G2; G5 para o G7) | 403 `SEM_PERMISSAO` | Execução real 2 e 10; Postman "403" |
| JSON malformado, `Content-Type` errado, campo ausente ou tipo errado | 400 `REQUISICAO_INVALIDA`, com um item em `detalhes` por campo | Testes "400" e Postman "400" |
| Valor com tipo certo mas inválido (UF, CEP, data no passado, frete negativo) | 422 `VALIDACAO_SEMANTICA`, com `detalhes` | Testes "422" e Postman "422" |
| Segunda entrega ativa para o mesmo pedido | 409 `ENTREGA_DUPLICADA` (índice único parcial no banco, vale também sob concorrência) | Teste "apenas uma de duas requisições simultâneas cria a entrega" (envia 4 POSTs ao mesmo tempo: 1 criado, 3 com 409) |
| Transição de status inválida; PUT ou DELETE em status que não permite | 409 `TRANSICAO_INVALIDA` ou `OPERACAO_NAO_PERMITIDA` | Testes de PATCH/PUT/DELETE e Postman "409" |
| Recurso ou rota inexistente | 404 `NAO_ENCONTRADO` | Postman "404" |
| Banco de dados fora do ar | 503 `SERVICO_INDISPONIVEL` com `Retry-After` | Verificado na API do G7 parando o container do banco (`/health` e as rotas respondem 503 e voltam ao normal quando ele sobe) |

## 5. Observação sobre a coleta

Os registros de `evidencias/` foram gerados por execução real, não montados à mão: os dois servidores no ar, cada um com seu PostgreSQL em container, e os comandos de `npm test` e Newman. Para refazer qualquer um deles, siga a seção 2.
