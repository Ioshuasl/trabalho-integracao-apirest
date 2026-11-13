# **Trabalho Prático – Integração de Aplicações via API REST**

## **1\. Identificação**

* Tema: Integração de sistemas utilizando API REST.  
* Forma de integração: Comunicação síncrona por requisições HTTP.  
* Formato de dados: JSON.  
* Tecnologia: Livre escolha dos grupos.  
* Organização: Sete grupos, cada um responsável por um sistema independente.

## **2\. Contextualização**

Em ambientes corporativos, diferentes sistemas precisam compartilhar informações para executar processos de negócio.

Por exemplo, um sistema de vendas pode precisar consultar produtos e preços em um sistema de produtos, verificar a disponibilidade em um sistema de estoque e encaminhar informações para um sistema financeiro.

Uma das abordagens mais utilizadas para realizar essa comunicação é a integração por meio de APIs REST (Representational State Transfer).

Nesse modelo, uma aplicação disponibiliza recursos por meio de endpoints, que podem ser acessados por outras aplicações utilizando métodos HTTP, como GET, POST, PUT e DELETE.

As informações geralmente são transmitidas no formato JSON.

Entretanto, a integração entre sistemas independentes pode apresentar diversos problemas, como incompatibilidade de estruturas JSON, endpoints inexistentes, erros de autenticação, dados inválidos, indisponibilidade de serviços e utilização incorreta dos métodos HTTP.

Neste trabalho, cada grupo deverá desenvolver uma aplicação que disponibilize uma API REST e também consuma a API REST desenvolvida por outro grupo.

O principal desafio será demonstrar que integrar aplicações não significa simplesmente realizar uma requisição HTTP, mas estabelecer contratos de comunicação, validar informações, tratar erros e garantir a consistência dos dados compartilhados.

## **3\. Objetivos**

Ao final da atividade, o aluno deverá ser capaz de:

* Compreender a API REST como mecanismo de integração entre aplicações.  
* Desenvolver uma API REST para disponibilizar informações.  
* Consumir APIs REST desenvolvidas por outras equipes.  
* Compreender e utilizar os métodos HTTP.  
* Definir endpoints e contratos de integração.  
* Estruturar e interpretar dados JSON.  
* Implementar operações de consulta, inclusão, alteração e exclusão.  
* Tratar códigos de resposta HTTP.  
* Validar dados recebidos de aplicações externas.  
* Implementar tratamento de exceções e falhas de comunicação.  
* Identificar problemas de interoperabilidade.  
* Compreender os desafios de comunicação entre sistemas independentes.

## **4\. Organização da atividade**

A turma será dividida em sete grupos.

Cada grupo representará uma equipe responsável pelo desenvolvimento de um sistema de informação independente.

Os grupos serão organizados em uma cadeia de integração:

## **Cadeia de integração**

Grupo 1 → Grupo 3  
Grupo 2 → Grupo 4  
Grupo 3 → Grupo 5  
Grupo 4 → Grupo 6  
Grupo 5 → Grupo 7  
Grupo 6 → Grupo 1  
Grupo 7 → Grupo 2

Representação da sequência de consumo. O último grupo fecha o ciclo com o primeiro.

Cada grupo terá dois papéis:

Sistema fornecedor (API Provider)

Será responsável por:

* Desenvolver e disponibilizar uma API REST.  
* Definir os endpoints.  
* Implementar os métodos HTTP necessários.  
* Definir a estrutura dos dados JSON.  
* Validar as informações recebidas.  
* Retornar códigos HTTP adequados.  
* Documentar o contrato da API.

Sistema consumidor (API Consumer)

Será responsável por:

* Realizar requisições à API do grupo fornecedor.  
* Interpretar as respostas JSON.  
* Validar os dados recebidos.  
* Tratar códigos HTTP de sucesso e erro.  
* Tratar falhas de comunicação.  
* Processar e armazenar os dados recebidos, quando aplicável.  
* Registrar as ocorrências de integração.

Assim, todos os grupos deverão desenvolver uma API própria e consumir a API de outro grupo.

## **5\. Cenários de integração**

Cada grupo deverá desenvolver um sistema relacionado a um domínio específico.

| Grupo | Sistema | Responsabilidade principal |
| ----- | ----- | ----- |
| 1 | Clientes | Cadastro e consulta de clientes |
| 2 | Vendas | Registro e consulta de vendas |
| 3 | Produtos | Cadastro, consulta e atualização de produtos |
| 4 | Estoque | Consulta e atualização de quantidades |
| 5 | Pedidos | Registro e acompanhamento de pedidos |
| 6 | Financeiro | Registro e consulta de pagamentos |
| 7 | Entregas | Cadastro e acompanhamento de entregas |

Os sistemas deverão trocar informações por meio de APIs REST, respeitando a cadeia estabelecida.

Importante: cada grupo deverá possuir sua própria aplicação e sua própria estrutura de dados. Não será permitido substituir a comunicação via API pelo acesso direto ao banco de dados de outro grupo.

## **6\. Arquitetura da solução**

A integração deverá seguir, conceitualmente, o seguinte fluxo:

Sistema consumidor

Aplicação desenvolvida pelo grupo consumidor

Requisição HTTP

GET · POST · PUT · DELETE

Endpoint \+ parâmetros \+ cabeçalhos \+ JSON

API REST do sistema fornecedor

Rotas · validações · regras de negócio

Banco de dados do fornecedor

Persistência dos dados

Resposta HTTP \+ JSON

Dados processados ou mensagem de erro

A arquitetura deverá demonstrar que as aplicações são independentes e que a comunicação ocorre exclusivamente por meio das APIs REST disponibilizadas pelos grupos.

## **7\. Contrato de integração da API REST**

Antes de iniciar a implementação, os grupos envolvidos deverão elaborar conjuntamente um Contrato de Integração REST.

Esse contrato será o acordo técnico entre o grupo fornecedor e o grupo consumidor.

O documento deverá especificar:

### **7.1 Identificação da API**

* Nome da API.  
* Finalidade.  
* Sistema fornecedor.  
* Sistema consumidor.  
* URL-base.  
* Versão da API.

Exemplo:

```
Nome: API de Produtos
URL-base: http://localhost:5003/api/v1
Formato: application/json
Versão: 1.0
```

### **7.2 Definição dos endpoints**

Para cada operação disponibilizada, deverão ser especificados:

* Endpoint (rota).  
* Método HTTP.  
* Finalidade.  
* Parâmetros necessários.  
* Dados enviados.  
* Estrutura da resposta.  
* Código HTTP esperado.

Exemplo de especificação:

| Método | Endpoint | Finalidade |
| ----- | ----- | ----- |
| GET | /produtos | Listar produtos |
| GET | /produtos/ | Consultar produto |
| POST | /produtos | Cadastrar produto |
| PUT | /produtos/ | Atualizar produto |
| DELETE | /produtos/ | Excluir produto |

### **7.3 Estrutura dos dados JSON**

Os grupos deverão definir os atributos, tipos e regras de validação.

Exemplo:

Requisição POST /produtos

```
{
  "nome": "Teclado Mecânico",
  "descricao": "Teclado USB",
  "preco": 250.90,
  "quantidade": 15,
  "categoria": "Perifericos"
}
```

Resposta de sucesso:

```
{
  "id": 101,
  "nome": "Teclado Mecânico",
  "descricao": "Teclado USB",
  "preco": 250.90,
  "quantidade": 15,
  "categoria": "Perifericos"
}
```

### **7.4 Códigos de resposta HTTP**

O contrato deverá definir os códigos HTTP utilizados pela API.

| Código | Significado | Exemplo |
| ----- | ----- | ----- |
| 200 | OK | Consulta realizada |
| 201 | Created | Registro cadastrado |
| 204 | No Content | Exclusão realizada sem corpo de resposta |
| 400 | Bad Request | Dados enviados inválidos |
| 401 | Unauthorized | Falha de autenticação |
| 403 | Forbidden | Usuário sem permissão |
| 404 | Not Found | Registro ou endpoint não encontrado |
| 409 | Conflict | Registro duplicado ou conflito de estado |
| 422 | Unprocessable Content | Dados semanticamente inválidos |
| 500 | Internal Server Error | Erro interno no servidor |
| 503 | Service Unavailable | Serviço temporariamente indisponível |

Os grupos deverão compreender que o código HTTP faz parte do contrato e não deve ser utilizado aleatoriamente.

## **8\. Implementação da API REST**

Cada grupo deverá desenvolver uma API REST funcional.

A implementação deverá contemplar:

1. Criação da aplicação servidora.  
2. Configuração das rotas.  
3. Implementação dos métodos HTTP.  
4. Recebimento e interpretação de JSON.  
5. Validação dos dados.  
6. Implementação das regras de negócio.  
7. Persistência dos dados em banco de dados próprio.  
8. Retorno de respostas HTTP adequadas.  
9. Tratamento de exceções.  
10. Documentação dos endpoints.

Não será suficiente criar endpoints que apenas retornem dados fixos. As operações deverão apresentar funcionamento real, incluindo persistência e aplicação das regras de negócio.

## **9\. Desenvolvimento do sistema consumidor**

Cada grupo também deverá desenvolver um módulo capaz de consumir a API REST do grupo seguinte.

Esse módulo deverá:

* Realizar requisições HTTP.  
* Enviar parâmetros e dados JSON.  
* Interpretar as respostas recebidas.  
* Verificar os códigos HTTP.  
* Tratar erros retornados pela API.  
* Validar as informações recebidas.  
* Processar os dados de acordo com as regras do sistema consumidor.  
* Registrar as ocorrências da integração.

O consumidor não deverá depender de detalhes internos da implementação do fornecedor, mas apenas do contrato de integração.

## **10\. Situações-problema da integração**

Aqui está uma parte importante da proposta: assim como fizemos na atividade de CSV, os grupos deverão enfrentar problemas introduzidos propositalmente durante a integração.

1. O representante do grupo receberá um email contendo as situações-problema.  
2. O grupo fornecedor introduz os problemas na API ou prepara condições para que ocorram.  
3. O grupo consumidor realiza as requisições normalmente.  
4. O consumidor deverá identificar o problema por meio das respostas recebidas.  
5. O consumidor deverá tratar a situação sem simplesmente encerrar a aplicação.  
6. Os dois grupos deverão apresentar como resolveram o problema.

Exemplo prático:

O Grupo 2 (Vendas) solicita os dados de um produto ao Grupo 3 (Produtos).

A requisição esperada seria:

```
GET /api/v1/produtos/101
```

Entretanto, o Grupo 3 altera propositalmente a resposta, removendo o atributo `preco`.

O Grupo 2 deverá identificar que a resposta não atende ao contrato de integração e impedir que uma venda seja registrada sem o preço do produto.

Esse tipo de situação permite avaliar se os alunos realmente compreenderam a importância do contrato de integração e da validação dos dados recebidos.

## **11\. Regras importantes**

Regra 1 – Independência dos sistemas

Cada grupo deverá desenvolver sua própria aplicação e sua própria API REST.

Regra 2 – Comunicação via API

A troca de informações entre grupos deverá ocorrer exclusivamente por requisições HTTP à API REST.

Regra 3 – Contrato de integração

O consumidor deverá utilizar os endpoints e as estruturas definidos no contrato.

Regra 4 – Tratamento de erros

O sistema consumidor deverá tratar adequadamente as respostas de erro e as falhas de comunicação.

Regra 5 – Não basta consumir uma API

Não será suficiente realizar uma requisição e simplesmente apresentar o JSON recebido. Os dados deverão ser utilizados pelo sistema consumidor.

Regra 6 – Problemas introduzidos

O grupo consumidor não deverá receber antecipadamente a lista das inconsistências que serão apresentadas pelo fornecedor.

Regra 7 – Persistência

Cada grupo deverá demonstrar que os dados processados pela sua aplicação são persistidos em seu próprio banco de dados.

Regra 8 – Documentação

Todas as rotas, métodos, parâmetros, estruturas JSON e códigos de resposta deverão estar documentados.

## **12\. O que deverá ser entregue**

Cada grupo deverá entregar os documentos listados abaixo por meio do link de uma pasta virtual, que deve ser postado diretamente no [**Google Classroom**](https://classroom.google.com/w/ODcxOTgzNDA5NTMx/t/all).

1. Código-fonte: implementação completa da API REST e do sistema consumidor.  
2. Contrato de integração: documento com os endpoints e as estruturas JSON.  
3. Documentação da API: especificação das rotas, métodos e respostas.  
4. Banco de dados: script para criação das tabelas e dados necessários.  
5. Evidências de testes: registros ou capturas de tela das requisições realizadas.  
6. Tratamento das situações-problema: demonstração dos problemas identificados e respectivas soluções.  
7. Relatório técnico: descrição da arquitetura, tecnologias utilizadas, decisões técnicas e dificuldades encontradas.

## **13\. Demonstração prática**

Durante a apresentação, cada grupo deverá demonstrar:

| Etapa | Demonstração |
| ----- | ----- |
| 1\. API fornecedora | Inicializar e disponibilizar a API |
| 2\. Documentação | Apresentar os endpoints |
| 3\. Teste da API | Realizar requisições GET, POST, PUT e DELETE |
| 4\. Consumo | Executar o módulo consumidor |
| 5\. Integração | Demonstrar a troca de informações com outro grupo |
| 6\. Persistência | Demonstrar os dados armazenados no banco |
| 7\. Falhas | Demonstrar as situações-problema |
| 8\. Tratamento | Apresentar como os erros foram identificados e tratados |

## **14\. Questões para discussão**

Durante a apresentação, os grupos deverão responder:

1. Qual a diferença entre disponibilizar uma API REST e consumir uma API REST?  
2. Qual a importância do contrato de integração?  
3. Por que é importante utilizar corretamente os métodos HTTP?  
4. Qual a diferença entre os códigos HTTP 400, 401, 403 e 404?  
5. O que deve acontecer quando uma API está indisponível?  
6. O consumidor deve confiar automaticamente nos dados recebidos?  
7. Como evitar que uma mesma requisição POST provoque cadastros duplicados?  
8. Qual a importância da validação dos dados JSON?  
9. Quais são os riscos de alterar um endpoint sem comunicar os consumidores?  
10. O que acontece quando uma API altera o nome de um atributo utilizado por outra aplicação?  
11. Por que cada sistema deve manter sua própria base de dados?  
12. Quais são as vantagens e limitações da integração via API REST em comparação com arquivos CSV e banco de dados compartilhado?

## **15\. Conceitos de integração que deverão ser observados**

Durante o desenvolvimento, os grupos deverão relacionar a implementação aos seguintes conceitos:

* Arquitetura REST.  
* API Provider e API Consumer.  
* Comunicação síncrona.  
* Protocolo HTTP.  
* Métodos HTTP.  
* Endpoints e recursos.  
* JSON.  
* Contrato de integração.  
* Status codes.  
* Autenticação e autorização.  
* Validação de dados.  
* Tratamento de erros.  
* Timeout e retry.  
* Idempotência.  
* Versionamento de APIs.  
* Interoperabilidade.  
* Persistência de dados.  
* Logs e rastreabilidade.

## **16\. Reflexão final**

Ao concluir o trabalho, os estudantes deverão compreender que a integração via API REST vai além de estabelecer uma comunicação HTTP entre duas aplicações.

Uma integração confiável depende da definição de contratos, da padronização dos dados, da validação das informações, do tratamento de erros e da capacidade de recuperação diante de falhas.

O objetivo não é simplesmente desenvolver uma API que retorne JSON, mas sim simular um ambiente corporativo no qual sistemas independentes precisam trocar informações para executar processos de negócio.

