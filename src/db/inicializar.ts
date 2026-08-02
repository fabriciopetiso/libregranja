/**
 * Alta de una granja con sus valores iniciales.
 *
 * Ojo con lo que esto es y lo que no es: son FILAS, no constantes del programa.
 * El usuario las edita y las borra desde la app, y ninguna consulta del sistema
 * depende de que existan ni de cómo se llamen. Si mañana la granja no cría
 * gallinas, borra la especie y no se rompe nada.
 */

import { randomUUID } from 'node:crypto'

import { crearUsuario } from '../servidor/auth.js'
import type { Base } from './conexion.js'

const ESPECIES = ['Conejo', 'Gallina']

const PLANTILLAS: Array<{ nombre: string; capacidades: string[] }> = [
  { nombre: 'Reproductores', capacidades: ['animales_con_nombre', 'registra_nacimientos', 'registra_alimento'] },
  { nombre: 'Engorde', capacidades: ['registra_peso', 'registra_alimento'] },
  { nombre: 'Postura', capacidades: ['registra_huevos', 'registra_alimento'] },
  { nombre: 'Incubación', capacidades: ['registra_carga_incubacion'] },
  { nombre: 'Cría', capacidades: ['registra_nacimientos', 'registra_peso', 'registra_alimento'] },
  { nombre: 'Genérica', capacidades: ['registra_alimento'] },
]

const RUBROS = [
  'Alimento',
  'Pollitos',
  'Reproductores',
  'Veterinaria',
  'Infraestructura',
  'Mano de obra',
  'Energía',
  'Flete',
  'Otros',
]

export interface GranjaNueva {
  nombre: string
  admin: { nombre: string; usuario: string; clave: string }
}

/**
 * Carga los valores iniciales de una granja recién creada.
 *
 * Se usa tanto al crear la primera granja desde la línea de comandos como al
 * crear una más desde la app: toda granja arranca con lo mismo, y desde ahí el
 * usuario lo edita.
 */
export function sembrarValoresIniciales(base: Base, granjaId: string, momento: string): void {
  const insertarEspecie = base.prepare(
    'INSERT INTO especie (id, granja_id, nombre, creado_en, modificado_en, eliminado) VALUES (?, ?, ?, ?, ?, 0)',
  )
  const insertarRubro = base.prepare(
    'INSERT INTO rubro_gasto (id, granja_id, nombre, creado_en, modificado_en, eliminado) VALUES (?, ?, ?, ?, ?, 0)',
  )
  const insertarPlantilla = base.prepare(
    `INSERT INTO plantilla
       (id, granja_id, nombre, animales_con_nombre, registra_nacimientos, registra_huevos,
        registra_carga_incubacion, registra_peso, registra_alimento, creado_en, modificado_en, eliminado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  )

  for (const nombre of ESPECIES) insertarEspecie.run(randomUUID(), granjaId, nombre, momento, momento)
  for (const nombre of RUBROS) insertarRubro.run(randomUUID(), granjaId, nombre, momento, momento)

  for (const { nombre, capacidades } of PLANTILLAS) {
    const tiene = (c: string): number => (capacidades.includes(c) ? 1 : 0)
    insertarPlantilla.run(
      randomUUID(),
      granjaId,
      nombre,
      tiene('animales_con_nombre'),
      tiene('registra_nacimientos'),
      tiene('registra_huevos'),
      tiene('registra_carga_incubacion'),
      tiene('registra_peso'),
      tiene('registra_alimento'),
      momento,
      momento,
    )
  }
}

export async function crearGranja(base: Base, datos: GranjaNueva): Promise<{ granjaId: string; adminId: string }> {
  const granjaId = randomUUID()
  const momento = new Date().toISOString()

  const crear = base.transaction(() => {
    base
      .prepare('INSERT INTO granja (id, nombre, creado_en, modificado_en, eliminado) VALUES (?, ?, ?, ?, 0)')
      .run(granjaId, datos.nombre, momento, momento)
    sembrarValoresIniciales(base, granjaId, momento)
  })

  crear()

  const admin = await crearUsuario(base, granjaId, { ...datos.admin, rol: 'admin' })
  base
    .prepare('INSERT INTO usuario_granja (usuario_id, granja_id, rol, creado_en) VALUES (?, ?, ?, ?)')
    .run(admin.id, granjaId, 'admin', momento)

  return { granjaId, adminId: admin.id }
}

export function hayGranja(base: Base): boolean {
  const fila = base.prepare('SELECT COUNT(*) AS n FROM granja WHERE eliminado = 0').get() as { n: bigint }
  return Number(fila.n) > 0
}
