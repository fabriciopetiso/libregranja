/**
 * Fusionar lo de dos teléfonos.
 *
 * La sincronización P2P se apoya en una propiedad del modelo: los movimientos
 * son un conjunto que sólo crece. Se agregan y se anulan, nunca se editan. Eso
 * hace que fundir lo de dos dispositivos sea una unión de conjuntos, y que el
 * resultado no dependa del orden ni de cuántas veces se sincronice.
 *
 * Estos tests fijan esa propiedad sobre el motor, que es donde importa: si dos
 * teléfonos con los mismos movimientos calculan distinto, el P2P no sirve.
 */

import { describe, expect, it } from 'vitest'

import { calcular } from './motor.js'
import type { Catalogo, Movimiento, TipoMovimiento } from './tipos.js'

interface Borrador {
  id: string
  tipo: TipoMovimiento
  cantidad?: bigint
  importe?: bigint
  fecha?: string
  creadoEn?: string
  tandaId?: string
  refId?: string
  eliminado?: boolean
}

function mov(b: Borrador): Movimiento {
  return {
    id: b.id,
    granjaId: 'granja-1',
    fecha: b.fecha ?? '2026-08-01',
    creadoEn: b.creadoEn ?? `2026-08-01T00:00:00.000Z`,
    tipo: b.tipo,
    cantidad: b.cantidad ?? 0n,
    eliminado: b.eliminado ?? false,
    ...(b.importe !== undefined ? { importe: b.importe } : {}),
    ...(b.tandaId !== undefined ? { tandaId: b.tandaId } : {}),
    ...(b.refId !== undefined ? { refId: b.refId } : {}),
  }
}

const pesos = (m: number): bigint => BigInt(Math.round(m * 100))

const catalogo: Catalogo = {
  productos: new Map([['pollo', { id: 'pollo', descuenta: 'animales' as const }]]),
}

/** Une lo de dos teléfonos como lo hace la sincronización real. */
function fundir(a: readonly Movimiento[], b: readonly Movimiento[]): Movimiento[] {
  const porId = new Map<string, Movimiento>()
  for (const m of [...a, ...b]) {
    const previo = porId.get(m.id)
    // Anular es la única forma de cambiar un movimiento: si alguno de los dos
    // lo anuló, queda anulado.
    if (previo === undefined) porId.set(m.id, m)
    else if (m.eliminado) porId.set(m.id, m)
  }
  return [...porId.values()]
}

describe('Fusionar lo de dos teléfonos', () => {
  // El de Fabricio: compró alimento y cargó los pollitos.
  const deFabricio = [
    mov({ id: 'f1', tipo: 'ingreso_animales', tandaId: 'engorde', cantidad: 100n, importe: pesos(300_000) }),
    mov({ id: 'f2', tipo: 'compra', refId: 'alimento', cantidad: 20n, importe: pesos(250_000) }),
  ]

  // El de Javier: anotó muertes y una venta, sin ver lo de Fabricio.
  const deJavier = [
    mov({ id: 'j1', tipo: 'muerte', tandaId: 'engorde', cantidad: 3n, fecha: '2026-08-02' }),
    mov({ id: 'j2', tipo: 'venta', tandaId: 'engorde', refId: 'pollo', cantidad: 20n, importe: pesos(130_000), fecha: '2026-08-03' }),
  ]

  it('cada uno solo ve nada más que lo suyo', () => {
    expect(calcular(deFabricio, catalogo).tandas.get('engorde')?.animales).toBe(100n)
    expect(calcular(deJavier, catalogo).tandas.get('engorde')?.animales).toBe(-23n)
  })

  it('fundidos dan el estado real de la granja', () => {
    const juntos = calcular(fundir(deFabricio, deJavier), catalogo)
    expect(juntos.tandas.get('engorde')?.animales).toBe(77n)
  })

  it('da lo mismo quién sincroniza con quién', () => {
    const enUnSentido = calcular(fundir(deFabricio, deJavier), catalogo)
    const enElOtro = calcular(fundir(deJavier, deFabricio), catalogo)

    expect(enUnSentido.tandas.get('engorde')).toEqual(enElOtro.tandas.get('engorde'))
    expect(enUnSentido.depositos.get('alimento')).toEqual(enElOtro.depositos.get('alimento'))
  })

  it('sincronizar dos veces no duplica nada', () => {
    const unaVez = fundir(deFabricio, deJavier)
    const dosVeces = fundir(unaVez, deJavier)
    const tresVeces = fundir(dosVeces, deFabricio)

    expect(calcular(tresVeces, catalogo).tandas.get('engorde')?.animales).toBe(77n)
    expect(tresVeces).toHaveLength(4)
  })

  it('recibir un movimiento que ya se tiene deja todo igual', () => {
    const antes = calcular(deFabricio, catalogo)
    const despues = calcular(fundir(deFabricio, deFabricio), catalogo)
    expect(despues.tandas.get('engorde')).toEqual(antes.tandas.get('engorde'))
  })

  /**
   * Anular gana sobre no anular. Si Javier anuló una venta mal cargada y
   * Fabricio todavía la tiene viva, después de sincronizar tiene que quedar
   * anulada en los dos: si no, reaparecería en cada sincronización.
   */
  it('lo que uno anuló queda anulado para los dos', () => {
    const anulada = [...deJavier.slice(0, 1), { ...deJavier[1]!, eliminado: true }]
    const juntos = fundir(deFabricio, anulada)

    expect(calcular(juntos, catalogo).tandas.get('engorde')?.animales).toBe(97n)
  })

  it('el orden en que se cargaron no cambia el resultado', () => {
    const alReves = fundir([...deJavier].reverse(), [...deFabricio].reverse())
    const derecho = fundir(deFabricio, deJavier)

    expect(calcular(alReves, catalogo).tandas.get('engorde')).toEqual(
      calcular(derecho, catalogo).tandas.get('engorde'),
    )
  })

  /**
   * Tres teléfonos que se sincronizan de a pares, en cualquier orden, terminan
   * todos iguales. Es lo que permite que la granja funcione sin que nadie sea
   * el dueño de la versión buena.
   */
  it('tres teléfonos convergen sincronizando de a pares', () => {
    const deTercero = [mov({ id: 't1', tipo: 'huevos', tandaId: 'ponedoras', cantidad: 95n })]

    const aYb = fundir(deFabricio, deJavier)
    const bYc = fundir(deJavier, deTercero)
    const cYa = fundir(deTercero, deFabricio)

    const todos = [fundir(aYb, deTercero), fundir(bYc, deFabricio), fundir(cYa, deJavier)]
    const estados = todos.map((m) => calcular(m, catalogo))

    for (const e of estados) {
      expect(e.tandas.get('engorde')?.animales).toBe(77n)
      expect(e.tandas.get('ponedoras')?.huevosDisponibles).toBe(95n)
    }
  })
})
