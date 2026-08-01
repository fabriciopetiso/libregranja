/**
 * Cuentas y sesiones.
 *
 * scrypt del core de Node: evita una dependencia nativa y es un KDF que OWASP
 * acepta. Sin OAuth ni registro público: los usuarios los da de alta un admin,
 * que es como funciona una granja.
 */

import {
  createHash,
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from 'node:crypto'
import { promisify } from 'node:util'

import type { Base } from '../db/conexion.js'

const scrypt = promisify(scryptCallback) as (
  clave: string,
  sal: Buffer,
  largo: number,
  opciones: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

// Coste del hash. Subirlos es compatible hacia atrás: los parámetros viajan
// dentro de cada hash, así que las claves viejas se siguen verificando.
const N = 1 << 16
const R = 8
const P = 1
const LARGO = 64
const MAXMEM = 256 * 1024 * 1024

const DIAS_DE_SESION = 30

export type Rol = 'admin' | 'operador'

export interface Usuario {
  id: string
  granjaId: string
  nombre: string
  usuario: string
  rol: Rol
}

export async function hashClave(clave: string): Promise<string> {
  const sal = randomBytes(16)
  const derivada = await scrypt(clave.normalize('NFKC'), sal, LARGO, { N, r: R, p: P, maxmem: MAXMEM })
  return `scrypt$${N}$${R}$${P}$${sal.toString('base64')}$${derivada.toString('base64')}`
}

export async function verificarClave(clave: string, guardado: string): Promise<boolean> {
  const partes = guardado.split('$')
  if (partes.length !== 6 || partes[0] !== 'scrypt') return false

  const n = Number(partes[1])
  const r = Number(partes[2])
  const p = Number(partes[3])
  const sal = Buffer.from(partes[4] ?? '', 'base64')
  const esperado = Buffer.from(partes[5] ?? '', 'base64')

  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false

  const derivada = await scrypt(clave.normalize('NFKC'), sal, esperado.length, {
    N: n,
    r,
    p,
    maxmem: MAXMEM,
  })

  return derivada.length === esperado.length && timingSafeEqual(derivada, esperado)
}

/** El token se guarda hasheado: si alguien lee la base, no puede hacerse pasar por nadie. */
function huella(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function crearSesion(base: Base, usuarioId: string): string {
  const token = randomBytes(32).toString('base64url')
  const creada = new Date()
  const expira = new Date(creada.getTime() + DIAS_DE_SESION * 24 * 60 * 60 * 1000)

  base
    .prepare('INSERT INTO sesion (id, usuario_id, creada_en, expira_en) VALUES (?, ?, ?, ?)')
    .run(huella(token), usuarioId, creada.toISOString(), expira.toISOString())

  return token
}

export function usuarioDeSesion(base: Base, token: string): Usuario | null {
  const fila = base
    .prepare(
      `SELECT u.id, u.granja_id, u.nombre, u.usuario, u.rol, s.expira_en
       FROM sesion s
       JOIN usuario u ON u.id = s.usuario_id
       WHERE s.id = ? AND u.eliminado = 0`,
    )
    .get(huella(token)) as
    | { id: string; granja_id: string; nombre: string; usuario: string; rol: Rol; expira_en: string }
    | undefined

  if (fila === undefined) return null

  if (new Date(fila.expira_en) < new Date()) {
    cerrarSesion(base, token)
    return null
  }

  return {
    id: fila.id,
    granjaId: fila.granja_id,
    nombre: fila.nombre,
    usuario: fila.usuario,
    rol: fila.rol,
  }
}

export function cerrarSesion(base: Base, token: string): void {
  base.prepare('DELETE FROM sesion WHERE id = ?').run(huella(token))
}

export async function autenticar(base: Base, usuario: string, clave: string): Promise<Usuario | null> {
  const fila = base
    .prepare(
      `SELECT id, granja_id, nombre, usuario, rol, clave_hash
       FROM usuario WHERE usuario = ? AND eliminado = 0`,
    )
    .get(usuario.trim().toLowerCase()) as
    | { id: string; granja_id: string; nombre: string; usuario: string; rol: Rol; clave_hash: string }
    | undefined

  // Se verifica igual contra un hash descartable cuando el usuario no existe,
  // para que responder "no existe" tarde lo mismo que "clave incorrecta".
  if (fila === undefined) {
    await verificarClave(clave, await hashClave('descartable'))
    return null
  }

  if (!(await verificarClave(clave, fila.clave_hash))) return null

  return {
    id: fila.id,
    granjaId: fila.granja_id,
    nombre: fila.nombre,
    usuario: fila.usuario,
    rol: fila.rol,
  }
}

export async function crearUsuario(
  base: Base,
  granjaId: string,
  datos: { nombre: string; usuario: string; clave: string; rol: Rol },
): Promise<Usuario> {
  const id = randomUUID()
  const momento = new Date().toISOString()
  const login = datos.usuario.trim().toLowerCase()

  base
    .prepare(
      `INSERT INTO usuario (id, granja_id, nombre, usuario, clave_hash, rol, creado_en, modificado_en, eliminado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
    )
    .run(id, granjaId, datos.nombre, login, await hashClave(datos.clave), datos.rol, momento, momento)

  return { id, granjaId, nombre: datos.nombre, usuario: login, rol: datos.rol }
}

/** Borra sesiones vencidas. Se llama al arrancar el servidor. */
export function limpiarSesionesVencidas(base: Base): number {
  const r = base.prepare('DELETE FROM sesion WHERE expira_en < ?').run(new Date().toISOString())
  return Number(r.changes)
}
