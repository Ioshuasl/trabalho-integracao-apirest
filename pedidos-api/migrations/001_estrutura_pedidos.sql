-- Banco do Grupo 5 (Pedidos). Estrutura reaproveitada do banco simulado do Contrato B
-- (cliente, pedido, item_pedido, trigger de data_atualizacao e view de integração),
-- agora com constraints para que a API recuse dados inválidos.

CREATE TABLE cliente (
    cliente_id SERIAL PRIMARY KEY,
    nome       VARCHAR(100) NOT NULL CHECK (btrim(nome) <> ''),
    ativo      BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE pedido (
    pedido_id        SERIAL PRIMARY KEY,
    cliente_id       INTEGER       NOT NULL REFERENCES cliente (cliente_id),
    endereco_entrega VARCHAR(200)  NOT NULL CHECK (btrim(endereco_entrega) <> ''),
    cidade_entrega   VARCHAR(80)   NOT NULL CHECK (btrim(cidade_entrega) <> ''),
    uf_entrega       CHAR(2)       NOT NULL CHECK (uf_entrega IN (
        'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA',
        'PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO')),
    cep_entrega      CHAR(8)       NOT NULL CHECK (cep_entrega ~ '^[0-9]{8}$'),
    data_pedido      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    valor_total      NUMERIC(10,2) NOT NULL CHECK (valor_total > 0),
    status           VARCHAR(20)   NOT NULL DEFAULT 'ABERTO'
        CHECK (status IN ('ABERTO', 'CONFIRMADO', 'CANCELADO')),
    data_atualizacao TIMESTAMPTZ   NOT NULL DEFAULT clock_timestamp()
);

CREATE INDEX ix_pedido_cliente ON pedido (cliente_id);
CREATE INDEX ix_pedido_status ON pedido (status);

CREATE TABLE item_pedido (
    item_pedido_id SERIAL PRIMARY KEY,
    pedido_id      INTEGER       NOT NULL REFERENCES pedido (pedido_id) ON DELETE CASCADE,
    descricao      VARCHAR(100)  NOT NULL CHECK (btrim(descricao) <> ''),
    quantidade     INTEGER       NOT NULL CHECK (quantidade > 0),
    preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario > 0)
);

CREATE INDEX ix_item_pedido ON item_pedido (pedido_id);

-- data_atualizacao muda a cada alteração do pedido (regra do Contrato B)
CREATE FUNCTION fn_pedido_data_atualizacao() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
    NEW.data_atualizacao := clock_timestamp();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pedido_data_atualizacao BEFORE UPDATE ON pedido
    FOR EACH ROW EXECUTE FUNCTION fn_pedido_data_atualizacao();

-- Estrutura de integração (Contrato B, seção 6): um pedido por linha, sem itens nem preços internos,
-- somente pedidos CONFIRMADO ou CANCELADO.
CREATE SCHEMA integracao;

CREATE VIEW integracao.vw_integracao_pedidos AS
SELECT pe.pedido_id                    AS codigo_pedido,
       cl.cliente_id                   AS codigo_cliente,
       cl.nome                         AS nome_cliente,
       pe.endereco_entrega,
       pe.cidade_entrega,
       pe.uf_entrega,
       pe.cep_entrega,
       pe.data_pedido,
       COALESCE(SUM(ip.quantidade), 0)::integer AS quantidade_itens,
       pe.valor_total,
       pe.status                       AS status_pedido,
       pe.data_atualizacao
FROM pedido pe
JOIN cliente cl          ON cl.cliente_id = pe.cliente_id
LEFT JOIN item_pedido ip ON ip.pedido_id  = pe.pedido_id
WHERE pe.status IN ('CONFIRMADO', 'CANCELADO')
GROUP BY pe.pedido_id, cl.cliente_id, cl.nome;
