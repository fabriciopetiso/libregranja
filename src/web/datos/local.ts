/**
 * La app, funcionando sola en el teléfono.
 *
 * Cumple el mismo contrato que el cliente del servidor, pero calculando acá:
 * lee los movimientos de IndexedDB, se los pasa al motor, y devuelve lo mismo
 * que devolvía la API. Las pantallas no se enteran de cuál de los dos está
 * andando.
 *
 * Eso es posible porque el motor nunca supo de bases de datos: recibe
 * movimientos y devuelve estado. El mismo código que corría en el servidor
 * corre en el navegador, con los mismos 63 tests respaldándolo.
 */

import { calcular } from '../../core/motor.js'
import { balancePorNivel, deudaPorContraparte, gastosPorRubro, rendimientoIncubacion, resultadoDelPeriodo, ventasPorProducto } from '../../core/reportes.js'
import type { Rango } from '../../core/reportes.js'
import type { Catalogo, Jerarquia, Movimiento } from '../../core/tipos.js'
import { nuevoId } from '../api.js'
import { CATALOGO, MOVIMIENTOS, guardar, guardarMeta, guardarVarias, leerMeta, leerTodo, leerUno } from './almacen.js'

/** Una fila del catálogo, con la tabla adentro para poder guardarlas todas juntas. */
export interface FilaCatalogo {
  id: string
  granjaId: string
  tabla: string
  nombre?: string
  eliminado: boolean
  creadoEn: string
  modificadoEn: string
  [clave: string]: unknown
}

/** El movimiento tal como se guarda: los importes van como string. */
export interface FilaMovimiento {
  id: string
  granjaId: string
  fecha: string
  creadoEn: string
  tipo: string
  cantidad: string
  importe?: string
  tandaId?: string
  unidadId?: string
  refId?: string
  contraparteId?: string
  tandaDestinoId?: string
  animalId?: string
  motivo?: string
  grupoId?: string
  eliminado: boolean
}

const ahora = (): string => new Date().toISOString()

/**
 * La granja que se está mirando.
 *
 * Sin servidor no hay sesión: la granja activa es un dato del teléfono.
 */
export async function granjaActiva(): Promise<string> {
  const guardada = await leerMeta<string>('granjaActiva')
  if (guardada !== null) return guardada

  const nueva = nuevoId()
  await guardarMeta('granjaActiva', nueva)
  return nueva
}

// --- catálogo ---------------------------------------------------------------

export async function listar(tabla: string, granjaId: string): Promise<FilaCatalogo[]> {
  const filas = await leerTodo<FilaCatalogo>(CATALOGO, granjaId)
  return filas
    .filter((f) => f.tabla === tabla && !f.eliminado)
    .sort((a, b) => (a.nombre ?? '').localeCompare(b.nombre ?? '', 'es'))
}

export async function crear(
  tabla: string,
  granjaId: string,
  datos: Record<string, unknown>,
): Promise<FilaCatalogo> {
  const momento = ahora()
  const fila: FilaCatalogo = {
    ...datos,
    // Un id vacío es ausencia de referencia, no una referencia a la cadena
    // vacía: mismo criterio que en el servidor.
    ...Object.fromEntries(
      Object.entries(datos).map(([k, v]) => [k, k.endsWith('Id') && v === '' ? null : v]),
    ),
    id: typeof datos['id'] === 'string' ? datos['id'] : nuevoId(),
    granjaId,
    tabla,
    eliminado: false,
    creadoEn: momento,
    modificadoEn: momento,
  }

  await guardar(CATALOGO, fila)
  return fila
}

export async function actualizar(id: string, datos: Record<string, unknown>): Promise<FilaCatalogo | null> {
  const actual = await leerUno<FilaCatalogo>(CATALOGO, id)
  if (actual === null) return null

  const limpio = Object.fromEntries(
    Object.entries(datos).map(([k, v]) => [k, k.endsWith('Id') && v === '' ? null : v]),
  )

  // Los campos de control no se pisan desde el formulario.
  const fila: FilaCatalogo = {
    ...actual,
    ...limpio,
    id: actual.id,
    granjaId: actual.granjaId,
    tabla: actual.tabla,
    creadoEn: actual.creadoEn,
    modificadoEn: ahora(),
  }

  await guardar(CATALOGO, fila)
  return fila
}

/** Nada se borra: se marca. Así el borrado también se puede sincronizar. */
export async function anular(id: string): Promise<void> {
  const actual = await leerUno<FilaCatalogo>(CATALOGO, id)
  if (actual === null) return
  await guardar(CATALOGO, { ...actual, eliminado: true, modificadoEn: ahora() })
}

// --- movimientos ------------------------------------------------------------

export async function leerMovimientos(granjaId: string): Promise<Movimiento[]> {
  const filas = await leerTodo<FilaMovimiento>(MOVIMIENTOS, granjaId)

  return filas
    .filter((f) => !f.eliminado)
    .sort((a, b) =>
      a.fecha !== b.fecha
        ? a.fecha < b.fecha
          ? -1
          : 1
        : a.creadoEn !== b.creadoEn
          ? a.creadoEn < b.creadoEn
            ? -1
            : 1
          : a.id < b.id
            ? -1
            : a.id > b.id
              ? 1
              : 0,
    )
    .map((f) => {
      const opcional = (clave: keyof FilaMovimiento): Record<string, string> => {
        const valor = f[clave]
        return typeof valor === 'string' && valor !== '' ? { [clave]: valor } : {}
      }

      return {
        id: f.id,
        granjaId: f.granjaId,
        fecha: f.fecha,
        creadoEn: f.creadoEn,
        tipo: f.tipo,
        cantidad: BigInt(f.cantidad),
        eliminado: false,
        ...(f.importe !== undefined && f.importe !== '' ? { importe: BigInt(f.importe) } : {}),
        ...opcional('tandaId'),
        ...opcional('unidadId'),
        ...opcional('refId'),
        ...opcional('contraparteId'),
        ...opcional('tandaDestinoId'),
        ...opcional('animalId'),
        ...opcional('motivo'),
      } satisfies Movimiento
    })
}

export async function crearMovimiento(
  granjaId: string,
  datos: Record<string, unknown>,
): Promise<FilaMovimiento> {
  const texto = (clave: string): Record<string, string> => {
    const valor = datos[clave]
    return typeof valor === 'string' && valor !== '' ? { [clave]: valor } : {}
  }

  const fila: FilaMovimiento = {
    id: typeof datos['id'] === 'string' ? datos['id'] : nuevoId(),
    granjaId,
    fecha: String(datos['fecha']),
    creadoEn: ahora(),
    tipo: String(datos['tipo']),
    cantidad: String(datos['cantidad'] ?? '0'),
    eliminado: false,
    ...(datos['importe'] !== undefined ? { importe: String(datos['importe']) } : {}),
    ...texto('tandaId'),
    ...texto('unidadId'),
    ...texto('refId'),
    ...texto('contraparteId'),
    ...texto('tandaDestinoId'),
    ...texto('animalId'),
    ...texto('motivo'),
    ...texto('grupoId'),
  }

  await guardar(MOVIMIENTOS, fila)
  return fila
}

export async function anularMovimiento(id: string, motivo?: string): Promise<void> {
  const actual = await leerUno<FilaMovimiento>(MOVIMIENTOS, id)
  if (actual === null) return
  await guardar(MOVIMIENTOS, {
    ...actual,
    eliminado: true,
    ...(motivo !== undefined ? { motivo } : {}),
  })
}

// --- lo que el motor necesita del catálogo ----------------------------------

async function catalogoDe(granjaId: string): Promise<Catalogo> {
  const [productos, unidades, tandas, animales] = await Promise.all([
    listar('producto', granjaId),
    listar('unidad', granjaId),
    listar('tanda', granjaId),
    listar('animal', granjaId),
  ])

  const jerarquia: Jerarquia = {
    lugarPadre: new Map(
      unidades
        .filter((u) => typeof u['unidadPadreId'] === 'string' && u['unidadPadreId'] !== '')
        .map((u) => [u.id, u['unidadPadreId'] as string]),
    ),
    tandaEnLugar: new Map(
      tandas
        .filter((t) => typeof t['unidadId'] === 'string' && t['unidadId'] !== '')
        .map((t) => [t.id, t['unidadId'] as string]),
    ),
    animalEnTanda: new Map(
      animales
        .filter((a) => typeof a['tandaId'] === 'string' && a['tandaId'] !== '')
        .map((a) => [a.id, a['tandaId'] as string]),
    ),
  }

  return {
    productos: new Map(
      productos.map((p) => [
        p.id,
        { id: p.id, descuenta: (p['descuenta'] === 'huevos' ? 'huevos' : 'animales') as 'animales' | 'huevos' },
      ]),
    ),
    jerarquia,
  }
}

/**
 * El estado de la granja, calculado acá.
 *
 * Es la misma forma que devolvía el servidor, para que las pantallas no cambien.
 */
export async function estado(granjaId: string): Promise<Record<string, unknown>> {
  const [movimientos, catalogo] = await Promise.all([leerMovimientos(granjaId), catalogoDe(granjaId)])
  const calculado = calcular(movimientos, catalogo)
  const jerarquia = catalogo.jerarquia ?? {
    lugarPadre: new Map(),
    tandaEnLugar: new Map(),
    animalEnTanda: new Map(),
  }
  const balances = balancePorNivel(calculado, jerarquia)

  const [unidades, tandas, tipos, insumos, especies] = await Promise.all([
    listar('unidad', granjaId),
    listar('tanda', granjaId),
    listar('categoria', granjaId),
    listar('insumo', granjaId),
    listar('especie', granjaId),
  ])

  const porId = new Map(tipos.map((t) => [t.id, t]))
  const nombreEspecie = new Map(especies.map((e) => [e.id, e.nombre ?? '']))
  const hoy = new Date()

  const animalesDe = (unidadId: string): { total: bigint; huevos: bigint; porEspecie: Record<string, string> } => {
    const porEspecie = new Map<string, bigint>()
    let total = 0n
    let huevos = 0n

    const recorrer = (id: string, visitados: Set<string>): void => {
      if (visitados.has(id)) return
      visitados.add(id)

      for (const t of tandas.filter((x) => x['unidadId'] === id)) {
        const suya = calculado.tandas.get(t.id)
        huevos += suya?.huevosDisponibles ?? 0n
        const cantidad = suya?.animales ?? 0n
        if (cantidad === 0n) continue
        total += cantidad
        const especie = typeof t['especieId'] === 'string' ? (nombreEspecie.get(t['especieId']) ?? 'Sin especie') : 'Sin especie'
        porEspecie.set(especie, (porEspecie.get(especie) ?? 0n) + cantidad)
      }

      for (const hija of unidades.filter((x) => x['unidadPadreId'] === id)) recorrer(hija.id, visitados)
    }

    recorrer(unidadId, new Set())
    return { total, huevos, porEspecie: Object.fromEntries([...porEspecie].map(([k, v]) => [k, v.toString()])) }
  }

  return {
    unidades: unidades.map((u) => {
      const b = balances.get(u.id)
      const conteo = animalesDe(u.id)
      return {
        ...u,
        unidadPadreId: u['unidadPadreId'] ?? null,
        tandas: tandas.filter((t) => t['unidadId'] === u.id).length,
        animales: conteo.total.toString(),
        huevos: conteo.huevos.toString(),
        animalesPorEspecie: conteo.porEspecie,
        costoPropio: (b?.propioEgresos ?? 0n).toString(),
        costoCentavos: (b?.totalEgresos ?? 0n).toString(),
        ingresos: (b?.totalIngresos ?? 0n).toString(),
        resultado: (b?.resultado ?? 0n).toString(),
        movimientoIds: b?.movimientoIds ?? [],
      }
    }),
    tandas: tandas.map((t) => {
      const c = calculado.tandas.get(t.id)
      const b = balances.get(t.id)
      const inicio = new Date(String(t['fechaInicio'] ?? t.creadoEn))
      const tipo = typeof t['categoriaId'] === 'string' ? porId.get(t['categoriaId']) : undefined

      return {
        ...t,
        unidadId: t['unidadId'] ?? null,
        especieId: t['especieId'] ?? null,
        razaId: t['razaId'] ?? null,
        categoria: tipo ?? null,
        animales: (c?.animales ?? 0n).toString(),
        costoCentavos: (b?.totalEgresos ?? c?.costoCentavos ?? 0n).toString(),
        ingresos: (b?.totalIngresos ?? 0n).toString(),
        resultado: (b?.resultado ?? 0n).toString(),
        huevosCargados: (c?.huevosCargados ?? 0n).toString(),
        huevosRecolectados: (c?.huevosRecolectados ?? 0n).toString(),
        huevos: (c?.huevosDisponibles ?? 0n).toString(),
        nacidos: (c?.nacidos ?? 0n).toString(),
        incubacion: c === undefined ? null : rendimientoIncubacion(c),
        cerrada: c !== undefined && c.animales === 0n,
        diasAbierta: Math.max(0, Math.floor((hoy.getTime() - inicio.getTime()) / 86_400_000)),
      }
    }),
    deposito: insumos.map((i) => {
      const d = calculado.depositos.get(i.id)
      const unidadesDep = d?.unidades ?? 0n
      const centavos = d?.centavos ?? 0n
      return {
        ...i,
        unidades: unidadesDep.toString(),
        centavos: centavos.toString(),
        costoUnitario: unidadesDep === 0n ? null : Number(centavos) / Number(unidadesDep),
        bajoMinimo: false,
      }
    }),
    general: {
      egresos: calculado.general.egresos.toString(),
      ingresos: calculado.general.ingresos.toString(),
      movimientoIds: calculado.general.movimientoIds,
    },
    totales: {
      animales: [...calculado.tandas.values()].reduce((s, t) => s + t.animales, 0n).toString(),
      huevos: [...calculado.tandas.values()].reduce((s, t) => s + t.huevosDisponibles, 0n).toString(),
    },
    avisos: calculado.avisos,
  }
}

export async function animales(granjaId: string): Promise<Record<string, unknown>[]> {
  const [movimientos, catalogo, lista, tandas, especies] = await Promise.all([
    leerMovimientos(granjaId),
    catalogoDe(granjaId),
    listar('animal', granjaId),
    listar('tanda', granjaId),
    listar('especie', granjaId),
  ])

  const calculado = calcular(movimientos, catalogo)
  const nombreTanda = new Map(tandas.map((t) => [t.id, t.nombre ?? '']))
  const nombreEspecie = new Map(especies.map((e) => [e.id, e.nombre ?? '']))

  return lista.map((a) => {
    const r = calculado.animales.get(a.id)
    return {
      ...a,
      tanda: typeof a['tandaId'] === 'string' ? (nombreTanda.get(a['tandaId']) ?? null) : null,
      especie: typeof a['especieId'] === 'string' ? (nombreEspecie.get(a['especieId']) ?? null) : null,
      nacidos: (r?.nacidos ?? 0n).toString(),
      partos: r?.partos ?? 0,
      ultimoParto: r?.ultimoParto ?? null,
      promedioPorParto:
        r === undefined || r.partos === 0 ? null : Math.round((Number(r.nacidos) / r.partos) * 100) / 100,
    }
  })
}

// --- reportes ---------------------------------------------------------------

export async function reporteRubros(granjaId: string, rango?: Rango): Promise<unknown> {
  const movimientos = await leerMovimientos(granjaId)
  const tabla = gastosPorRubro(movimientos, rango)
  return {
    filas: tabla.filas.map((f) => ({ ...f, centavos: f.centavos.toString() })),
    total: tabla.total.toString(),
  }
}

export async function reporteVentas(granjaId: string, rango?: Rango): Promise<unknown> {
  const movimientos = await leerMovimientos(granjaId)
  const v = ventasPorProducto(movimientos, rango)
  const { porContraparte, total } = deudaPorContraparte(movimientos)

  return {
    filas: v.filas.map((f) => ({ ...f, centavos: f.centavos.toString(), cantidad: f.cantidad.toString() })),
    total: v.total.toString(),
    deuda: {
      filas: [...porContraparte.entries()].map(([id, saldo]) => ({ contraparteId: id, saldo: saldo.toString() })),
      total: total.toString(),
    },
  }
}

export async function reporteResultado(granjaId: string, rango?: Rango): Promise<unknown> {
  const movimientos = await leerMovimientos(granjaId)
  const r = resultadoDelPeriodo(movimientos, rango)
  return {
    ventas: r.ventas.toString(),
    gastos: r.gastos.toString(),
    diferencia: r.diferencia.toString(),
  }
}

// --- sincronización ---------------------------------------------------------

/** Todo lo de esta granja, para pasárselo a otro teléfono. */
export async function exportar(granjaId: string): Promise<{
  granjaId: string
  movimientos: FilaMovimiento[]
  catalogo: FilaCatalogo[]
}> {
  const [movimientos, catalogo] = await Promise.all([
    leerTodo<FilaMovimiento>(MOVIMIENTOS, granjaId),
    leerTodo<FilaCatalogo>(CATALOGO, granjaId),
  ])
  return { granjaId, movimientos, catalogo }
}

/**
 * Recibe lo de otro teléfono y lo funde con lo propio.
 *
 * No hay conflictos que resolver: los movimientos se identifican por id y
 * nunca se editan, así que recibir uno que ya se tiene deja todo igual. Para
 * el catálogo, que sí se puede editar, gana el más recientemente modificado.
 */
export async function importar(datos: {
  movimientos: FilaMovimiento[]
  catalogo: FilaCatalogo[]
}): Promise<{ movimientos: number; catalogo: number }> {
  const nuevosMovimientos: FilaMovimiento[] = []
  for (const m of datos.movimientos) {
    const propio = await leerUno<FilaMovimiento>(MOVIMIENTOS, m.id)
    // Anular es la única forma de cambiar un movimiento: si alguno de los dos
    // lo anuló, queda anulado.
    if (propio === null) nuevosMovimientos.push(m)
    else if (m.eliminado && !propio.eliminado) nuevosMovimientos.push({ ...propio, eliminado: true })
  }

  const nuevoCatalogo: FilaCatalogo[] = []
  for (const c of datos.catalogo) {
    const propio = await leerUno<FilaCatalogo>(CATALOGO, c.id)
    if (propio === null || c.modificadoEn > propio.modificadoEn) nuevoCatalogo.push(c)
  }

  await guardarVarias(MOVIMIENTOS, nuevosMovimientos)
  await guardarVarias(CATALOGO, nuevoCatalogo)

  return { movimientos: nuevosMovimientos.length, catalogo: nuevoCatalogo.length }
}
