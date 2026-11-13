import { randomUUID } from 'node:crypto';
import { isDbIndisponivel, withTransaction } from '../../shared/database/pool';
import { AppError, erros } from '../../shared/http/errors';
import { logger } from '../../shared/logger';
import {
  atualizarEntregaDePedido,
  cancelarEntregaDePedido,
  registrarEntregaDePedido,
  type DadosPedidoImportado,
  type Entrega,
} from '../entregas';
import { G5Error, type ClienteG5, type Registrador, type TipoOcorrencia } from './g5.client';
import type { PedidoG5 } from './g5.schemas';
import * as repo from './integracao.repository';

type TipoErro = 'CAMPO_OBRIGATORIO' | 'TIPO_INVALIDO' | 'VALOR_INVALIDO' | 'REGISTRO_DUPLICADO' | 'REGRA_NEGOCIO';
type AcaoAtualizacao = 'ENTREGA_CANCELADA' | 'ENDERECO_ATUALIZADO' | 'DADOS_ATUALIZADOS';

export interface ResumoImportacao {
  importacao_id: string;
  consultados: number;
  inseridos: { codigo_pedido: number; id_entrega: number; codigo_rastreio: string; pendencias: string[] }[];
  atualizados: { codigo_pedido: number; acao: AcaoAtualizacao }[];
  sem_alteracao: number[];
  ignorados: { codigo_pedido: number; motivo: string }[];
  rejeitados: { codigo_pedido: number | null; tipo_erro: TipoErro; campo?: string; motivo: string }[];
}

type Resultado =
  | { tipo: 'INSERIDO'; entrega: Entrega }
  | { tipo: 'ATUALIZADO'; acao: AcaoAtualizacao }
  | { tipo: 'SEM_ALTERACAO' }
  | { tipo: 'IGNORADO'; motivo: string }
  | { tipo: 'REJEITADO'; ocorrencia: TipoOcorrencia; erro: TipoErro; motivo: string };

const rejeitar = (ocorrencia: TipoOcorrencia, erro: TipoErro, motivo: string): Resultado => ({
  tipo: 'REJEITADO',
  ocorrencia,
  erro,
  motivo,
});

/** Converte falha do G5 (já registrada em integracao_logs) na resposta da nossa API. */
function paraAppError(err: G5Error): AppError {
  switch (err.tipo) {
    case 'TIMEOUT':
    case 'INDISPONIVEL':
      return erros.integracaoIndisponivel(`API de Pedidos (G5) indisponível: ${err.message}`);
    case 'VIOLACAO_CONTRATO':
      return erros.integracaoContratoInvalido(`API de Pedidos (G5) fora do contrato: ${err.message}`);
    default:
      return err.statusHttp === 401 || err.statusHttp === 403
        ? erros.integracaoAutenticacao('API de Pedidos (G5) recusou a chave de API (verifique G5_API_KEY).')
        : erros.integracaoErro(`API de Pedidos (G5) respondeu com erro: ${err.message}`);
  }
}

const dadosDaEntrega = (p: PedidoG5): DadosPedidoImportado => ({
  codigo_pedido: p.codigo_pedido,
  codigo_cliente: p.codigo_cliente,
  nome_destinatario: p.nome_cliente,
  logradouro: p.endereco_entrega,
  cidade: p.cidade_entrega,
  uf: p.uf_entrega,
  cep: p.cep_entrega,
});

export class ImportacaoPedidosService {
  constructor(
    private readonly g5: ClienteG5,
    private readonly registrar: Registrador,
  ) {}

  /**
   * Regras do Contrato B: CONFIRMADO novo cria a entrega; data_atualizacao mais recente atualiza;
   * CANCELADO cancela a entrega; CANCELADO que nunca chegou confirmado é ignorado; duplicado é rejeitado.
   * Um pedido com problema nunca interrompe os demais, e pedido rejeitado volta a ser lido na próxima execução.
   */
  async importar(): Promise<ResumoImportacao> {
    const importacaoId = randomUUID();

    let leitura;
    try {
      leitura = await this.g5.lerPedidos({ importacaoId });
    } catch (err) {
      if (err instanceof G5Error) throw paraAppError(err);
      throw err;
    }

    const resumo: ResumoImportacao = {
      importacao_id: importacaoId,
      consultados: leitura.validos.length + leitura.invalidos.length,
      inseridos: [],
      atualizados: [],
      sem_alteracao: [],
      ignorados: [],
      rejeitados: leitura.invalidos.flatMap((inv) =>
        inv.problemas.map((p) => ({
          codigo_pedido: inv.codigo_pedido,
          tipo_erro: p.tipo,
          campo: p.campo,
          motivo: p.descricao,
        })),
      ),
    };

    // O mesmo codigo_pedido mais de uma vez na leitura: não dá para saber qual é o certo, rejeita todos.
    const contagem = new Map<number, number>();
    for (const p of leitura.validos) contagem.set(p.codigo_pedido, (contagem.get(p.codigo_pedido) ?? 0) + 1);
    const duplicados = new Set([...contagem].filter(([, n]) => n > 1).map(([codigo]) => codigo));
    for (const codigo of duplicados) {
      const motivo = `codigo_pedido ${codigo} apareceu ${contagem.get(codigo)} vezes na leitura; avisar o Grupo 5`;
      resumo.rejeitados.push({ codigo_pedido: codigo, tipo_erro: 'REGISTRO_DUPLICADO', motivo });
      await this.ocorrencia(resumo, codigo, 'REGISTRO_DUPLICADO', motivo, 'pedido rejeitado até o G5 corrigir');
    }

    for (const pedido of leitura.validos) {
      if (duplicados.has(pedido.codigo_pedido)) continue;
      await this.processar(pedido, resumo);
    }

    logger.info(
      {
        importacao_id: importacaoId,
        consultados: resumo.consultados,
        inseridos: resumo.inseridos.length,
        atualizados: resumo.atualizados.length,
        sem_alteracao: resumo.sem_alteracao.length,
        ignorados: resumo.ignorados.length,
        rejeitados: resumo.rejeitados.length,
      },
      'importação de pedidos concluída',
    );
    return resumo;
  }

  private async processar(p: PedidoG5, resumo: ResumoImportacao): Promise<void> {
    let resultado: Resultado;
    try {
      resultado = await withTransaction((db) => this.decidir(db, p, resumo.importacao_id));
    } catch (err) {
      if (!(err instanceof AppError) || isDbIndisponivel(err)) throw err;
      const detalhes = err.detalhes.map((d) => `${d.campo}: ${d.problema}`).join('; ');
      resultado =
        err.status === 409
          ? rejeitar('CONFLITO', 'REGRA_NEGOCIO', err.message)
          : rejeitar('VIOLACAO_CONTRATO', 'VALOR_INVALIDO', `${err.message} ${detalhes}`.trim());
    }

    const codigo = p.codigo_pedido;
    switch (resultado.tipo) {
      case 'INSERIDO':
        resumo.inseridos.push({
          codigo_pedido: codigo,
          id_entrega: resultado.entrega.id_entrega,
          codigo_rastreio: resultado.entrega.codigo_rastreio,
          pendencias: resultado.entrega.pendencias,
        });
        break;
      case 'ATUALIZADO':
        resumo.atualizados.push({ codigo_pedido: codigo, acao: resultado.acao });
        break;
      case 'SEM_ALTERACAO':
        resumo.sem_alteracao.push(codigo);
        break;
      case 'IGNORADO':
        resumo.ignorados.push({ codigo_pedido: codigo, motivo: resultado.motivo });
        await this.ocorrencia(resumo, codigo, 'IGNORADO', resultado.motivo, 'pedido ignorado, sem erro');
        break;
      case 'REJEITADO':
        resumo.rejeitados.push({ codigo_pedido: codigo, tipo_erro: resultado.erro, motivo: resultado.motivo });
        await this.ocorrencia(resumo, codigo, resultado.ocorrencia, resultado.motivo, 'pedido rejeitado; será lido de novo na próxima execução');
        break;
    }
  }

  private async decidir(db: Parameters<Parameters<typeof withTransaction>[0]>[0], p: PedidoG5, importacaoId: string): Promise<Resultado> {
    const existente = await repo.buscarImportado(db, p.codigo_pedido);

    if (!existente) {
      if (p.status_pedido === 'CANCELADO') {
        return { tipo: 'IGNORADO', motivo: 'pedido CANCELADO que nunca foi recebido como CONFIRMADO' };
      }
      if (!(await repo.inserirImportado(db, p, importacaoId))) return { tipo: 'SEM_ALTERACAO' }; // outra importação foi mais rápida
      const entrega = await registrarEntregaDePedido(db, dadosDaEntrega(p));
      await repo.vincularEntrega(db, p.codigo_pedido, entrega.id_entrega);
      return { tipo: 'INSERIDO', entrega };
    }

    const novo = p.data_atualizacao.getTime();
    const gravado = existente.origem_atualizado_em.getTime();
    if (novo === gravado) return { tipo: 'SEM_ALTERACAO' };
    if (novo < gravado) {
      return rejeitar('REGRA_NEGOCIO', 'REGRA_NEGOCIO', 'data_atualizacao anterior à já integrada: o pedido não pode voltar no tempo');
    }

    if (existente.status_pedido === 'CANCELADO') {
      if (p.status_pedido === 'CONFIRMADO') {
        return rejeitar('REGRA_NEGOCIO', 'REGRA_NEGOCIO', 'pedido CANCELADO não pode voltar a CONFIRMADO');
      }
      await repo.atualizarImportado(db, p, importacaoId);
      return { tipo: 'ATUALIZADO', acao: 'DADOS_ATUALIZADOS' };
    }

    // existente CONFIRMADO
    if (p.status_pedido === 'CANCELADO') {
      const cancelamento = await cancelarEntregaDePedido(db, p.codigo_pedido);
      if (cancelamento === 'EM_ANDAMENTO') {
        return rejeitar('REGRA_NEGOCIO', 'REGRA_NEGOCIO', 'pedido cancelado no G5, mas a entrega já saiu para entrega: tratamento manual');
      }
      await repo.atualizarImportado(db, p, importacaoId);
      return { tipo: 'ATUALIZADO', acao: cancelamento === 'CANCELADA' ? 'ENTREGA_CANCELADA' : 'DADOS_ATUALIZADOS' };
    }

    const atualizacao = await atualizarEntregaDePedido(db, dadosDaEntrega(p));
    if (atualizacao === 'NAO_EDITAVEL') {
      return rejeitar('REGRA_NEGOCIO', 'REGRA_NEGOCIO', 'pedido alterado no G5, mas a entrega já está em andamento: tratamento manual');
    }
    await repo.atualizarImportado(db, p, importacaoId);
    return { tipo: 'ATUALIZADO', acao: atualizacao === 'ATUALIZADA' ? 'ENDERECO_ATUALIZADO' : 'DADOS_ATUALIZADOS' };
  }

  private ocorrencia(
    resumo: ResumoImportacao,
    codigoPedido: number,
    tipo: TipoOcorrencia,
    motivo: string,
    acaoTomada: string,
  ): Promise<void> {
    return this.registrar({
      importacaoId: resumo.importacao_id,
      requestId: randomUUID(),
      metodo: 'LOCAL',
      endpoint: `pedido ${codigoPedido}`,
      statusHttp: null,
      tipo,
      erroCodigo: null,
      descricao: motivo,
      acaoTomada,
      tentativa: 1,
      duracaoMs: null,
    });
  }
}
