/**
 * Export de los movimientos a CSV.
 *
 * El archivo es para abrirlo en LibreOffice o Excel acá, así que:
 *   · separador punto y coma, porque la coma es el separador decimal en es-AR;
 *   · importes con coma decimal, no con punto;
 *   · BOM al principio, o Excel se come los acentos;
 *   · fin de línea CRLF, que es lo que dice el RFC del formato.
 *
 * Las referencias salen con nombre, no con UUID: un archivo lleno de
 * identificadores no sirve para llevárselo a ningún lado.
 */

import type { Movimiento } from '../core/tipos.js'
import type { Base } from '../db/conexion.js'
import * as repos from '../db/repos.js'

const COLUMNAS = [
  'Fecha',
  'Tipo',
  'Tanda',
  'Referencia',
  'Cantidad',
  'Importe',
  'Contraparte',
  'Tanda destino',
  'Motivo',
  'Cargado por',
  'Cargado el',
  'Id',
] as const

/** Escapa un valor: comillas dobles si tiene separador, comillas o saltos de línea. */
function campo(valor: string | null | undefined): string {
  const texto = valor ?? ''
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto
}

/** Centavos → "12500,50", con coma decimal y sin separador de miles. */
function importe(centavos: bigint | undefined): string {
  if (centavos === undefined) return ''
  const negativo = centavos < 0n
  const abs = negativo ? -centavos : centavos
  return `${negativo ? '-' : ''}${abs / 100n},${(abs % 100n).toString().padStart(2, '0')}`
}

export interface OpcionesExport {
  desde?: string | undefined
  hasta?: string | undefined
  /** Incluir los movimientos anulados, marcados como tales. */
  incluirAnulados?: boolean
}

export function exportarCsv(base: Base, granjaId: string, opciones: OpcionesExport = {}): string {
  const nombres = new Map<string, string>()
  for (const tabla of ['insumo', 'producto', 'rubro_gasto', 'contraparte', 'tanda'] as const) {
    for (const fila of repos.listar(base, tabla, granjaId)) {
      nombres.set(fila['id'] as string, (fila['nombre'] as string | undefined) ?? (fila['id'] as string))
    }
  }

  const usuarios = new Map<string, string>()
  for (const fila of base
    .prepare('SELECT id, nombre FROM usuario WHERE granja_id = ?')
    .all(granjaId) as Array<{ id: string; nombre: string }>) {
    usuarios.set(fila.id, fila.nombre)
  }

  const nombre = (id: string | undefined): string => (id === undefined ? '' : (nombres.get(id) ?? id))

  // Se leen del repositorio, que ya devuelve el orden canónico (fecha, carga, id):
  // el mismo con el que el motor calcula. El archivo cuenta la misma historia
  // que la pantalla, en el mismo orden.
  const movimientos: Array<Movimiento & { creadoPor?: string; anulado?: boolean }> = repos.leerMovimientos(
    base,
    granjaId,
  )

  const filas = movimientos.filter(
    (m) =>
      (opciones.desde === undefined || m.fecha >= opciones.desde) &&
      (opciones.hasta === undefined || m.fecha <= opciones.hasta),
  )

  const autores = new Map<string, string>()
  for (const fila of base
    .prepare('SELECT id, creado_por FROM movimiento WHERE granja_id = ?')
    .all(granjaId) as Array<{ id: string; creado_por: string | null }>) {
    if (fila.creado_por !== null) autores.set(fila.id, usuarios.get(fila.creado_por) ?? '')
  }

  const lineas = [COLUMNAS.join(';')]

  for (const m of filas) {
    lineas.push(
      [
        m.fecha,
        m.tipo.replace(/_/g, ' '),
        campo(nombre(m.tandaId)),
        campo(nombre(m.refId)),
        m.cantidad.toString(),
        importe(m.importe),
        campo(nombre(m.contraparteId)),
        campo(nombre(m.tandaDestinoId)),
        campo(m.motivo),
        campo(autores.get(m.id)),
        m.creadoEn,
        m.id,
      ].join(';'),
    )
  }

  return `﻿${lineas.join('\r\n')}\r\n`
}

/** Nombre de archivo con el período adentro, para no juntar tres export iguales. */
export function nombreArchivo(desde?: string, hasta?: string): string {
  const periodo = desde !== undefined && hasta !== undefined ? `_${desde}_a_${hasta}` : '_completo'
  return `libregranja${periodo}.csv`
}
