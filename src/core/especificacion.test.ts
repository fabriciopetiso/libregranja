/**
 * Los casos de prueba de §8 de la especificación, verificados a mano por el usuario.
 *
 * Estos tests son la definición de correcto. Si alguna vez hay que elegir entre
 * lo que dice el código y lo que dice este archivo, gana este archivo.
 */

import { describe, expect, it } from 'vitest'

import { costoUnitario, formatearPesos, repartirProporcional } from './dinero.js'
import { calcular } from './motor.js'
import { deudaPorContraparte, gastosPorRubro, rendimientoIncubacion } from './reportes.js'
import type { Catalogo, Movimiento, TipoMovimiento } from './tipos.js'

// --- utilidades del test -----------------------------------------------------

interface Borrador {
  tipo: TipoMovimiento
  cantidad?: bigint
  importe?: bigint
  fecha?: string
  tandaId?: string
  refId?: string
  contraparteId?: string
  tandaDestinoId?: string
  unidadId?: string
  animalId?: string
  id?: string
}

/** Construye movimientos con orden de carga creciente, para no repetir campos de control. */
function secuencia(): (b: Borrador) => Movimiento {
  let n = 0
  return (b) => {
    n += 1
    return {
      id: b.id ?? `m${n}`,
      granjaId: 'granja-1',
      fecha: b.fecha ?? '2026-03-01',
      creadoEn: `2026-03-01T00:00:${String(n).padStart(2, '0')}.000Z`,
      tipo: b.tipo,
      cantidad: b.cantidad ?? 0n,
      eliminado: false,
      ...(b.importe !== undefined ? { importe: b.importe } : {}),
      ...(b.tandaId !== undefined ? { tandaId: b.tandaId } : {}),
      ...(b.refId !== undefined ? { refId: b.refId } : {}),
      ...(b.contraparteId !== undefined ? { contraparteId: b.contraparteId } : {}),
      ...(b.tandaDestinoId !== undefined ? { tandaDestinoId: b.tandaDestinoId } : {}),
      ...(b.unidadId !== undefined ? { unidadId: b.unidadId } : {}),
      ...(b.animalId !== undefined ? { animalId: b.animalId } : {}),
    }
  }
}

/** Pesos a centavos, para que los tests se lean como la especificación. */
function pesos(monto: number): bigint {
  return BigInt(Math.round(monto * 100))
}

const catalogoConDescuento: Catalogo = {
  productos: new Map([['pollo', { id: 'pollo', descuentaAnimales: true }]]),
}

// --- §8 · Costo por bolsa ----------------------------------------------------

describe('§8 · Costo por bolsa: promedio ponderado móvil', () => {
  const m = secuencia()
  const movimientos = [
    m({ tipo: 'compra', refId: 'alimento', cantidad: 20n, importe: pesos(250_000) }),
    m({ tipo: 'compra', refId: 'alimento', cantidad: 12n, importe: pesos(180_000) }),
    m({ tipo: 'entrega_insumo', refId: 'alimento', cantidad: 8n, tandaId: 'tanda-a' }),
    m({ tipo: 'compra', refId: 'alimento', cantidad: 8n, importe: pesos(130_000) }),
    m({ tipo: 'entrega_insumo', refId: 'alimento', cantidad: 12n, tandaId: 'tanda-a' }),
  ]

  /** Estado del depósito tras los primeros `n` movimientos. */
  function alPaso(n: number) {
    const deposito = calcular(movimientos.slice(0, n)).depositos.get('alimento')
    if (deposito === undefined) throw new Error('el depósito no existe')
    return deposito
  }

  it('20 bolsas por $250.000 dan $12.500,00 por bolsa', () => {
    const d = alPaso(1)
    expect(d.unidades).toBe(20n)
    expect(costoUnitario(d.centavos, d.unidades)).toBe(1_250_000)
    expect(formatearPesos(BigInt(costoUnitario(d.centavos, d.unidades)!))).toBe('12.500,00')
  })

  it('12 bolsas más por $180.000 dan $13.437,50 sobre 32 bolsas', () => {
    const d = alPaso(2)
    expect(d.unidades).toBe(32n)
    expect(costoUnitario(d.centavos, d.unidades)).toBe(1_343_750)
  })

  it('entregar 8 bolsas imputa $107.500,00 y deja 24 bolsas valuadas en $322.500,00', () => {
    const estado = calcular(movimientos.slice(0, 3))
    const imputado = estado.imputaciones.find((i) => i.concepto === 'entrega_insumo')

    expect(imputado?.centavos).toBe(pesos(107_500))
    const d = alPaso(3)
    expect(d.unidades).toBe(24n)
    expect(d.centavos).toBe(pesos(322_500))
  })

  it('el costo por bolsa no cambia al entregar', () => {
    expect(costoUnitario(alPaso(3).centavos, alPaso(3).unidades)).toBe(1_343_750)
  })

  it('8 bolsas más por $130.000 dan $14.140,625 sobre 32 bolsas: el costo unitario no es un entero de centavos', () => {
    const d = alPaso(4)
    expect(d.unidades).toBe(32n)
    expect(costoUnitario(d.centavos, d.unidades)).toBe(1_414_062.5)
    // El valor fraccionario nunca se almacena: el par (unidades, centavos) sí es exacto.
    expect(d.centavos).toBe(pesos(452_500))
  })

  it('entregar 12 bolsas imputa $169.687,50 y deja 20 bolsas valuadas en $282.812,50', () => {
    const estado = calcular(movimientos)
    const entregas = estado.imputaciones.filter((i) => i.concepto === 'entrega_insumo')

    expect(entregas[1]?.centavos).toBe(pesos(169_687.5))
    const d = alPaso(5)
    expect(d.unidades).toBe(20n)
    expect(d.centavos).toBe(pesos(282_812.5))
  })

  it('no se pierde ni un centavo: imputado + saldo del depósito = comprado', () => {
    const estado = calcular(movimientos)
    const imputado = estado.imputaciones
      .filter((i) => i.concepto === 'entrega_insumo')
      .reduce((suma, i) => suma + i.centavos, 0n)
    const saldo = estado.depositos.get('alimento')!.centavos

    expect(imputado + saldo).toBe(pesos(250_000) + pesos(180_000) + pesos(130_000))
  })
})

// --- §8 · Existencias --------------------------------------------------------

describe('§8 · Existencias', () => {
  const m = secuencia()
  const base = [
    m({ tipo: 'ingreso_animales', tandaId: 'tanda-a', cantidad: 100n }),
    m({ tipo: 'muerte', tandaId: 'tanda-a', cantidad: 7n }),
    m({ tipo: 'venta', tandaId: 'tanda-a', refId: 'pollo', cantidad: 60n, importe: pesos(300_000), contraparteId: 'cliente-1' }),
    m({ tipo: 'traslado', tandaId: 'tanda-a', tandaDestinoId: 'tanda-b', cantidad: 10n }),
  ]

  it('ingresan 100, mueren 7, se venden 60, se trasladan 10: quedan 23', () => {
    const estado = calcular(base, catalogoConDescuento)
    expect(estado.tandas.get('tanda-a')?.animales).toBe(23n)
  })

  it('un recuento de 21 deja 21, y la diferencia de −2 se deriva sin tocar el pasado', () => {
    const antes = calcular(base, catalogoConDescuento).tandas.get('tanda-a')!.animales
    const conRecuento = [...base, m({ tipo: 'recuento', tandaId: 'tanda-a', cantidad: 21n })]
    const despues = calcular(conRecuento, catalogoConDescuento).tandas.get('tanda-a')!.animales

    expect(despues).toBe(21n)
    expect(despues - antes).toBe(-2n)
  })
})

// --- §8 · Deuda --------------------------------------------------------------

describe('§8 · Deuda de una contraparte', () => {
  const m = secuencia()

  it('venta de $80.000 con cobro de $50.000 deja $30.000 de deuda', () => {
    const movimientos = [
      m({ tipo: 'venta', refId: 'pollo', cantidad: 10n, importe: pesos(80_000), contraparteId: 'cliente-1' }),
      m({ tipo: 'cobro', importe: pesos(50_000), contraparteId: 'cliente-1' }),
    ]
    expect(deudaPorContraparte(movimientos).porContraparte.get('cliente-1')).toBe(pesos(30_000))
  })

  it('el cobro posterior de $30.000 la deja en cero y la saca del listado', () => {
    const movimientos = [
      m({ tipo: 'venta', refId: 'pollo', cantidad: 10n, importe: pesos(80_000), contraparteId: 'cliente-1' }),
      m({ tipo: 'cobro', importe: pesos(50_000), contraparteId: 'cliente-1' }),
      m({ tipo: 'cobro', importe: pesos(30_000), contraparteId: 'cliente-1' }),
    ]
    const { porContraparte, total } = deudaPorContraparte(movimientos)

    expect(porContraparte.has('cliente-1')).toBe(false)
    expect(total).toBe(0n)
  })
})

// --- §8 · Subtotales por rubro -----------------------------------------------

describe('§8 · Subtotales por rubro', () => {
  const m = secuencia()
  const movimientos = [
    m({ tipo: 'gasto', refId: 'alimento', importe: pesos(120_000) }),
    m({ tipo: 'gasto', refId: 'veterinaria', importe: pesos(45_000) }),
    m({ tipo: 'gasto', refId: 'infraestructura', importe: pesos(35_000) }),
  ]

  it('los subtotales son los importes y el total es $200.000', () => {
    const tabla = gastosPorRubro(movimientos)
    const porRubro = new Map(tabla.filas.map((f) => [f.refId, f]))

    expect(porRubro.get('alimento')?.centavos).toBe(pesos(120_000))
    expect(porRubro.get('veterinaria')?.centavos).toBe(pesos(45_000))
    expect(porRubro.get('infraestructura')?.centavos).toBe(pesos(35_000))
    expect(tabla.total).toBe(pesos(200_000))
  })

  it('las participaciones son 60,0%, 22,5% y 17,5%', () => {
    const porRubro = new Map(gastosPorRubro(movimientos).filas.map((f) => [f.refId, f]))

    expect(porRubro.get('alimento')?.participacion).toBe(60)
    expect(porRubro.get('veterinaria')?.participacion).toBe(22.5)
    expect(porRubro.get('infraestructura')?.participacion).toBe(17.5)
  })

  it('cada subtotal trae los movimientos que lo componen, para poder abrirlo (§6.6)', () => {
    const porRubro = new Map(gastosPorRubro(movimientos).filas.map((f) => [f.refId, f]))
    expect(porRubro.get('alimento')?.movimientoIds).toEqual(['m1'])
  })
})

// --- §8 · Incubadora ---------------------------------------------------------

describe('§8 · Incubadora', () => {
  const m = secuencia()
  const carga = [
    m({ tipo: 'carga_incubacion', tandaId: 'incubadora', cantidad: 1200n }),
    m({ tipo: 'nacimiento', tandaId: 'incubadora', cantidad: 912n }),
  ]

  it('1.200 huevos cargados y 912 nacidos dan 76,00% sobre cargados', () => {
    const tanda = calcular(carga).tandas.get('incubadora')!
    expect(rendimientoIncubacion(tanda).sobreCargados).toBe(76)
  })

  it('con 1.044 fértiles registrados, además 87,36% sobre fértiles', () => {
    const conFertiles = [...carga, m({ tipo: 'fertiles', tandaId: 'incubadora', cantidad: 1044n })]
    const tanda = calcular(conFertiles).tandas.get('incubadora')!
    expect(rendimientoIncubacion(tanda).sobreFertiles).toBe(87.36)
  })

  it('sin el dato de fértiles, ese porcentaje no se muestra', () => {
    const tanda = calcular(carga).tandas.get('incubadora')!
    expect(rendimientoIncubacion(tanda).sobreFertiles).toBeNull()
  })
})

// --- Reglas de §4 y §7 que los casos de §8 no cubren -------------------------

describe('§7 · El traslado arrastra el costo', () => {
  const m = secuencia()

  it('la tanda de destino arranca con lo que costó producir esos animales, no con cero', () => {
    const movimientos = [
      m({ tipo: 'carga_incubacion', tandaId: 'incubadora', cantidad: 1200n }),
      m({ tipo: 'gasto', tandaId: 'incubadora', refId: 'energia', importe: pesos(600_000) }),
      m({ tipo: 'nacimiento', tandaId: 'incubadora', cantidad: 912n }),
      m({ tipo: 'traslado', tandaId: 'incubadora', tandaDestinoId: 'engorde-a', cantidad: 400n }),
    ]
    const estado = calcular(movimientos)

    // 600.000 × 400 / 912 = 263.157,894…  → se imputa el entero de centavos
    expect(estado.tandas.get('engorde-a')?.costoCentavos).toBe(26_315_789n)
    expect(estado.tandas.get('engorde-a')?.animales).toBe(400n)

    // Lo que sale del origen es exactamente lo que entra al destino: sin fuga.
    const origen = estado.tandas.get('incubadora')!
    expect(origen.costoCentavos + 26_315_789n).toBe(pesos(600_000))
    expect(origen.animales).toBe(512n)
  })

  it('ir y volver entre dos tandas no cuelga el cálculo: el tiempo no tiene ciclos', () => {
    const movimientos = [
      m({ tipo: 'ingreso_animales', fecha: '2026-04-01', tandaId: 'reproductores', cantidad: 60n, importe: pesos(300_000) }),
      m({ tipo: 'traslado', fecha: '2026-04-10', tandaId: 'reproductores', tandaDestinoId: 'postura', cantidad: 50n }),
      m({ tipo: 'traslado', fecha: '2026-06-15', tandaId: 'postura', tandaDestinoId: 'reproductores', cantidad: 20n }),
    ]
    const estado = calcular(movimientos)

    expect(estado.tandas.get('reproductores')?.animales).toBe(30n)
    expect(estado.tandas.get('postura')?.animales).toBe(30n)

    // El costo total del sistema se conserva: no se crea ni se destruye al mover.
    const total = [...estado.tandas.values()].reduce((suma, t) => suma + t.costoCentavos, 0n)
    expect(total).toBe(pesos(300_000))
  })

  it('trasladar desde una tanda sin existencias no arrastra costo y deja aviso, pero no bloquea (§4)', () => {
    const movimientos = [m({ tipo: 'traslado', tandaId: 'vacia', tandaDestinoId: 'destino', cantidad: 5n })]
    const estado = calcular(movimientos)

    expect(estado.tandas.get('destino')?.costoCentavos).toBe(0n)
    expect(estado.tandas.get('destino')?.animales).toBe(5n)
    expect(estado.avisos.map((a) => a.clase)).toContain('traslado_sin_existencias')
  })
})

describe('Conejera: reproductores con nombre y camadas', () => {
  const m = secuencia()

  /**
   * El caso real: 4 madres y 1 padre, se faena una, nacen 8 gazapos.
   *
   * Los gazapos se anotan directamente en la tanda de cría, no en la conejera.
   * Eso evita el traslado y, con él, que el costo de los reproductores se
   * reparta entre las camadas: los padres son una inversión que se queda.
   */
  const movimientos = [
    m({ tipo: 'ingreso_animales', fecha: '2026-08-01', tandaId: 'conejera', cantidad: 5n, importe: pesos(150_000) }),
    m({ tipo: 'venta', fecha: '2026-08-10', tandaId: 'conejera', refId: 'faenado', cantidad: 1n, importe: pesos(18_000), contraparteId: 'cliente-1' }),
    m({ tipo: 'nacimiento', fecha: '2026-08-15', tandaId: 'gazapos', cantidad: 8n, animalId: 'coneja-negra' }),
    m({ tipo: 'nacimiento', fecha: '2026-09-20', tandaId: 'gazapos', cantidad: 6n, animalId: 'coneja-negra' }),
    m({ tipo: 'nacimiento', fecha: '2026-09-22', tandaId: 'gazapos', cantidad: 9n, animalId: 'coneja-blanca' }),
    m({ tipo: 'muerte', fecha: '2026-09-25', tandaId: 'gazapos', cantidad: 1n }),
  ]

  const catalogo: Catalogo = {
    productos: new Map([['faenado', { id: 'faenado', descuentaAnimales: true }]]),
  }

  it('faenar una madre baja el plantel de reproductores', () => {
    expect(calcular(movimientos, catalogo).tandas.get('conejera')?.animales).toBe(4n)
  })

  it('los gazapos se acumulan en su propia tanda', () => {
    // 8 + 6 + 9 − 1 = 22
    expect(calcular(movimientos, catalogo).tandas.get('gazapos')?.animales).toBe(22n)
  })

  it('anotar las crías en la tanda de cría deja intacto el costo de los reproductores', () => {
    // Sin traslado no hay arrastre: los $150.000 de los padres se quedan en la
    // conejera en vez de repartirse entre las camadas.
    const estado = calcular(movimientos, catalogo)
    expect(estado.tandas.get('conejera')?.costoCentavos).toBe(pesos(150_000))
    expect(estado.tandas.get('gazapos')?.costoCentavos).toBe(0n)
  })

  it('cada cría se le acredita a la madre que parió', () => {
    const animales = calcular(movimientos, catalogo).animales

    expect(animales.get('coneja-negra')?.nacidos).toBe(14n)
    expect(animales.get('coneja-negra')?.partos).toBe(2)
    expect(animales.get('coneja-negra')?.ultimoParto).toBe('2026-09-20')

    expect(animales.get('coneja-blanca')?.nacidos).toBe(9n)
    expect(animales.get('coneja-blanca')?.partos).toBe(1)
  })

  it('lo que se le cargó a una tanda no es lo mismo que su saldo cuando hubo traslados', () => {
    const m2 = secuencia()
    const estado = calcular([
      m2({ tipo: 'ingreso_animales', fecha: '2026-08-01', tandaId: 'conejera', cantidad: 12n, importe: pesos(100_000) }),
      m2({ tipo: 'gasto', fecha: '2026-08-05', tandaId: 'conejera', refId: 'alimento', importe: pesos(60_000) }),
      m2({ tipo: 'traslado', fecha: '2026-09-15', tandaId: 'conejera', tandaDestinoId: 'cria', cantidad: 8n }),
    ])

    // Se le cargaron $160.000, pero el traslado se llevó 8 de 12 animales con
    // su parte proporcional del costo. El saldo queda en un tercio.
    const cargado = estado.imputaciones
      .filter((i) => i.tandaId === 'conejera' && i.centavos > 0n)
      .reduce((s, i) => s + i.centavos, 0n)

    expect(cargado).toBe(pesos(160_000))
    // 16.000.000 × 8/12 = 10.666.666,67 → se arrastran 10.666.667 y quedan 5.333.333.
    expect(estado.tandas.get('conejera')?.costoCentavos).toBe(5_333_333n)

    // Los reportes que preguntan "qué parte del costo fue alimento" tienen que
    // dividir por lo cargado. Con el saldo darían más de 100%.
    expect(Number((pesos(60_000) * 100n) / cargado)).toBeLessThanOrEqual(100)
    expect(Number((pesos(60_000) * 100n) / estado.tandas.get('conejera')!.costoCentavos)).toBeGreaterThan(100)
  })

  it('un nacimiento sin madre indicada suma a la tanda igual, sin acreditárselo a nadie', () => {
    const m2 = secuencia()
    const estado = calcular([m2({ tipo: 'nacimiento', tandaId: 'gazapos', cantidad: 5n })])

    expect(estado.tandas.get('gazapos')?.animales).toBe(5n)
    expect(estado.animales.size).toBe(0)
  })
})

describe('Tres niveles: granja, lugar y tanda', () => {
  const m = secuencia()
  const movimientos = [
    // De la tanda: el alimento que comieron esos animales.
    m({ tipo: 'gasto', tandaId: 'parrilleros', unidadId: 'gallinero', refId: 'alimento', importe: pesos(80_000) }),
    // Del lugar: arreglar el techo no es de ninguna tanda en particular.
    m({ tipo: 'gasto', unidadId: 'gallinero', refId: 'infraestructura', importe: pesos(50_000) }),
    // De la granja: el contador no es de ningún lugar.
    m({ tipo: 'gasto', refId: 'otros', importe: pesos(20_000) }),
  ]

  const estado = calcular(movimientos)

  it('el gasto de una tanda va a la tanda, aunque venga con lugar', () => {
    expect(estado.tandas.get('parrilleros')?.costoCentavos).toBe(pesos(80_000))
  })

  it('el gasto de un lugar sin tanda queda en el lugar', () => {
    expect(estado.unidades.get('gallinero')?.costoCentavos).toBe(pesos(50_000))
  })

  it('no se cuenta dos veces: un gasto cae en un solo nivel', () => {
    // Si el gasto de la tanda también sumara al lugar, el total daría $130.000
    // en el gallinero y sumar todos los niveles contaría de más.
    expect(estado.unidades.get('gallinero')?.costoCentavos).not.toBe(pesos(130_000))
  })

  it('el gasto general no queda pegado a ningún lugar ni tanda', () => {
    expect(estado.unidades.size).toBe(1)
    expect(estado.tandas.size).toBe(1)
  })

  it('el costo de un lugar es lo suyo más lo de sus tandas', () => {
    // Es la suma que arma el reporte: 50.000 propios + 80.000 de la tanda.
    const propio = estado.unidades.get('gallinero')?.costoCentavos ?? 0n
    const deTandas = estado.tandas.get('parrilleros')?.costoCentavos ?? 0n
    expect(propio + deTandas).toBe(pesos(130_000))
  })

  it('cada gasto de lugar trae los movimientos que lo componen', () => {
    expect(estado.unidades.get('gallinero')?.movimientoIds).toHaveLength(1)
  })
})

describe('§3.2 y §4 · Retroactividad', () => {
  it('una compra cargada tarde con fecha vieja corrige el histórico', () => {
    const m = secuencia()
    const conFechaVieja = [
      m({ tipo: 'compra', fecha: '2026-03-10', refId: 'alimento', cantidad: 10n, importe: pesos(100_000) }),
      m({ tipo: 'entrega_insumo', fecha: '2026-03-20', refId: 'alimento', cantidad: 5n, tandaId: 'tanda-a' }),
      // Se carga última, pero con fecha anterior a la entrega: entra en su lugar.
      m({ tipo: 'compra', fecha: '2026-03-15', refId: 'alimento', cantidad: 10n, importe: pesos(140_000) }),
    ]
    const estado = calcular(conFechaVieja)

    // Al momento de la entrega hay 20 bolsas por $240.000 → $12.000 por bolsa.
    // Se entregan 5 → $60.000 imputados.
    expect(estado.imputaciones.find((i) => i.concepto === 'entrega_insumo')?.centavos).toBe(pesos(60_000))
    expect(estado.tandas.get('tanda-a')?.costoCentavos).toBe(pesos(60_000))
  })

  it('el resultado no depende del orden en que se carguen los movimientos', () => {
    const m1 = secuencia()
    const enOrden = [
      m1({ tipo: 'compra', fecha: '2026-03-01', refId: 'alimento', cantidad: 20n, importe: pesos(250_000), id: 'a' }),
      m1({ tipo: 'compra', fecha: '2026-03-05', refId: 'alimento', cantidad: 12n, importe: pesos(180_000), id: 'b' }),
      m1({ tipo: 'entrega_insumo', fecha: '2026-03-10', refId: 'alimento', cantidad: 8n, tandaId: 't', id: 'c' }),
    ]
    const alReves = [...enOrden].reverse()

    expect(calcular(alReves).depositos.get('alimento')).toEqual(calcular(enOrden).depositos.get('alimento'))
  })
})

describe('§4 · Ninguna validación bloquea una carga', () => {
  it('entregar más bolsas de las que hay se permite y se avisa', () => {
    const m = secuencia()
    const movimientos = [
      m({ tipo: 'compra', refId: 'alimento', cantidad: 5n, importe: pesos(50_000) }),
      m({ tipo: 'entrega_insumo', refId: 'alimento', cantidad: 8n, tandaId: 'tanda-a' }),
    ]
    const estado = calcular(movimientos)

    expect(estado.depositos.get('alimento')?.unidades).toBe(-3n)
    expect(estado.avisos.map((a) => a.clase)).toContain('deposito_en_descubierto')
  })

  it('registrar más muertes que existencias se permite y se avisa', () => {
    const m = secuencia()
    const estado = calcular([
      m({ tipo: 'ingreso_animales', tandaId: 'tanda-a', cantidad: 10n }),
      m({ tipo: 'muerte', tandaId: 'tanda-a', cantidad: 12n }),
    ])

    expect(estado.tandas.get('tanda-a')?.animales).toBe(-2n)
    expect(estado.avisos.map((a) => a.clase)).toContain('existencias_en_descubierto')
  })
})

describe('§3 · Nada se borra físicamente', () => {
  it('un movimiento anulado no participa de ningún cálculo', () => {
    const m = secuencia()
    const movimientos: Movimiento[] = [
      m({ tipo: 'compra', refId: 'alimento', cantidad: 10n, importe: pesos(100_000) }),
      { ...m({ tipo: 'compra', refId: 'alimento', cantidad: 99n, importe: pesos(999_000) }), eliminado: true },
    ]
    const estado = calcular(movimientos)

    expect(estado.depositos.get('alimento')?.unidades).toBe(10n)
    expect(estado.depositos.get('alimento')?.centavos).toBe(pesos(100_000))
  })
})

describe('Aritmética de dinero', () => {
  it('reparte sin perder centavos por redondeo', () => {
    // $1.000,00 entre 3: 33333 + 33333 + 33334 = 100000
    let restante = 100_000n
    let unidades = 3n
    const partes: bigint[] = []

    while (unidades > 0n) {
      const parte = repartirProporcional(restante, 1n, unidades)
      partes.push(parte)
      restante -= parte
      unidades -= 1n
    }

    expect(partes.reduce((s, p) => s + p, 0n)).toBe(100_000n)
  })

  it('no usa punto flotante: sobrevive a importes que romperían un double', () => {
    const enorme = 9_007_199_254_740_993n // 2^53 + 1, no representable como double
    expect(repartirProporcional(enorme, 1n, 1n)).toBe(enorme)
  })

  it('formatea pesos argentinos', () => {
    expect(formatearPesos(pesos(1_414_062.5))).toBe('1.414.062,50')
    expect(formatearPesos(-pesos(30_000))).toBe('-30.000,00')
    expect(formatearPesos(0n)).toBe('0,00')
  })
})
