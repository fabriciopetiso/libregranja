/**
 * Consultas sobre los movimientos. Las pantallas de §6 son esto.
 *
 * Cada fila de cada tabla llega con los ids de los movimientos que la componen,
 * no sólo con el número. Es lo que sostiene la regla de §6.6: cualquier número se
 * toca y se llega a los registros que lo forman. Un agregado que no puede
 * devolver sus componentes está mal construido.
 */

import { porcentaje } from './dinero.js'
import type { Balance, Estado, EstadoTanda, Fecha, Jerarquia, Movimiento } from './tipos.js'

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
 * Balance de cada nivel: animal, tanda y lugar.
 *
 * Un gasto se imputa en un solo nivel —el más preciso que se conozca— y desde
 * ahí sube: los medicamentos de Rambo cuentan en Rambo, en su tanda, en el
 * gallinero y en la granja. Como nunca cae en dos niveles a la vez, sumar los
 * totales de los hijos no puede contar dos veces lo mismo.
 *
 * El recorrido es de abajo hacia arriba: primero los animales suman a su tanda,
 * después las tandas a su lugar, y al final cada lugar sube por la cadena de
 * padres.
 */
export function balancePorNivel(estado: Estado, jerarquia: Jerarquia): Map<string, Balance> {
  const propio = new Map<string, { eg: bigint; in: bigint; ids: string[] }>()

  const anotar = (nivel: string, eg: bigint, ingreso: bigint, ids: readonly string[]): void => {
    const actual = propio.get(nivel) ?? { eg: 0n, in: 0n, ids: [] }
    actual.eg += eg
    actual.in += ingreso
    actual.ids.push(...ids)
    propio.set(nivel, actual)
  }

  for (const [id, costo] of estado.costosDeAnimales) anotar(id, costo.costoCentavos, 0n, costo.movimientoIds)
  for (const [id, tanda] of estado.tandas) anotar(id, tanda.costoCentavos, 0n, [])
  for (const [id, unidad] of estado.unidades) anotar(id, unidad.costoCentavos, 0n, unidad.movimientoIds)
  for (const [id, ingreso] of estado.ingresosPorNivel) anotar(id, 0n, ingreso.centavos, ingreso.movimientoIds)

  // El total arranca en lo propio y va recibiendo lo de abajo.
  const total = new Map<string, { eg: bigint; in: bigint }>()
  for (const [id, p] of propio) total.set(id, { eg: p.eg, in: p.in })

  const sumarA = (nivel: string, eg: bigint, ingreso: bigint): void => {
    const actual = total.get(nivel) ?? { eg: 0n, in: 0n }
    actual.eg += eg
    actual.in += ingreso
    total.set(nivel, actual)
  }

  // Los animales suben a su tanda.
  for (const [animalId, tandaId] of jerarquia.animalEnTanda) {
    const p = propio.get(animalId)
    if (p !== undefined) sumarA(tandaId, p.eg, p.in)
  }

  // Las tandas suben a su lugar, ya con lo de sus animales adentro.
  for (const [tandaId, lugarId] of jerarquia.tandaEnLugar) {
    const t = total.get(tandaId)
    if (t !== undefined) sumarA(lugarId, t.eg, t.in)
  }

  /**
   * Cada lugar sube por su cadena de padres.
   *
   * `vistos` corta si la jerarquía quedó circular —A dentro de B y B dentro de
   * A—, cosa que no debería pasar pero que un dato mal cargado puede provocar.
   * Colgar la app por eso sería peor que mostrar un total incompleto.
   */
  const lugares = new Set<string>([...jerarquia.lugarPadre.keys(), ...jerarquia.tandaEnLugar.values()])
  for (const lugarId of lugares) {
    const suyo = total.get(lugarId)
    if (suyo === undefined) continue

    const vistos = new Set<string>([lugarId])
    let padre = jerarquia.lugarPadre.get(lugarId)

    while (padre !== undefined && !vistos.has(padre)) {
      vistos.add(padre)
      sumarA(padre, suyo.eg, suyo.in)
      padre = jerarquia.lugarPadre.get(padre)
    }
  }

  const balances = new Map<string, Balance>()
  for (const id of new Set([...propio.keys(), ...total.keys()])) {
    const p = propio.get(id) ?? { eg: 0n, in: 0n, ids: [] }
    const t = total.get(id) ?? { eg: 0n, in: 0n }
    balances.set(id, {
      propioEgresos: p.eg,
      propioIngresos: p.in,
      totalEgresos: t.eg,
      totalIngresos: t.in,
      resultado: t.in - t.eg,
      movimientoIds: p.ids,
    })
  }

  return balances
}

/**
 * Cómo salió una incubación.
 *
 * El ciclo real de una gallina tiene tres momentos, y cada uno explica una
 * pérdida distinta:
 *
 *   día 0   se cargan los huevos
 *   día 18  ovoscopía: se miran a trasluz y se descartan los que no tienen
 *           embrión o lo tienen muerto. Los que siguen pasan a la nacedora
 *   día 21  nacen
 *
 * Separar el descarte de los que no nacieron importa: descartar mucho en la
 * ovoscopía habla de los reproductores o de cómo se guardaron los huevos;
 * perder muchos en la nacedora habla de la máquina. Un solo porcentaje de
 * nacimiento mezcla las dos cosas y no deja arreglar ninguna.
 */
export function rendimientoIncubacion(tanda: EstadoTanda): {
  cargados: bigint
  descartados: bigint
  aNacedora: bigint
  nacidos: bigint
  noNacieron: bigint
  /** Nacidos sobre todo lo que entró. Es el número del negocio. */
  sobreCargados: number | null
  /** Nacidos sobre los que llegaron a la nacedora. Habla de la máquina. */
  sobreNacedora: number | null
  /** Nacidos sobre los fértiles, si se contaron. Sin el dato, no se estima. */
  sobreFertiles: number | null
  /** Qué parte se fue en la ovoscopía. */
  descartePorcentaje: number | null
} {
  const aNacedora = tanda.huevosCargados - tanda.huevosDescartados
  const noNacieron = aNacedora - tanda.nacidos

  return {
    cargados: tanda.huevosCargados,
    descartados: tanda.huevosDescartados,
    aNacedora,
    nacidos: tanda.nacidos,
    noNacieron: noNacieron < 0n ? 0n : noNacieron,
    sobreCargados: porcentaje(tanda.nacidos, tanda.huevosCargados),
    sobreNacedora: aNacedora <= 0n ? null : porcentaje(tanda.nacidos, aNacedora),
    sobreFertiles: tanda.registrosFertiles === 0 ? null : porcentaje(tanda.nacidos, tanda.huevosFertiles),
    descartePorcentaje: porcentaje(tanda.huevosDescartados, tanda.huevosCargados),
  }
}

/**
 * En qué momento del ciclo está una incubación, contando desde la carga.
 *
 * Las fechas se derivan de cuándo empezó: no hay nada que mantener al día ni
 * recordatorio que configurar. Los 18 y 21 días son los de la gallina; para
 * otras especies el número cambia, y por eso se muestran como referencia y no
 * como una regla que bloquee nada.
 */
export function etapaIncubacion(
  fechaInicio: Fecha,
  hoy: Fecha,
): { dia: number; etapa: 'incubando' | 'ovoscopia' | 'nacedora' | 'terminada'; faltan: number } {
  const dia = Math.floor((new Date(hoy).getTime() - new Date(fechaInicio).getTime()) / 86_400_000)

  if (dia < 17) return { dia, etapa: 'incubando', faltan: 18 - dia }
  if (dia < 19) return { dia, etapa: 'ovoscopia', faltan: 0 }
  if (dia < 22) return { dia, etapa: 'nacedora', faltan: Math.max(0, 21 - dia) }
  return { dia, etapa: 'terminada', faltan: 0 }
}
