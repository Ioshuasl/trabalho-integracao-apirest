import { isViolacaoUnicidade, pool, withTransaction, type Queryable } from '../../shared/database/pool';
import { anoAtual } from '../../shared/datetime';
import { erros } from '../../shared/http/errors';
import type { AlterarStatusInput, AtualizarEntregaInput, CriarEntregaInput } from './entregas.schemas';
import * as repo from './entregas.repository';
import type {
  DadosPedidoImportado,
  Entrega,
  FiltrosListagem,
  HistoricoItem,
  Pagina,
  ResultadoAtualizacao,
  ResultadoCancelamento,
} from './entregas.types';
import {
  exigirStatusValido,
  lancarSeHouver,
  validarAlteracaoStatus,
  validarAtualizacao,
  validarCriacao,
  validarImportacao,
} from './entregas.validation';
import { STATUS_EDITAVEIS, TRANSICOES } from './status';

/*
 * Ordem de verificação (contrato, seção 2): 404 -> 409 -> 422.
 * O 400 (estrutura) e o 401/403 já foram tratados antes de chegar aqui.
 */

const naoEncontrada = (id: number) => erros.naoEncontrado(`Entrega ${id} não encontrada.`);

export function gerarCodigoRastreio(id: number): string {
  return `ENT-${anoAtual()}-${String(id).padStart(6, '0')}`;
}

export async function listar(filtros: FiltrosListagem): Promise<Pagina<Entrega>> {
  const { entregas, total } = await repo.listar(pool, filtros);
  return {
    dados: entregas,
    paginacao: {
      pagina: filtros.pagina,
      tamanho: filtros.tamanho,
      total_registros: total,
      total_paginas: Math.ceil(total / filtros.tamanho),
    },
  };
}

export async function obter(id: number): Promise<Entrega> {
  const entrega = await repo.buscarPorId(pool, id);
  if (!entrega) throw naoEncontrada(id);
  return entrega;
}

export async function criar(dados: CriarEntregaInput): Promise<Entrega> {
  return withTransaction(async (db) => {
    if (await repo.existeAtivaPorPedido(db, dados.id_pedido)) throw erros.entregaDuplicada(dados.id_pedido);
    lancarSeHouver(validarCriacao(dados));

    const id = await repo.proximoId(db);
    try {
      const entrega = await repo.inserir(db, id, gerarCodigoRastreio(id), dados.id_pedido, dados.id_cliente, dados);
      await repo.inserirHistorico(db, id, 'AGUARDANDO_COLETA', null);
      return entrega;
    } catch (err) {
      // Corrida: outra requisição criou a entrega ativa do mesmo pedido entre a checagem e o INSERT.
      if (isViolacaoUnicidade(err)) throw erros.entregaDuplicada(dados.id_pedido);
      throw err;
    }
  });
}

export async function atualizar(id: number, dados: AtualizarEntregaInput): Promise<Entrega> {
  return withTransaction(async (db) => {
    const atual = await repo.buscarPorId(db, id, true);
    if (!atual) throw naoEncontrada(id);
    if (!STATUS_EDITAVEIS.includes(atual.status_entrega)) {
      throw erros.operacaoNaoPermitida(
        `A entrega não pode ser alterada com status ${atual.status_entrega}; só em ${STATUS_EDITAVEIS.join(' ou ')}.`,
      );
    }
    lancarSeHouver(validarAtualizacao(dados, atual));
    return repo.atualizarCadastro(db, id, dados, atual.id_cliente ?? dados.id_cliente ?? null);
  });
}

/*
 * Facade usada pelo módulo de integração com o G5. As três funções rodam na transação do chamador
 * (assim a entrega e o registro do pedido importado são gravados juntos ou nenhum dos dois).
 */

/**
 * Cria a entrega de um pedido CONFIRMADO do G5 (id_pedido = codigo_pedido).
 * Só traz o que o G5 fornece; o restante fica como pendência (ver Entrega.pendencias).
 */
export async function registrarDePedido(db: Queryable, dados: DadosPedidoImportado): Promise<Entrega> {
  const normalizados = normalizarPedido(dados);
  if (await repo.existeAtivaPorPedido(db, dados.codigo_pedido)) throw erros.entregaDuplicada(dados.codigo_pedido);
  lancarSeHouver(validarImportacao(normalizados));

  const id = await repo.proximoId(db);
  try {
    const entrega = await repo.inserirImportada(db, id, gerarCodigoRastreio(id), normalizados);
    await repo.inserirHistorico(db, id, 'AGUARDANDO_COLETA', `Importada do pedido ${dados.codigo_pedido} do G5`);
    return entrega;
  } catch (err) {
    if (isViolacaoUnicidade(err)) throw erros.entregaDuplicada(dados.codigo_pedido);
    throw err;
  }
}

/** Pedido do G5 mudou de endereço/nome: atualiza a entrega enquanto ela ainda pode ser editada. */
export async function atualizarDePedido(db: Queryable, dados: DadosPedidoImportado): Promise<ResultadoAtualizacao> {
  const atual = await repo.buscarPorPedidoImportado(db, dados.codigo_pedido, true);
  if (!atual) return 'SEM_ENTREGA';
  if (!STATUS_EDITAVEIS.includes(atual.status_entrega)) return 'NAO_EDITAVEL';

  const normalizados = normalizarPedido(dados);
  lancarSeHouver(validarImportacao(normalizados));
  await repo.atualizarDadosImportados(db, atual.id_entrega, normalizados);
  return 'ATUALIZADA';
}

/** Pedido CANCELADO no G5: cancela a entrega se ela ainda não saiu para entrega. */
export async function cancelarDePedido(db: Queryable, codigoPedido: number): Promise<ResultadoCancelamento> {
  const atual = await repo.buscarPorPedidoImportado(db, codigoPedido, true);
  if (!atual) return 'SEM_ENTREGA';
  if (atual.status_entrega === 'CANCELADA') return 'JA_CANCELADA';
  if (!TRANSICOES[atual.status_entrega].includes('CANCELADA')) return 'EM_ANDAMENTO';

  await repo.atualizarStatus(db, atual.id_entrega, 'CANCELADA', null);
  await repo.inserirHistorico(db, atual.id_entrega, 'CANCELADA', 'Pedido cancelado no G5');
  return 'CANCELADA';
}

function normalizarPedido(dados: DadosPedidoImportado): DadosPedidoImportado {
  return {
    ...dados,
    uf: dados.uf.toUpperCase(),
    cep: /^\d{8}$/.test(dados.cep) ? `${dados.cep.slice(0, 5)}-${dados.cep.slice(5)}` : dados.cep,
  };
}

export async function alterarStatus(id: number, dados: AlterarStatusInput): Promise<Entrega> {
  return withTransaction(async (db) => {
    const atual = await repo.buscarPorId(db, id, true);
    if (!atual) throw naoEncontrada(id);

    const novoStatus = exigirStatusValido(dados.status_entrega);
    if (!TRANSICOES[atual.status_entrega].includes(novoStatus)) {
      throw erros.transicaoInvalida(atual.status_entrega, novoStatus);
    }
    lancarSeHouver(validarAlteracaoStatus(dados, novoStatus));

    const entrega = await repo.atualizarStatus(db, id, novoStatus, dados.data_entrega ?? null);
    await repo.inserirHistorico(db, id, novoStatus, dados.observacao ?? null);
    return entrega;
  });
}

export async function historico(id: number): Promise<HistoricoItem[]> {
  if (!(await repo.buscarPorId(pool, id))) throw naoEncontrada(id);
  return repo.listarHistorico(pool, id);
}

export async function excluir(id: number): Promise<void> {
  await withTransaction(async (db) => {
    const atual = await repo.buscarPorId(db, id, true);
    if (!atual) throw naoEncontrada(id);
    if (atual.status_entrega !== 'AGUARDANDO_COLETA') {
      throw erros.operacaoNaoPermitida(
        `Só é possível excluir entrega com status AGUARDANDO_COLETA (atual: ${atual.status_entrega}); use PATCH com CANCELADA.`,
      );
    }
    await repo.excluir(db, id);
  });
}
