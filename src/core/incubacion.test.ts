/**
 * El ciclo de una incubación, como pasa de verdad.
 *
 *   día 0   se cargan los huevos, de uno o varios gallineros, o comprados
 *   día 18  ovoscopía: se descartan los que no tienen embrión o lo tienen
 *           muerto. Los que siguen pasan a la nacedora
 *   día 21  nacen
 *
 * Separar el descarte de los que no nacieron es lo que hace útil el número:
 * descartar mucho en la ovoscopía habla de los reproductores o de cómo se
 * guardaron los huevos; perder muchos en la nacedora habla de la máquina.
 */

import { describe, expect, it } from 'vitest'

import { calcular } from './motor.js'
import { etapaIncubacion, rendimientoIncubacion } from './reportes.js'
import type { Movimiento, TipoMovimiento } from './tipos.js'

interface Borrador {
  tipo: TipoMovimiento
  cantidad?: bigint
  fecha?: string
  tandaId?: string
  tandaDestinoId?: string
  motivo?: string
}

function secuencia(): (b: Borrador) => Movimiento {
  let n = 0
  return (b) => {
    n += 1
    return {
      id: `m${n}`,
      granjaId: 'granja-1',
      fecha: b.fecha ?? '2026-08-01',
      creadoEn: `2026-08-01T00:00:${String(n).padStart(2, '0')}.000Z`,
      tipo: b.tipo,
      cantidad: b.cantidad ?? 0n,
      eliminado: false,
      ...(b.tandaId !== undefined ? { tandaId: b.tandaId } : {}),
      ...(b.tandaDestinoId !== undefined ? { tandaDestinoId: b.tandaDestinoId } : {}),
      ...(b.motivo !== undefined ? { motivo: b.motivo } : {}),
    }
  }
}

describe('Cargar la incubadora', () => {
  it('los huevos de un gallinero salen de su stock', () => {
    const m = secuencia()
    const estado = calcular([
      m({ tipo: 'huevos', tandaId: 'ponedoras', cantidad: 1500n }),
      m({ tipo: 'carga_incubacion', tandaId: 'ponedoras', tandaDestinoId: 'incubacion', cantidad: 1200n }),
    ])

    expect(estado.tandas.get('ponedoras')?.huevosDisponibles).toBe(300n)
    expect(estado.tandas.get('incubacion')?.huevosCargados).toBe(1200n)
  })

  /**
   * Una misma incubación puede llenarse con huevos de varios lados. Cada carga
   * descuenta del suyo, y la incubadora suma todo.
   */
  it('se pueden cargar huevos de varios gallineros a la misma incubación', () => {
    const m = secuencia()
    const estado = calcular([
      m({ tipo: 'huevos', tandaId: 'gall-1', cantidad: 800n }),
      m({ tipo: 'huevos', tandaId: 'gall-2', cantidad: 600n }),
      m({ tipo: 'carga_incubacion', tandaId: 'gall-1', tandaDestinoId: 'incubacion', cantidad: 700n }),
      m({ tipo: 'carga_incubacion', tandaId: 'gall-2', tandaDestinoId: 'incubacion', cantidad: 500n }),
    ])

    expect(estado.tandas.get('gall-1')?.huevosDisponibles).toBe(100n)
    expect(estado.tandas.get('gall-2')?.huevosDisponibles).toBe(100n)
    expect(estado.tandas.get('incubacion')?.huevosCargados).toBe(1200n)
  })

  /** Huevos comprados: entran a la incubadora sin salir del stock de nadie. */
  it('los huevos de afuera se cargan sin descontar', () => {
    const m = secuencia()
    const estado = calcular([
      m({ tipo: 'huevos', tandaId: 'ponedoras', cantidad: 500n }),
      m({ tipo: 'carga_incubacion', tandaDestinoId: 'incubacion', cantidad: 300n, motivo: 'comprados' }),
    ])

    expect(estado.tandas.get('ponedoras')?.huevosDisponibles).toBe(500n)
    expect(estado.tandas.get('incubacion')?.huevosCargados).toBe(300n)
  })

  it('mezclar propios y comprados suma todo en la incubación', () => {
    const m = secuencia()
    const estado = calcular([
      m({ tipo: 'huevos', tandaId: 'ponedoras', cantidad: 1000n }),
      m({ tipo: 'carga_incubacion', tandaId: 'ponedoras', tandaDestinoId: 'incubacion', cantidad: 900n }),
      m({ tipo: 'carga_incubacion', tandaDestinoId: 'incubacion', cantidad: 300n, motivo: 'comprados' }),
    ])

    expect(estado.tandas.get('ponedoras')?.huevosDisponibles).toBe(100n)
    expect(estado.tandas.get('incubacion')?.huevosCargados).toBe(1200n)
  })
})

describe('El ciclo completo', () => {
  const m = secuencia()
  const movimientos = [
    m({ tipo: 'huevos', fecha: '2026-08-01', tandaId: 'ponedoras', cantidad: 1400n }),
    m({ tipo: 'carga_incubacion', fecha: '2026-08-02', tandaId: 'ponedoras', tandaDestinoId: 'incubacion', cantidad: 1200n }),
    // Día 18: ovoscopía. 156 sin embrión o con el embrión muerto.
    m({ tipo: 'descarte_incubacion', fecha: '2026-08-20', tandaId: 'incubacion', cantidad: 156n, motivo: 'ovoscopía' }),
    // Día 21: nacen.
    m({ tipo: 'nacimiento', fecha: '2026-08-23', tandaId: 'incubacion', cantidad: 912n }),
  ]

  const tanda = calcular(movimientos).tandas.get('incubacion')!
  const r = rendimientoIncubacion(tanda)

  it('cuenta cada etapa por separado', () => {
    expect(r.cargados).toBe(1200n)
    expect(r.descartados).toBe(156n)
    expect(r.aNacedora).toBe(1044n)
    expect(r.nacidos).toBe(912n)
    expect(r.noNacieron).toBe(132n)
  })

  it('el descarte de la ovoscopía tiene su propio porcentaje', () => {
    // 156 de 1200 = 13%. Habla de los reproductores o de cómo se guardaron.
    expect(r.descartePorcentaje).toBe(13)
  })

  it('distingue el rendimiento del negocio del de la máquina', () => {
    // Sobre todo lo que entró: 912 de 1200.
    expect(r.sobreCargados).toBe(76)
    // Sobre los que llegaron a la nacedora: 912 de 1044. Ese es el que juzga
    // a la incubadora, y es bastante mejor que el otro.
    expect(r.sobreNacedora).toBe(87.36)
  })

  it('los nacidos van al stock de la incubación hasta que se trasladen', () => {
    expect(tanda.animales).toBe(912n)
  })

  it('sin ovoscopía registrada, todo lo cargado llegó a la nacedora', () => {
    const m2 = secuencia()
    const sinDescarte = calcular([
      m2({ tipo: 'carga_incubacion', tandaDestinoId: 'inc', cantidad: 1000n }),
      m2({ tipo: 'nacimiento', tandaId: 'inc', cantidad: 760n }),
    ])
    const r2 = rendimientoIncubacion(sinDescarte.tandas.get('inc')!)

    expect(r2.aNacedora).toBe(1000n)
    expect(r2.sobreCargados).toBe(76)
    expect(r2.sobreNacedora).toBe(76)
  })
})

describe('En qué momento está', () => {
  it('los primeros días está incubando', () => {
    const e = etapaIncubacion('2026-08-02', '2026-08-10')
    expect(e.dia).toBe(8)
    expect(e.etapa).toBe('incubando')
    expect(e.faltan).toBe(10)
  })

  it('cerca del día 18 toca la ovoscopía', () => {
    expect(etapaIncubacion('2026-08-02', '2026-08-20').etapa).toBe('ovoscopia')
  })

  it('después pasa a la nacedora', () => {
    const e = etapaIncubacion('2026-08-02', '2026-08-21')
    expect(e.etapa).toBe('nacedora')
    expect(e.faltan).toBe(2)
  })

  it('pasados los 21 días la incubación terminó', () => {
    expect(etapaIncubacion('2026-08-02', '2026-08-25').etapa).toBe('terminada')
  })
})
