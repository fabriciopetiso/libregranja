/**
 * Conexión a SQLite y migraciones.
 *
 * `defaultSafeIntegers(true)` hace que TODOS los enteros vuelvan como BigInt.
 * Es deliberado: el riesgo que se evita —perder centavos en silencio al pasar por
 * un double— es peor que la incomodidad de tener que convertir un COUNT a Number.
 * Seguro por defecto, incómodo en los bordes.
 */

import Database from 'better-sqlite3'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export type Base = Database.Database

const AQUI = dirname(fileURLToPath(import.meta.url))
const ESQUEMA = join(AQUI, 'esquema')

export function abrirBase(ruta: string): Base {
  const base = new Database(ruta)

  // WAL: múltiples lectores y un escritor. Suficiente para una granja.
  base.pragma('journal_mode = WAL')
  base.pragma('foreign_keys = ON')
  // Si otro proceso está escribiendo, esperar en vez de fallar.
  base.pragma('busy_timeout = 5000')
  base.defaultSafeIntegers(true)

  return base
}

/**
 * Aplica las migraciones pendientes.
 *
 * Los archivos son `NNN_nombre.sql` y se aplican en orden por su número. Cada
 * uno corre dentro de una transacción junto con el registro de su versión: o
 * entra entero, o no entra.
 */
export function migrar(base: Base): number[] {
  base.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version    INTEGER PRIMARY KEY,
      archivo    TEXT NOT NULL,
      aplicada_en TEXT NOT NULL
    );
  `)

  const aplicadas = new Set(
    base
      .prepare('SELECT version FROM schema_version')
      .all()
      .map((f) => Number((f as { version: bigint }).version)),
  )

  const archivos = readdirSync(ESQUEMA)
    .filter((n) => n.endsWith('.sql'))
    .sort()

  const nuevas: number[] = []

  for (const archivo of archivos) {
    const version = Number(archivo.split('_')[0])
    if (Number.isNaN(version)) throw new Error(`Migración sin número: ${archivo}`)
    if (aplicadas.has(version)) continue

    const sql = readFileSync(join(ESQUEMA, archivo), 'utf8')
    const aplicar = base.transaction(() => {
      base.exec(sql)
      base
        .prepare('INSERT INTO schema_version (version, archivo, aplicada_en) VALUES (?, ?, ?)')
        .run(version, archivo, new Date().toISOString())
    })

    aplicar()
    nuevas.push(version)
  }

  return nuevas
}
