-- Nova cadeia de integração: o G7 passa a consumir a API de Pedidos do G5 (e o G2 consome a API do G7).
-- Sai a importação de vendas do G2; entra a importação de pedidos do G5 (Contrato B, estrutura de dados do G5).

DROP TABLE IF EXISTS vendas_importadas;
DROP INDEX IF EXISTS uq_entregas_id_venda;

ALTER TABLE entregas DROP COLUMN id_venda;

ALTER TABLE entregas DROP CONSTRAINT entregas_origem_check;
UPDATE entregas SET origem = 'PEDIDOS_G5' WHERE origem = 'VENDAS_G2';
ALTER TABLE entregas ADD CONSTRAINT entregas_origem_check CHECK (origem IN ('API', 'PEDIDOS_G5'));

-- endereco_entrega do G5 (rua, número e bairro) tem até 200 caracteres
ALTER TABLE entregas ALTER COLUMN logradouro TYPE VARCHAR(200);

ALTER TABLE integracao_logs ALTER COLUMN sistema SET DEFAULT 'G5';

-- Pedidos do G5 já recebidos: guarda a última leitura de cada pedido (data_atualizacao do G5 detecta mudanças)
CREATE TABLE pedidos_importados (
    codigo_pedido        INTEGER       PRIMARY KEY,
    codigo_cliente       INTEGER       NOT NULL,
    nome_cliente         VARCHAR(100)  NOT NULL,
    endereco_entrega     VARCHAR(200)  NOT NULL,
    cidade_entrega       VARCHAR(80)   NOT NULL,
    uf_entrega           CHAR(2)       NOT NULL,
    cep_entrega          CHAR(8)       NOT NULL,
    data_pedido          TIMESTAMPTZ   NOT NULL,
    quantidade_itens     INTEGER       NOT NULL,
    valor_total          NUMERIC(10,2) NOT NULL,
    status_pedido        VARCHAR(20)   NOT NULL CHECK (status_pedido IN ('CONFIRMADO', 'CANCELADO')),
    origem_atualizado_em TIMESTAMPTZ   NOT NULL,
    id_entrega           INTEGER REFERENCES entregas (id_entrega) ON DELETE CASCADE,
    ultima_importacao_id UUID          NOT NULL,
    importado_em         TIMESTAMPTZ   NOT NULL DEFAULT now(),
    atualizado_em        TIMESTAMPTZ   NOT NULL DEFAULT now()
);
