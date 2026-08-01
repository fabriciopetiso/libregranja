/**
 * Consultas sobre los movimientos. Las pantallas de §6 son esto.
 *
 * Cada fila de cada tabla llega con los ids de los movimientos que la componen,
 * no sólo con el número. Es lo que sostiene la regla de §6.6: cualquier número se
 * toca y se llega a los registros que lo forman. Un agregado que no puede
 * devolver sus componentes está mal construido.
 */

import { porcentaje } from './dinero.js'
import type { EstadoTanda, Fecha, Movimiento } from './tipos.js'

export interface Rango {
  readonly desde: Fecha
  readonly hasta: Fecha
}

export interface FilaAgrupada {
  readonly refId: string
  readonly centavos: bigint
  readonly participacion: number | null
  readonly movimientoIds: readonly string[]
}

export interface TablaAgrupada {
  readonly filas: readonly FilaAgrupada[]
  readonly total: bigint
}

export function enRango(mov: Movimiento, rango?: Rango): boolean {
  if (rango === undefined) return true
  return mov.fecha >= rango.desde && mov.fecha <= rango.hasta
}

function vigentes(movimientos: readonly Movimiento[], rango?: Rango): Movimiento[] {
  return movimientos.filter((m) => !m.eliminado && enRango(m, rango))
}

function agrupar(movimientos: readonly Movimiento[]): TablaAgrupada {
  const acumulado = new Map<string, { centavos: bigint; ids: string[] }>()
  let total = 0n

  for (const mov of movimientos) {
    const clave = mov.refId ?? ''
    const importe = mov.importe ?? 0n
    let entrada = acumulado.get(clave)
    if (entrada === undefined) {
      entrada = { centavos: 0n, ids: [] }
      acumulado.set(clave, entrada)
    }
    entrada.centavos += importe
    entrada.ids.push(mov.id)
    total += importe
  }

  const filas = [...acumulado.entries()]
    .map(([refId, { centavos, ids }]) => ({
      refId,
      centavos,
      participacion: porcentaje(centavos, total),
      movimientoIds: ids,
    }))
    .sort((a, b) => (b.centavos > a.centavos ? 1 : b.centavos < a.centavos ? -1 : 0))

  return { filas, total }
}

/**
 * Gastos por rubro (§6.3). Agrupa los movimientos de tipo `gasto` por su rubro.
 *
 * Con `tandaId` filtra a una sola tanda, que es la variante que pide §6.3.
 */
export function gastosPorRubro(
  movimientos: readonly Movimiento[],
  rango?: Rango,
  tandaId?: string,
): TablaAgrupada {
  return agrupar(
    vigentes(movimientos, rango).filter(
      (m) => m.tipo === 'gasto' && (tandaId === undefined || m.tandaId === tandaId),
    ),
  )
}

export interface FilaVenta extends FilaAgrupada {
  readonly cantidad: bigint
  /** Precio promedio del período, en centavos por unidad. Derivado, no almacenado. */
  readonly precioPromedio: number | null
}

/** Ventas por producto (§6.4). */
export function ventasPorProducto(movimientos: readonly Movimiento[], rango?: Rango): {
  filas: readonly FilaVenta[]
  total: bigint
} {
  const ventas = vigentes(movimientos, rango).filter((m) => m.tipo === 'venta')
  const base = agrupar(ventas)

  const cantidades = new Map<string, bigint>()
  for (const mov of ventas) {
    const clave = mov.refId ?? ''
    cantidades.set(clave, (cantidades.get(clave) ?? 0n) + mov.cantidad)
  }

  const filas = base.filas.map((fila) => {
    const cantidad = cantidades.get(fila.refId) ?? 0n
    return {
      ...fila,
      cantidad,
      precioPromedio: cantidad === 0n ? null : Number(fila.centavos) / Number(cantidad),
    }
  })

  return { filas, total: base.total }
}

/** Deuda por contraparte: ventas − cobros (§4). Sólo las que deben algo. */
export function deudaPorContraparte(movimientos: readonly Movimiento[]): {
  porContraparte: ReadonlyMap<string, bigint>
  total: bigint
} {
  const porContraparte = new Map<string, bigint>()

  for (const mov of vigentes(movimientos)) {
    if (mov.contraparteId === undefined) continue
    const signo = mov.tipo === 'venta' ? 1n : mov.tipo === 'cobro' ? -1n : 0n
    if (signo === 0n) continue
    porContraparte.set(mov.contraparteId, (porContraparte.get(mov.contraparteId) ?? 0n) + signo * (mov.importe ?? 0n))
  }

  let total = 0n
  for (const [id, saldo] of porContraparte) {
    if (saldo === 0n) porContraparte.delete(id)
    else total += saldo
  }

  return { porContraparte, total }
}

/** Resultado del período (§6.5): ventas, gastos y la diferencia. Sin interpretación. */
export function resultadoDelPeriodo(movimientos: readonly Movimiento[], rango?: Rango): {
  ventas: bigint
  gastos: bigint
  diferencia: bigint
} {
  let ventas = 0n
  let gastos = 0n

  for (const mov of vigentes(movimientos, rango)) {
    const importe = mov.importe ?? 0n
    if (mov.tipo === 'venta') ventas += importe
    else if (mov.tipo === 'gasto' || mov.tipo === 'compra') gastos += importe
  }

  return { ventas, gastos, diferencia: ventas - gastos }
}

/**
 * Rendimiento de una incubación (§7).
 *
 * `sobreFertiles` es null cuando no se registraron fértiles: sin el dato, no se
 * estima (§10).
 */
export function rendimientoIncubacion(tanda: EstadoTanda): {
  sobreCargados: number | null
  sobreFertiles: number | null
} {
  return {
    sobreCargados: porcentaje(tanda.nacidos, tanda.huevosCargados),
    sobreFertiles: tanda.registrosFertiles === 0 ? null : porcentaje(tanda.nacidos, tanda.huevosFertiles),
  }
}
