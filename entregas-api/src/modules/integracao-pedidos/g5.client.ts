import { randomUUID } from 'node:crypto';
import { setTimeout as esperar } from 'node:timers/promises';
import { validarPedidoG5, type PedidoG5, type ProblemaPedido } from './g5.schemas';

export type TipoOcorrencia =
  | 'SUCESSO'
  | 'ERRO_HTTP'
  | 'TIMEOUT'
  | 'INDISPONIVEL'
  | 'VIOLACAO_CONTRATO'
  | 'REGISTRO_DUPLICADO'
  | 'CONFLITO'
  | 'REGRA_NEGOCIO'
  | 'IGNORADO'
  | 'RECONCILIACAO';

export interface ConfigG5 {
  baseUrl: string;
  apiKey: string;
  timeoutMs: number;
  /** Espera antes de cada nova tentativa; o tamanho da lista é o máximo de repetições. */
  retryDelaysMs: number[];
}

export interface RegistroIntegracao {
  importacaoId: string | null;
  requestId: string;
  metodo: string;
  endpoint: string;
  statusHttp: number | null;
  tipo: TipoOcorrencia;
  erroCodigo: string | null;
  descricao: string;
  acaoTomada: string;
  tentativa: number;
  duracaoMs: number | null;
}

export type Registrador = (registro: RegistroIntegracao) => Promise<void>;

export interface ContextoChamada {
  importacaoId?: string;
}

export class G5Error extends Error {
  constructor(
    readonly tipo: TipoOcorrencia,
    mensagem: string,
    readonly statusHttp: number | null = null,
    readonly erroCodigo: string | null = null,
  ) {
    super(mensagem);
  }
}

export interface PedidoInvalido {
  codigo_pedido: number | null;
  problemas: ProblemaPedido[];
}

export interface ResultadoLeitura {
  validos: PedidoG5[];
  invalidos: PedidoInvalido[];
}

/** O que o módulo de importação precisa do G5 (permite trocar por um simulado nos testes). */
export interface ClienteG5 {
  lerPedidos(contexto?: ContextoChamada): Promise<ResultadoLeitura>;
}

const TAMANHO_PAGINA = 100;
const MAX_PAGINAS = 1000;

const ehTimeout = (err: unknown) => err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError');

function descreverFalhaDeRede(err: unknown): string {
  const causa = (err as { cause?: { code?: string; message?: string } } | null)?.cause;
  return causa?.code ?? causa?.message ?? (err instanceof Error ? err.message : 'erro desconhecido');
}

function extrairCodigoErro(texto: string): string | null {
  try {
    const codigo = (JSON.parse(texto) as { erro?: { codigo?: unknown } })?.erro?.codigo;
    return typeof codigo === 'string' ? codigo : null;
  } catch {
    return null;
  }
}

export class ClienteG5Http implements ClienteG5 {
  constructor(
    private readonly config: ConfigG5,
    private readonly registrar: Registrador,
  ) {}

  /** Lê todas as páginas de GET /integracao/pedidos e valida cada pedido contra o Contrato B. */
  async lerPedidos(contexto: ContextoChamada = {}): Promise<ResultadoLeitura> {
    const resultado: ResultadoLeitura = { validos: [], invalidos: [] };

    for (let pagina = 1; pagina <= MAX_PAGINAS; pagina++) {
      const endpoint = `/integracao/pedidos?pagina=${pagina}&tamanho=${TAMANHO_PAGINA}`;
      const { json, requestId } = await this.requisitar(endpoint, contexto);

      const corpo = json as { dados?: unknown; paginacao?: { total_paginas?: unknown } } | null;
      if (!corpo || !Array.isArray(corpo.dados) || typeof corpo.paginacao?.total_paginas !== 'number') {
        await this.violacao(contexto, requestId, endpoint, 'resposta sem "dados" (lista) e "paginacao.total_paginas"');
        throw new G5Error('VIOLACAO_CONTRATO', 'GET /integracao/pedidos fora do formato combinado', 200);
      }

      for (const item of corpo.dados) {
        const validacao = validarPedidoG5(item);
        if ('pedido' in validacao) {
          resultado.validos.push(validacao.pedido);
          continue;
        }
        const codigo = (item as { codigo_pedido?: unknown } | null)?.codigo_pedido;
        resultado.invalidos.push({
          codigo_pedido: typeof codigo === 'number' ? codigo : null,
          problemas: validacao.problemas,
        });
        await this.registrar({
          importacaoId: contexto.importacaoId ?? null,
          requestId,
          metodo: 'GET',
          endpoint,
          statusHttp: 200,
          tipo: 'VIOLACAO_CONTRATO',
          erroCodigo: validacao.problemas[0]?.tipo ?? null,
          descricao: `pedido ${String(codigo ?? '?')}: ${validacao.problemas.map((p) => `${p.campo} (${p.tipo}): ${p.descricao}`).join('; ')}`,
          acaoTomada: 'pedido rejeitado; demais pedidos seguem o processamento',
          tentativa: 1,
          duracaoMs: null,
        });
      }

      if (pagina >= corpo.paginacao.total_paginas) break;
    }
    return resultado;
  }

  private violacao(contexto: ContextoChamada, requestId: string, endpoint: string, descricao: string): Promise<void> {
    return this.registrar({
      importacaoId: contexto.importacaoId ?? null,
      requestId,
      metodo: 'GET',
      endpoint,
      statusHttp: 200,
      tipo: 'VIOLACAO_CONTRATO',
      erroCodigo: null,
      descricao,
      acaoTomada: 'resposta rejeitada',
      tentativa: 1,
      duracaoMs: null,
    });
  }

  /**
   * GET com timeout e novas tentativas: falha de rede, timeout e 503 repetem até `retryDelaysMs.length`
   * vezes; 500 e 502 repetem uma vez; demais erros HTTP não são repetidos.
   */
  private async requisitar(endpoint: string, contexto: ContextoChamada): Promise<{ json: unknown; requestId: string }> {
    const { baseUrl, apiKey, timeoutMs, retryDelaysMs } = this.config;
    const url = `${baseUrl.replace(/\/+$/, '')}${endpoint}`;
    const requestId = randomUUID();

    for (let tentativa = 1; ; tentativa++) {
      const inicio = Date.now();
      let status: number | null = null;
      let corpo = '';
      let falha: G5Error | null = null;
      let limiteRepeticoes = retryDelaysMs.length;

      try {
        const resposta = await fetch(url, {
          headers: { Accept: 'application/json', 'X-API-Key': apiKey, 'X-Request-Id': requestId },
          signal: AbortSignal.timeout(timeoutMs),
        });
        status = resposta.status;
        corpo = await resposta.text();
      } catch (err) {
        falha = ehTimeout(err)
          ? new G5Error('TIMEOUT', `sem resposta do G5 em ${timeoutMs} ms`)
          : new G5Error('INDISPONIVEL', `G5 inalcançável (${descreverFalhaDeRede(err)})`);
      }

      const duracaoMs = Date.now() - inicio;
      let json: unknown;

      if (!falha && status !== null) {
        const erroCodigo = extrairCodigoErro(corpo);
        if (status >= 200 && status < 300) {
          try {
            json = JSON.parse(corpo);
          } catch {
            falha = new G5Error('VIOLACAO_CONTRATO', 'o corpo da resposta não é JSON válido', status);
            limiteRepeticoes = 0;
          }
        } else if (status === 503) {
          falha = new G5Error('INDISPONIVEL', 'G5 respondeu 503 (indisponível)', status, erroCodigo);
        } else if (status === 500 || status === 502) {
          falha = new G5Error('ERRO_HTTP', `G5 respondeu ${status}`, status, erroCodigo);
          limiteRepeticoes = Math.min(1, retryDelaysMs.length);
        } else {
          falha = new G5Error('ERRO_HTTP', `G5 respondeu ${status}${erroCodigo ? ` ${erroCodigo}` : ''}`, status, erroCodigo);
          limiteRepeticoes = 0;
        }
      }

      const repetir = falha !== null && tentativa - 1 < limiteRepeticoes;
      const espera = retryDelaysMs[tentativa - 1] ?? retryDelaysMs[retryDelaysMs.length - 1] ?? 0;

      await this.registrar({
        importacaoId: contexto.importacaoId ?? null,
        requestId,
        metodo: 'GET',
        endpoint,
        statusHttp: status,
        tipo: falha ? falha.tipo : 'SUCESSO',
        erroCodigo: falha?.erroCodigo ?? null,
        descricao: falha ? falha.message : 'resposta recebida',
        acaoTomada: !falha ? 'dados processados' : repetir ? `nova tentativa em ${espera} ms` : 'desistiu após esgotar as tentativas',
        tentativa,
        duracaoMs,
      });

      if (!falha) return { json, requestId };
      if (!repetir) throw falha;
      await esperar(espera);
    }
  }
}
