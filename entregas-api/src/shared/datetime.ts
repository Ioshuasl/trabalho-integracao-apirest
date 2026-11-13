// Fuso de referência do contrato: America/Sao_Paulo (UTC-03:00, sem horário de verão).
const FUSO = 'America/Sao_Paulo';
const OFFSET = '-03:00';

const formatadorData = new Intl.DateTimeFormat('sv-SE', { timeZone: FUSO });
const formatadorDataHora = new Intl.DateTimeFormat('sv-SE', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** Data atual no fuso do contrato, formato AAAA-MM-DD. */
export function hoje(): string {
  return formatadorData.format(new Date());
}

/** Ano atual no fuso do contrato. */
export function anoAtual(): number {
  return Number(hoje().slice(0, 4));
}

/** ISO 8601 com fuso, ex.: 2026-11-04T20:40:00-03:00. */
export function formatarDataHora(data: Date): string {
  return `${formatadorDataHora.format(data).replace(' ', 'T')}${OFFSET}`;
}

/**
 * ISO 8601 com fuso e milissegundos, ex.: 2026-11-04T20:40:00.123-03:00.
 * Usado em data_criacao e data_atualizacao: o consumidor (G2) compara data_atualizacao com a leitura
 * anterior, então a precisão de segundos deixaria passar duas alterações no mesmo segundo.
 */
export function formatarDataHoraMs(data: Date): string {
  const base = formatarDataHora(data).slice(0, -OFFSET.length);
  return `${base}.${String(data.getUTCMilliseconds()).padStart(3, '0')}${OFFSET}`;
}

/** Verifica formato AAAA-MM-DD e se a data existe no calendário. */
export function dataValida(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split('-').map(Number) as [number, number, number];
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia;
}
