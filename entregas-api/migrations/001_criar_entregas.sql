-- Módulo Entregas: tabelas do Grupo 7 (banco próprio, nenhum outro grupo acessa)

CREATE TABLE entregas (
    id_entrega        SERIAL PRIMARY KEY,
    codigo_rastreio   VARCHAR(15)   NOT NULL UNIQUE,
    id_pedido         INTEGER       NOT NULL CHECK (id_pedido > 0),
    id_cliente        INTEGER       NOT NULL CHECK (id_cliente > 0),
    nome_destinatario VARCHAR(100)  NOT NULL,
    transportadora    VARCHAR(60)   NOT NULL,
    logradouro        VARCHAR(120)  NOT NULL,
    numero            VARCHAR(10)   NOT NULL,
    complemento       VARCHAR(60),
    bairro            VARCHAR(60)   NOT NULL,
    cidade            VARCHAR(60)   NOT NULL,
    uf                CHAR(2)       NOT NULL,
    cep               CHAR(9)       NOT NULL,
    data_prevista     DATE          NOT NULL,
    valor_frete       NUMERIC(6, 2) NOT NULL CHECK (valor_frete >= 0),
    status_entrega    VARCHAR(20)   NOT NULL DEFAULT 'AGUARDANDO_COLETA'
        CHECK (status_entrega IN (
            'AGUARDANDO_COLETA', 'EM_TRANSITO', 'SAIU_PARA_ENTREGA',
            'ENTREGUE', 'NAO_ENTREGUE', 'DEVOLVIDA', 'CANCELADA'
        )),
    data_entrega      DATE,
    data_criacao      TIMESTAMPTZ   NOT NULL DEFAULT now(),
    data_atualizacao  TIMESTAMPTZ   NOT NULL DEFAULT now()
);

-- Só pode existir uma entrega ativa (não cancelada) por pedido
CREATE UNIQUE INDEX uq_entregas_pedido_ativa
    ON entregas (id_pedido)
    WHERE status_entrega <> 'CANCELADA';

CREATE INDEX idx_entregas_status ON entregas (status_entrega);

CREATE TABLE entregas_historico (
    id_historico   SERIAL PRIMARY KEY,
    id_entrega     INTEGER      NOT NULL REFERENCES entregas (id_entrega) ON DELETE CASCADE,
    status_entrega VARCHAR(20)  NOT NULL,
    data_hora      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    observacao     VARCHAR(200)
);

CREATE INDEX idx_entregas_historico_entrega ON entregas_historico (id_entrega, id_historico);
