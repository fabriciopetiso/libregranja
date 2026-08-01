/**
 * Punto de entrada. Un proceso: sirve la API y los archivos estáticos del front.
 *
 * No hay base de datos que orquestar ni build en el servidor, así que en
 * producción esto es una unidad de systemd detrás de Caddy, sin Docker.
 */

import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { abrirBase, migrar } from '../db/conexion.js'
import { hayGranja } from '../db/inicializar.js'
import { crearApi } from './api.js'
import { limpiarSesionesVencidas } from './auth.js'

const RUTA_BASE = process.env['LIBREGRANJA_DB'] ?? resolve('datos/libregranja.db')
const PUERTO = Number(process.env['PUERTO'] ?? 8787)
const WEB = process.env['LIBREGRANJA_WEB'] ?? resolve('dist/web')

mkdirSync(dirname(RUTA_BASE), { recursive: true })

const base = abrirBase(RUTA_BASE)
const migraciones = migrar(base)
if (migraciones.length > 0) console.log(`Migraciones aplicadas: ${migraciones.join(', ')}`)

const vencidas = limpiarSesionesVencidas(base)
if (vencidas > 0) console.log(`Sesiones vencidas eliminadas: ${vencidas}`)

if (!hayGranja(base)) {
  console.log('\n  No hay ninguna granja todavía. Creá una con:\n')
  console.log('    npm run granja:crear -- --nombre "Mi granja" --usuario fabricio --clave ********\n')
}

const app = new Hono()

app.route('/api/v1', crearApi(base))

if (existsSync(WEB)) {
  app.use('/*', serveStatic({ root: WEB }))
  // La PWA es una sola página: cualquier ruta desconocida devuelve el index y
  // el ruteo lo resuelve el navegador.
  app.get('*', serveStatic({ path: 'index.html', root: WEB }))
}

serve({ fetch: app.fetch, port: PUERTO }, (info) => {
  console.log(`Libregranja escuchando en http://localhost:${info.port}`)
  console.log(`  base de datos: ${RUTA_BASE}`)
  console.log(`  front:         ${existsSync(WEB) ? WEB : '(sin compilar: npm run build)'}`)
})
