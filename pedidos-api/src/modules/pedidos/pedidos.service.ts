import { pool, withTransaction, type Queryable } from '../../shared/database/pool';
import { erros, type DetalheErro } from '../../shared/http/errors';
import { pagina } from '../../shared/http/parametros';
import { clienteAtivoExiste } from '../clientes';
import type { AlterarStatusInput, AtualizarPedidoInput, CriarPedidoInput } from './pedidos.schemas';
import * as repo from './pedidos.repository';
import type { FiltrosPedidos, Pedido } from './pedidos.types';
import { calcularTotal, exigirStatusValido, lancarSeHouver, validarEndereco, validarItens } from './pedidos.validation';
import { TRANSICOES } from './status';

/* Ordem de verificação (mesma dos demais contratos): 404 -> 409 -> 422. O 400 já foi tratado antes. */

const naoEncontrado = (id: number) => erros.naoEncontrado(`Pedido ${id} não encontrado.`);

async function obterCompleto(db: Queryable, id: number): Promise<Pedido> {
  const resumo = await repo.buscarResumo(db, id);
  if (!resumo) throw naoEncontrado(id);
  return { ...resumo, itens: await repo.listarItens(db, id) };
}

export async function listar(filtros: FiltrosPedidos) {
  const { pedidos, total } = await repo.listar(pool, filtros);
  return pagina(pedidos, total, filtros.pagina, filtros.tamanho);
}

export async function obter(id: number): Promise<Pedido> {
  return obterCompleto(pool, id);
}

export async function criar(dados: CriarPedidoInput): Promise<Pedido> {
  return withTransaction(async (db) => {
    const detalhes: DetalheErro[] = [...validarEndereco(dados), ...validarItens(dados.itens)];
    if (dados.codigo_cliente <= 0) {
      detalhes.push({ campo: 'codigo_cliente', problema: 'deve ser maior que zero' });
    } else if (!(await clienteAtivoExiste(db, dados.codigo_cliente))) {
      detalhes.push({ campo: 'codigo_cliente', problema: 'cliente inexistente ou inativo' });
    }
    lancarSeHouver(detalhes);

    const id = await repo.inserir(db, dados.codigo_cliente, dados, calcularTotal(dados.itens));
    await repo.inserirItens(db, id, dados.itens);
    return obterCompleto(db, id);
  });
}

export async function atualizar(id: number, dados: AtualizarPedidoInput): Promise<Pedido> {
  return withTransaction(async (db) => {
    const atual = await repo.bloquear(db, id);
    if (!atual) throw naoEncontrado(id);
    if (atual.status === 'CANCELADO') {
      throw erros.operacaoNaoPermitida('Pedido CANCELADO não pode ser alterado.');
    }
    if (dados.itens !== undefined && atual.status !== 'ABERTO') {
      throw erros.operacaoNaoPermitida('Os itens só podem ser alterados com o pedido ABERTO.');
    }

    const detalhes: DetalheErro[] = validarEndereco(dados);
    if (dados.itens !== undefined) detalhes.push(...validarItens(dados.itens));
    if (dados.codigo_cliente !== undefined && dados.codigo_cliente !== atual.cliente_id) {
      detalhes.push({ campo: 'codigo_cliente', problema: 'não pode ser alterado' });
    }
    lancarSeHouver(detalhes);

    await repo.atualizarEndereco(db, id, dados, dados.itens ? calcularTotal(dados.itens) : null);
    if (dados.itens) await repo.substituirItens(db, id, dados.itens);
    return obterCompleto(db, id);
  });
}

export async function alterarStatus(id: number, dados: AlterarStatusInput): Promise<Pedido> {
  return withTransaction(async (db) => {
    const atual = await repo.bloquear(db, id);
    if (!atual) throw naoEncontrado(id);

    const novo = exigirStatusValido(dados.status_pedido);
    if (!TRANSICOES[atual.status].includes(novo)) throw erros.transicaoInvalida(atual.status, novo);

    await repo.atualizarStatus(db, id, novo);
    return obterCompleto(db, id);
  });
}

/** Pedido nunca sai da view de integração: só pedidos ABERTO (ainda não visíveis ao G7) podem ser excluídos. */
export async function excluir(id: number): Promise<void> {
  await withTransaction(async (db) => {
    const atual = await repo.bloquear(db, id);
    if (!atual) throw naoEncontrado(id);
    if (atual.status !== 'ABERTO') {
      throw erros.operacaoNaoPermitida(
        `Só é possível excluir pedido ABERTO (atual: ${atual.status}); use PATCH com CANCELADO.`,
      );
    }
    await repo.excluir(db, id);
  });
}

export async function listarIntegracao(paginaAtual: number, tamanho: number) {
  const { pedidos, total } = await repo.listarIntegracao(pool, paginaAtual, tamanho);
  return pagina(pedidos, total, paginaAtual, tamanho);
}
