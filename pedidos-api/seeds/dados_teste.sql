-- Dados de teste do Grupo 5: pedidos 101 a 107 (= vendas 101 a 107 do Grupo 2), mais um pedido ABERTO.
-- Mesmos dados do banco simulado do Contrato B. Pode ser reaplicado (apaga e recarrega).

DELETE FROM item_pedido;
DELETE FROM pedido;
DELETE FROM cliente;

INSERT INTO cliente (cliente_id, nome) VALUES
    (1, 'João Silva'), (2, 'Maria Souza'), (3, 'Pedro Alves'), (4, 'Ana Ribeiro'),
    (5, 'Lucas Martins'), (6, 'Fernanda Rocha'), (7, 'Rafael Gomes');

INSERT INTO pedido (pedido_id, cliente_id, endereco_entrega, cidade_entrega, uf_entrega,
                    cep_entrega, data_pedido, valor_total, status, data_atualizacao) VALUES
    (101, 1, 'Rua 10, 250, Setor Oeste',            'Goiânia',              'GO', '74120020', '2026-10-19 09:00:00-03', 179.70, 'CONFIRMADO', '2026-10-19 09:05:00-03'),
    (102, 2, 'Av. Brasil, 1200, Centro',            'Anápolis',             'GO', '75024050', '2026-10-19 09:30:00-03', 89.90,  'CONFIRMADO', '2026-10-19 09:35:00-03'),
    (103, 3, 'Rua das Flores, 45, Jardim Luz',      'Aparecida de Goiânia', 'GO', '74915230', '2026-10-19 10:00:00-03', 249.00, 'CONFIRMADO', '2026-10-19 10:05:00-03'),
    (104, 4, 'SQN 210 Bloco C, Ap. 302, Asa Norte', 'Brasília',             'DF', '70862030', '2026-10-19 10:30:00-03', 320.50, 'CONFIRMADO', '2026-10-19 10:35:00-03'),
    (105, 5, 'Av. Rondon Pacheco, 3000, Tabajaras', 'Uberlândia',           'MG', '38400242', '2026-10-19 11:00:00-03', 59.90,  'CONFIRMADO', '2026-10-19 11:05:00-03'),
    (106, 6, 'Rua 7, 88, Centro',                   'Formosa',              'GO', '73801330', '2026-10-19 11:30:00-03', 145.00, 'CONFIRMADO', '2026-10-19 11:35:00-03'),
    (107, 7, 'Av. Presidente Vargas, 500, Centro',  'Rio Verde',            'GO', '75901010', '2026-10-19 12:00:00-03', 410.80, 'CONFIRMADO', '2026-10-19 12:05:00-03'),
    (108, 1, 'Rua 10, 250, Setor Oeste',            'Goiânia',              'GO', '74120020', '2026-10-19 13:00:00-03', 35.00,  'ABERTO',     '2026-10-19 13:00:00-03');

INSERT INTO item_pedido (pedido_id, descricao, quantidade, preco_unitario) VALUES
    (101, 'Camiseta básica', 3, 59.90),
    (102, 'Caneca térmica', 1, 89.90),
    (103, 'Tênis de corrida', 1, 249.00),
    (104, 'Fone de ouvido', 2, 120.25), (104, 'Capa de celular', 2, 40.00),
    (105, 'Livro', 1, 59.90),
    (106, 'Mochila', 1, 145.00),
    (107, 'Cadeira de escritório', 1, 410.80),
    (108, 'Boné', 1, 35.00);

-- novas inserções continuam depois dos ids de teste
SELECT setval(pg_get_serial_sequence('cliente', 'cliente_id'), (SELECT max(cliente_id) FROM cliente));
SELECT setval(pg_get_serial_sequence('pedido', 'pedido_id'), (SELECT max(pedido_id) FROM pedido));
