/**
 * Pruebas de la capa de datos, sobre una base en memoria.
 *
 * Estas nacieron de un bug real: un formulario manda `""` cuando el usuario no
 * eligió nada, y la clave foránea rechazaba la fila entera. "Sin categoría" era
 * imposible de guardar, y el error volvía como un 500 sin explicación.
 */

import { beforeEach, describe, expect, it } from 'vitest'

import { abrirBase, migrar } from './conexion.js'
import type { Base } from './conexion.js'
import { crear, crearMovimiento, leerMovimientos, listar, obtener } from './repos.js'

const GRANJA = 'granja-de-prueba'
const USUARIO = 'usuario-de-prueba'
const MOMENTO = '2026-08-01T00:00:00Z'

let base: Base

beforeEach(() => {
  base = abrirBase(':memory:')
  migrar(base)
  base
    .prepare('INSERT INTO granja (id, nombre, creado_en, modificado_en, eliminado) VALUES (?, ?, ?, ?, 0)')
    .run(GRANJA, 'De prueba', MOMENTO, MOMENTO)
  // Los movimientos guardan quién los cargó, así que el usuario tiene que existir.
  base
    .prepare(
      `INSERT INTO usuario (id, granja_id, nombre, usuario, clave_hash, rol, creado_en, modificado_en, eliminado)
       VALUES (?, ?, 'Quien carga', 'quiencarga', 'x', 'admin', ?, ?, 0)`,
    )
    .run(USUARIO, GRANJA, MOMENTO, MOMENTO)
})

describe('Referencias vacías', () => {
  it('una tanda sin categoría se guarda: un id vacío es ausencia de referencia', () => {
    const tanda = crear(base, 'tanda', GRANJA, {
      nombre: 'Engorde agosto',
      categoriaId: '',
      fechaInicio: '2026-08-01',
    })

    expect(tanda['nombre']).toBe('Engorde agosto')
    expect(tanda['categoriaId']).toBeNull()
  })

  it('un movimiento sin tanda ni referencia se guarda', () => {
    const mov = crearMovimiento(base, GRANJA, USUARIO, {
      fecha: '2026-08-01',
      tipo: 'gasto',
      importe: 5000n,
      tandaId: '',
      refId: '',
      contraparteId: '',
    })

    expect(mov['tandaId']).toBeNull()
    expect(mov['importe']).toBe(5000n)
  })
})

describe('Precisión del dinero', () => {
  it('un importe mayor que 2^53 sobrevive el viaje a la base y de vuelta', () => {
    // 2^53 + 1: el primer entero que un double no puede representar.
    const enorme = 9_007_199_254_740_993n

    crearMovimiento(base, GRANJA, USUARIO, {
      fecha: '2026-08-01',
      tipo: 'gasto',
      importe: enorme,
    })

    expect(leerMovimientos(base, GRANJA)[0]?.importe).toBe(enorme)
  })

  it('la cantidad vuelve como BigInt, no como number', () => {
    crearMovimiento(base, GRANJA, USUARIO, {
      fecha: '2026-08-01',
      tipo: 'ingreso_animales',
      cantidad: 200n,
    })

    expect(typeof leerMovimientos(base, GRANJA)[0]?.cantidad).toBe('bigint')
  })
})

describe('Idempotencia', () => {
  it('reenviar un movimiento con el mismo id no lo duplica', () => {
    const datos = { id: 'el-mismo-id', fecha: '2026-08-01', tipo: 'gasto', importe: 1000n }

    crearMovimiento(base, GRANJA, USUARIO, datos)
    crearMovimiento(base, GRANJA, USUARIO, datos)

    // Es lo que hace la cola de reintento cuando vuelve la señal: sin esto,
    // una carga sin conexión terminaría contada dos veces.
    expect(leerMovimientos(base, GRANJA)).toHaveLength(1)
  })
})

describe('Campos de control', () => {
  it('el cliente no puede pisar granja_id ni los campos de control', () => {
    const insumo = crear(base, 'insumo', GRANJA, {
      nombre: 'Balanceado',
      presentacion: 'bolsa',
      granjaId: 'otra-granja',
      eliminado: true,
      creadoEn: '1999-01-01T00:00:00Z',
    })

    expect(insumo['granjaId']).toBe(GRANJA)
    expect(insumo['eliminado']).toBe(false)
    expect(insumo['creadoEn']).not.toBe('1999-01-01T00:00:00Z')
  })

  it('una columna que no existe en la tabla se ignora en vez de romper', () => {
    const insumo = crear(base, 'insumo', GRANJA, {
      nombre: 'Balanceado',
      presentacion: 'bolsa',
      inventado: 'lo que sea',
    })

    expect(insumo['nombre']).toBe('Balanceado')
    expect(insumo['inventado']).toBeUndefined()
  })
})

describe('Nada se borra físicamente', () => {
  it('anular saca de la lista pero la fila sigue estando', () => {
    const insumo = crear(base, 'insumo', GRANJA, { nombre: 'Balanceado', presentacion: 'bolsa' })
    const id = insumo['id'] as string

    base.prepare('UPDATE insumo SET eliminado = 1 WHERE id = ?').run(id)

    expect(listar(base, 'insumo', GRANJA)).toHaveLength(0)
    expect(obtener(base, 'insumo', id)).not.toBeNull()
  })
})
