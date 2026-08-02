/**
 * Acceso a datos. SQL a mano, sin ORM.
 *
 * Todas las tablas de configuración y operación comparten la misma forma
 * (id, granja_id, campos de control), así que el CRUD es uno solo parametrizado
 * por tabla en vez de siete copias.
 *
 * La capa no calcula nada: lee filas y las devuelve. El motor hace el resto.
 */

import { randomUUID } from 'node:crypto'

import type { Jerarquia, Movimiento } from '../core/tipos.js'
import type { Base } from './conexion.js'

/** Columnas que son verdadero/falso y no números. */
const BOOLEANAS = new Set([
  'eliminado',
  'es_cliente',
  'es_proveedor',
  'descuenta_animales',
  'animales_con_nombre',
  'registra_nacimientos',
  'registra_huevos',
  'registra_carga_incubacion',
  'registra_peso',
  'registra_alimento',
])

/**
 * Columnas donde el valor exacto importa y tiene que seguir siendo BigInt.
 * Son las de dinero y cantidad: convertirlas a `number` perdería centavos.
 */
const EXACTAS = new Set(['cantidad', 'importe'])

export const TABLAS = [
  'unidad',
  'especie',
  'raza',
  'plantilla',
  'categoria',
  'insumo',
  'producto',
  'rubro_gasto',
  'contraparte',
  'tanda',
  'animal',
] as const

export type Tabla = (typeof TABLAS)[number]

export function esTabla(valor: string): valor is Tabla {
  return (TABLAS as readonly string[]).includes(valor)
}

const aCamel = (s: string): string => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
const aSnake = (s: string): string => s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

/** Convierte una fila de SQLite a un objeto JS con los tipos correctos. */
function desdeFila(fila: Record<string, unknown>): Record<string, unknown> {
  const salida: Record<string, unknown> = {}

  for (const [columna, valor] of Object.entries(fila)) {
    const clave = aCamel(columna)

    if (valor === null) {
      salida[clave] = null
    } else if (BOOLEANAS.has(columna)) {
      salida[clave] = Number(valor) !== 0
    } else if (EXACTAS.has(columna)) {
      salida[clave] = valor // se queda BigInt
    } else if (typeof valor === 'bigint') {
      salida[clave] = Number(valor)
    } else {
      salida[clave] = valor
    }
  }

  return salida
}

/** Convierte un valor JS a algo que SQLite acepte como parámetro. */
function aParametro(valor: unknown): string | number | bigint | null | Buffer {
  if (valor === undefined || valor === null) return null
  if (typeof valor === 'boolean') return valor ? 1 : 0
  if (typeof valor === 'bigint' || typeof valor === 'number' || typeof valor === 'string') return valor
  return String(valor)
}

/**
 * Normaliza un valor antes de guardarlo.
 *
 * Un `_id` vacío es ausencia de referencia, no una referencia a la cadena vacía.
 * Los formularios mandan `""` cuando el usuario no eligió nada, y sin esto la
 * clave foránea rechaza la fila entera: "sin categoría" era imposible de guardar.
 */
function normalizar(columna: string, valor: unknown): unknown {
  if (columna.endsWith('_id') && valor === '') return null
  return valor
}

function ahora(): string {
  return new Date().toISOString()
}

/** Columnas reales de una tabla, para no confiar en lo que llegue del cliente. */
function columnasDe(base: Base, tabla: string): Set<string> {
  const filas = base.prepare(`PRAGMA table_info(${tabla})`).all() as Array<{ name: string }>
  return new Set(filas.map((f) => f.name))
}

export function listar(base: Base, tabla: Tabla, granjaId: string): Record<string, unknown>[] {
  const filas = base
    .prepare(`SELECT * FROM ${tabla} WHERE granja_id = ? AND eliminado = 0 ORDER BY nombre COLLATE NOCASE`)
    .all(granjaId) as Record<string, unknown>[]
  return filas.map(desdeFila)
}

export function obtener(base: Base, tabla: Tabla, id: string): Record<string, unknown> | null {
  const fila = base.prepare(`SELECT * FROM ${tabla} WHERE id = ?`).get(id) as Record<string, unknown> | undefined
  return fila === undefined ? null : desdeFila(fila)
}

export function crear(
  base: Base,
  tabla: Tabla,
  granjaId: string,
  datos: Record<string, unknown>,
): Record<string, unknown> {
  const validas = columnasDe(base, tabla)
  const momento = ahora()

  const fila: Record<string, unknown> = {
    id: typeof datos['id'] === 'string' ? datos['id'] : randomUUID(),
    granja_id: granjaId,
    creado_en: momento,
    modificado_en: momento,
    eliminado: 0,
  }

  for (const [clave, valor] of Object.entries(datos)) {
    const columna = aSnake(clave)
    // Los campos de control no se aceptan del cliente.
    if (['id', 'granja_id', 'creado_en', 'modificado_en', 'eliminado'].includes(columna)) continue
    if (validas.has(columna)) fila[columna] = normalizar(columna, valor)
  }

  const columnas = Object.keys(fila)
  base
    .prepare(
      `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map(() => '?').join(', ')})`,
    )
    .run(...columnas.map((c) => aParametro(fila[c])))

  return obtener(base, tabla, fila['id'] as string)!
}

export function actualizar(
  base: Base,
  tabla: Tabla,
  id: string,
  datos: Record<string, unknown>,
): Record<string, unknown> | null {
  const validas = columnasDe(base, tabla)
  const cambios: Record<string, unknown> = { modificado_en: ahora() }

  for (const [clave, valor] of Object.entries(datos)) {
    const columna = aSnake(clave)
    if (['id', 'granja_id', 'creado_en', 'modificado_en', 'eliminado'].includes(columna)) continue
    if (validas.has(columna)) cambios[columna] = normalizar(columna, valor)
  }

  const columnas = Object.keys(cambios)
  base
    .prepare(`UPDATE ${tabla} SET ${columnas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`)
    .run(...columnas.map((c) => aParametro(cambios[c])), id)

  return obtener(base, tabla, id)
}

/** Nada se borra físicamente (§3). */
export function anular(base: Base, tabla: Tabla, id: string): void {
  base.prepare(`UPDATE ${tabla} SET eliminado = 1, modificado_en = ? WHERE id = ?`).run(ahora(), id)
}

// --- Movimientos ------------------------------------------------------------

/**
 * Todos los movimientos vigentes de la granja, en el orden que espera el motor.
 *
 * Se leen enteros a propósito: el motor recalcula todo desde cero en cada
 * consulta (§4). Con el orden de magnitud de una granja —unos miles de filas por
 * año— esto son milisegundos, y a cambio no existe ningún saldo guardado que
 * pueda quedar desincronizado.
 */
export function leerMovimientos(base: Base, granjaId: string): Movimiento[] {
  const filas = base
    .prepare(
      `SELECT * FROM movimiento
       WHERE granja_id = ? AND eliminado = 0
       ORDER BY fecha, creado_en, id`,
    )
    .all(granjaId) as Record<string, unknown>[]

  return filas.map((fila) => {
    const m = desdeFila(fila)
    const opcional = (clave: string): Record<string, string> => {
      const valor = m[clave]
      return typeof valor === 'string' && valor !== '' ? { [clave]: valor } : {}
    }

    return {
      id: m['id'] as string,
      granjaId: m['granjaId'] as string,
      fecha: m['fecha'] as string,
      creadoEn: m['creadoEn'] as string,
      tipo: m['tipo'] as string,
      cantidad: (m['cantidad'] as bigint | null) ?? 0n,
      eliminado: false,
      ...(typeof m['importe'] === 'bigint' ? { importe: m['importe'] } : {}),
      ...opcional('tandaId'),
      ...opcional('unidadId'),
      ...opcional('grupoId'),
      ...opcional('refId'),
      ...opcional('contraparteId'),
      ...opcional('tandaDestinoId'),
      ...opcional('animalId'),
      ...opcional('motivo'),
      ...opcional('fotoId'),
    } satisfies Movimiento
  })
}

export interface NuevoMovimiento {
  id?: string | undefined
  fecha: string
  tipo: string
  cantidad?: bigint | undefined
  importe?: bigint | undefined
  tandaId?: string | undefined
  unidadId?: string | undefined
  grupoId?: string | undefined
  refId?: string | undefined
  contraparteId?: string | undefined
  tandaDestinoId?: string | undefined
  animalId?: string | undefined
  motivo?: string | undefined
  fotoId?: string | undefined
}

export function crearMovimiento(
  base: Base,
  granjaId: string,
  usuarioId: string,
  datos: NuevoMovimiento,
): Record<string, unknown> {
  const momento = ahora()
  // El id puede venir del cliente: se generan en el navegador para que la cola
  // de reintento pueda reenviar sin duplicar.
  const id = datos.id ?? randomUUID()

  base
    .prepare(
      `INSERT INTO movimiento
         (id, granja_id, fecha, tipo, cantidad, importe, tanda_id, unidad_id, grupo_id, ref_id,
          contraparte_id, tanda_destino_id, animal_id, motivo, foto_id,
          creado_por, creado_en, modificado_en, eliminado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
       ON CONFLICT(id) DO NOTHING`,
    )
    .run(
      id,
      granjaId,
      datos.fecha,
      datos.tipo,
      aParametro(datos.cantidad ?? 0n),
      aParametro(datos.importe),
      aParametro(datos.tandaId || null),
      aParametro(datos.unidadId || null),
      aParametro(datos.grupoId || null),
      aParametro(datos.refId || null),
      aParametro(datos.contraparteId || null),
      aParametro(datos.tandaDestinoId || null),
      aParametro(datos.animalId || null),
      aParametro(datos.motivo),
      aParametro(datos.fotoId),
      usuarioId,
      momento,
      momento,
    )

  const fila = base.prepare('SELECT * FROM movimiento WHERE id = ?').get(id) as Record<string, unknown>
  return desdeFila(fila)
}

/** Los movimientos no se editan: se anulan y se vuelve a cargar. */
export function anularMovimiento(base: Base, id: string, motivo?: string): void {
  base
    .prepare('UPDATE movimiento SET eliminado = 1, modificado_en = ?, motivo = COALESCE(?, motivo) WHERE id = ?')
    .run(ahora(), aParametro(motivo), id)
}

/**
 * La forma de la granja, para que el motor pueda sumar hacia arriba.
 *
 * Es data del catálogo, no de los movimientos: que Ponedoras viva en Gall 3 no
 * se puede deducir de lo que se cargó. Por eso se lee acá y se le pasa al motor.
 */
export function leerJerarquia(base: Base, granjaId: string): Jerarquia {
  const lugarPadre = new Map<string, string>()
  for (const u of listar(base, 'unidad', granjaId)) {
    const padre = u['unidadPadreId']
    if (typeof padre === 'string' && padre !== '') lugarPadre.set(u['id'] as string, padre)
  }

  const tandaEnLugar = new Map<string, string>()
  for (const t of listar(base, 'tanda', granjaId)) {
    const lugar = t['unidadId']
    if (typeof lugar === 'string' && lugar !== '') tandaEnLugar.set(t['id'] as string, lugar)
  }

  const animalEnTanda = new Map<string, string>()
  for (const a of listar(base, 'animal', granjaId)) {
    const tanda = a['tandaId']
    if (typeof tanda === 'string' && tanda !== '') animalEnTanda.set(a['id'] as string, tanda)
  }

  return { lugarPadre, tandaEnLugar, animalEnTanda }
}

/**
 * Cambia a qué nivel se imputa un movimiento ya cargado.
 *
 * Es la única excepción a que los movimientos no se editen, y se sostiene
 * porque no toca la plata: el importe, la fecha y la cantidad quedan intactos.
 * Sólo cambia dónde aparece ese gasto.
 */
export function reimputar(
  base: Base,
  id: string,
  destino: {
    tandaId?: string | null | undefined
    unidadId?: string | null | undefined
    animalId?: string | null | undefined
  },
): void {
  base
    .prepare('UPDATE movimiento SET tanda_id = ?, unidad_id = ?, animal_id = ?, modificado_en = ? WHERE id = ?')
    .run(
      aParametro(destino.tandaId || null),
      aParametro(destino.unidadId || null),
      aParametro(destino.animalId || null),
      ahora(),
      id,
    )
}

/** Anula de una vez todos los movimientos que salieron de la misma carga. */
export function anularGrupo(base: Base, grupoId: string): number {
  const r = base
    .prepare('UPDATE movimiento SET eliminado = 1, modificado_en = ? WHERE grupo_id = ? AND eliminado = 0')
    .run(ahora(), grupoId)
  return Number(r.changes)
}

/** Referencias ordenadas por frecuencia de uso, para las listas de carga (§5.1). */
export function refsMasUsadas(base: Base, granjaId: string, tipo: string): string[] {
  const filas = base
    .prepare(
      `SELECT ref_id FROM uso_de_referencia
       WHERE granja_id = ? AND tipo = ?
       ORDER BY veces DESC, ultima DESC`,
    )
    .all(granjaId, tipo) as Array<{ ref_id: string }>
  return filas.map((f) => f.ref_id)
}
