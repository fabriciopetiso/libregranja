/**
 * Alta de una granja y su primer usuario admin, desde la línea de comandos.
 *
 * Es lo único que no se puede hacer desde la app: no hay registro público,
 * así que la primera cuenta tiene que nacer en el servidor.
 */

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

import { abrirBase, migrar } from '../db/conexion.js'
import { crearGranja } from '../db/inicializar.js'

function argumento(nombre: string): string | undefined {
  const i = process.argv.indexOf(`--${nombre}`)
  return i === -1 ? undefined : process.argv[i + 1]
}

const nombre = argumento('nombre')
const usuario = argumento('usuario')
const clave = argumento('clave')

if (nombre === undefined || usuario === undefined || clave === undefined) {
  console.error('Uso: npm run granja:crear -- --nombre "Mi granja" --usuario fabricio --clave ********')
  process.exit(1)
}

if (clave.length < 8) {
  console.error('La clave necesita al menos 8 caracteres.')
  process.exit(1)
}

const ruta = process.env['LIBREGRANJA_DB'] ?? resolve('datos/libregranja.db')
mkdirSync(dirname(ruta), { recursive: true })

const base = abrirBase(ruta)
migrar(base)

const { granjaId } = await crearGranja(base, {
  nombre,
  admin: { nombre: usuario, usuario, clave },
})

console.log(`Granja "${nombre}" creada.`)
console.log(`  id:      ${granjaId}`)
console.log(`  usuario: ${usuario} (admin)`)
console.log(`  base:    ${ruta}`)
console.log('\nSe cargaron especies, plantillas y rubros iniciales. Todo eso es editable desde la app.')
