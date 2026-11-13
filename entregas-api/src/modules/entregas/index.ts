// API pública do módulo: outros módulos só devem importar daqui.
export { entregasRouter } from './entregas.routes';
export {
  registrarDePedido as registrarEntregaDePedido,
  atualizarDePedido as atualizarEntregaDePedido,
  cancelarDePedido as cancelarEntregaDePedido,
} from './entregas.service';
export type {
  DadosPedidoImportado,
  Entrega,
  ResultadoAtualizacao,
  ResultadoCancelamento,
} from './entregas.types';
