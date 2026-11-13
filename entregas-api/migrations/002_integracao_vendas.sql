-- Integração com a API de Vendas (G2).
-- Entregas importadas de vendas chegam sem alguns dados que o G2 não fornece; esses campos
-- ficam nulos (pendências) até o Grupo 7 completá-los via PUT /entregas/{id}.

ALTER TABLE entregas
    ALTER COLUMN id_cliente     DROP NOT NULL,
    ALTER COLUMN transportadora DROP NOT NULL,
    ALTER COLUMN numero         DROP NOT NULL,
    ALTER COLUMN bairro         DROP NOT NULL,
    ALTER COLUMN data_prevista  DROP NOT NULL,
    ALTER COLUMN valor_frete    DROP NOT NULL,
    ADD COLUMN origem   VARCHAR(20) NOT NULL DEFAULT 'API' CHECK (origem IN ('API', 'VENDAS_G2')),
    ADD COLUMN id_venda INTEGER;

CREATE UNIQUE INDEX uq_entregas_id_venda ON entregas (id_venda) WHERE id_venda IS NOT NULL;

-- Vendas confirmadas já recebidas do G2 (também garante a idempotência da importação)
CREATE TABLE vendas_importadas (
    id_venda          INTEGER PRIMARY KEY,
    cliente_nome      TEXT          NOT NULL,
    cliente_documento VARCHAR(14)   NOT NULL,
    entrega_endereco  TEXT          NOT NULL,
    entrega_cidade    TEXT          NOT NULL,
    entrega_uf        CHAR(2)       NOT NULL,
    entrega_cep       CHAR(8)       NOT NULL,
    itens             JSONB         NOT NULL,
    valor_total       NUMERIC(12,2) NOT NULL,
    status_venda      VARCHAR(12)   NOT NULL,
    criado_em_g2      TIMESTAMPTZ   NOT NULL,
    atualizado_em_g2  TIMESTAMPTZ   NOT NULL,
    id_entrega        INTEGER REFERENCES entregas (id_entrega) ON DELETE CASCADE,
    importacao_id     UUID          NOT NULL,
    importada_em      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Registro de cada chamada ao G2 e de cada ocorrência da integração
CREATE TABLE integracao_logs (
    id_log          BIGSERIAL PRIMARY KEY,
    data_hora       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    importacao_id   UUID,
    request_id      UUID,
    sistema         VARCHAR(10)  NOT NULL DEFAULT 'G2',
    metodo          VARCHAR(10)  NOT NULL,
    endpoint        TEXT         NOT NULL,
    status_http     INTEGER,
    tipo_ocorrencia VARCHAR(20)  NOT NULL,
    erro_codigo     VARCHAR(60),
    descricao       TEXT         NOT NULL,
    acao_tomada     TEXT         NOT NULL,
    tentativa       INTEGER      NOT NULL DEFAULT 1,
    duracao_ms      INTEGER
);

CREATE INDEX idx_integracao_logs_importacao ON integracao_logs (importacao_id);
CREATE INDEX idx_integracao_logs_data ON integracao_logs (data_hora DESC);
