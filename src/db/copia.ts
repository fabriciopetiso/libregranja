/**
 * Copia de seguridad de la granja.
 *
 * Usa el `.backup` de SQLite, que copia en caliente: no frena la app ni deja
 * un archivo a medio escribir. Copiar el `.db` con `cp` mientras alguien está
 * cargando puede producir una copia corrupta que sólo se descubre el día que
 * hace falta.
 */

import { mkdirSync, readdirSync, statSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { abrirBase } from './conexion.js'

const ORIGEN = process.env['LIBREGRANJA_DB'] ?? resolve('datos/libregranja.db')
const DESTINO = process.env['LIBREGRANJA_COPIAS'] ?? resolve(process.env['HOME'] ?? '.', 'copias-libregranja')
const DIAS = 30

mkdirSync(DESTINO, { recursive: true })

const fecha = new Date().toISOString().slice(0, 10)
const archivo = join(DESTINO, `libregranja_${fecha}.db`)

const base = abrirBase(ORIGEN)
await base.backup(archivo)
base.close()

// Se guardan 30 días. Más atrás no sirve para recuperar un error de carga, y
// llenar el disco de copias viejas es su propia forma de perder los datos.
const limite = Date.now() - DIAS * 24 * 60 * 60 * 1000
let borradas = 0
for (const nombre of readdirSync(DESTINO)) {
  if (!nombre.startsWith('libregranja_') || !nombre.endsWith('.db')) continue
  const ruta = join(DESTINO, nombre)
  if (statSync(ruta).mtimeMs < limite) {
    unlinkSync(ruta)
    borradas += 1
  }
}

console.log(`copia: ${archivo}${borradas > 0 ? ` · ${borradas} viejas borradas` : ''}`)
