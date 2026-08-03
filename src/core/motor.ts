/**
 * El motor. Una sola pasada cronológica sobre todos los movimientos de la granja.
 *
 * Por qué una sola pasada y no un cálculo por tanda: el costo de una tanda puede
 * depender del costo de otra (un traslado arrastra costo, §7). Calcular tanda por
 * tanda obligaría a resolver un grafo de dependencias y a detectar ciclos, porque
 * mover animales de ida y de vuelta entre dos tandas es normal en una granja.
 *
 * Recorriendo todos los movimientos juntos en orden de fecha, el problema no
 * existe: cuando la pasada llega a un traslado, el estado de la tanda origen a esa
 * fecha ya está calculado. El orden correcto de cálculo es el orden cronológico, y
 * el tiempo no tiene ciclos.
 *
 * Nada de lo que se calcula acá se guarda (§4). Cargar un movimiento con fecha
 * retroactiva corrige el histórico solo, porque entra en su lugar en la pasada.
 */

import { repartirProporcional } from './dinero.js'
import type {
  Aviso,
  Catalogo,
  CostoAnimal,
  Estado,
  EstadoAnimal,
  EstadoDeposito,
  EstadoIngreso,
  EstadoTanda,
  EstadoUnidad,
  Imputacion,
  Movimiento,
} from './tipos.js'

const CATALOGO_VACIO: Catalogo = { productos: new Map() }

/**
 * Orden canónico de los movimientos: fecha, después momento de carga, después id.
 *
 * El id desempata para que el resultado sea determinista aun con dos movimientos
 * cargados en el mismo milisegundo. Sin eso, dos consultas podrían dar distinto.
 */
export function ordenCanonico(a: Movimiento, b: Movimiento): number {
  if (a.fecha !== b.fecha) return a.fecha < b.fecha ? -1 : 1
  if (a.creadoEn !== b.creadoEn) return a.creadoEn < b.creadoEn ? -1 : 1
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

function depositoNuevo(): EstadoDeposito {
  return { unidades: 0n, centavos: 0n }
}

function tandaNueva(): EstadoTanda {
  return {
    animales: 0n,
    costoCentavos: 0n,
    huevosCargados: 0n,
    huevosDescartados: 0n,
    huevosFertiles: 0n,
    registrosFertiles: 0,
    nacidos: 0n,
    huevosRecolectados: 0n,
    huevosDisponibles: 0n,
  }
}

function unidadNueva(): EstadoUnidad {
  return { costoCentavos: 0n, movimientoIds: [] }
}

function animalNuevo(): EstadoAnimal {
  return { nacidos: 0n, partos: 0, ultimoParto: null }
}

function costoAnimalNuevo(): CostoAnimal {
  return { costoCentavos: 0n, movimientoIds: [] }
}

function ingresoNuevo(): EstadoIngreso {
  return { centavos: 0n, movimientoIds: [] }
}

function obtener<T>(mapa: Map<string, T>, clave: string, crear: () => T): T {
  let valor = mapa.get(clave)
  if (valor === undefined) {
    valor = crear()
    mapa.set(clave, valor)
  }
  return valor
}

export function calcular(movimientos: readonly Movimiento[], catalogo: Catalogo = CATALOGO_VACIO): Estado {
  const depositos = new Map<string, EstadoDeposito>()
  const tandas = new Map<string, EstadoTanda>()
  const unidades = new Map<string, EstadoUnidad>()
  const animales = new Map<string, EstadoAnimal>()
  const costosDeAnimales = new Map<string, CostoAnimal>()
  const ingresosPorNivel = new Map<string, EstadoIngreso>()
  const general = { egresos: 0n, ingresos: 0n, movimientoIds: [] as string[] }
  const deudaPorContraparte = new Map<string, bigint>()
  const imputaciones: Imputacion[] = []
  const avisos: Aviso[] = []

  const vigentes = movimientos.filter((m) => !m.eliminado)
  const ordenados = [...vigentes].sort(ordenCanonico)

  const imputar = (
    mov: Movimiento,
    tandaId: string,
    centavos: bigint,
    concepto: Imputacion['concepto'],
  ): void => {
    const tanda = obtener(tandas, tandaId, tandaNueva)
    tanda.costoCentavos += centavos
    imputaciones.push({
      movimientoId: mov.id,
      tandaId,
      centavos,
      concepto,
      ...(mov.refId !== undefined ? { refId: mov.refId } : {}),
    })
  }

  /**
   * Saca `cantidad` unidades del depósito e imputa lo que valían.
   *
   * Imputa `repartir(centavos, cantidad, unidades)` y resta del acumulado ese mismo
   * entero, no una reconstrucción a partir de un costo unitario redondeado. Así la
   * suma de imputaciones más el saldo del depósito siempre iguala a las compras, al
   * centavo, aunque el costo por bolsa tenga fracciones.
   */
  const entregar = (mov: Movimiento, insumoId: string, cantidad: bigint, tandaId: string): void => {
    const deposito = obtener(depositos, insumoId, depositoNuevo)
    const imputado = repartirProporcional(deposito.centavos, cantidad, deposito.unidades)

    deposito.unidades -= cantidad
    deposito.centavos -= imputado
    imputar(mov, tandaId, imputado, 'entrega_insumo')

    if (deposito.unidades < 0n) {
      avisos.push({
        movimientoId: mov.id,
        clase: 'deposito_en_descubierto',
        detalle: `El depósito del insumo ${insumoId} queda en ${deposito.unidades} unidades. Falta registrar una compra anterior.`,
      })
    }
  }

  for (const mov of ordenados) {
    const importe = mov.importe ?? 0n

    switch (mov.tipo) {
      case 'compra': {
        if (mov.refId === undefined) break
        const deposito = obtener(depositos, mov.refId, depositoNuevo)
        deposito.unidades += mov.cantidad
        deposito.centavos += importe

        // Una compra imputada directo a una tanda es una compra seguida de su
        // entrega. Se modela así para que exista una sola regla de costeo.
        if (mov.tandaId !== undefined) {
          entregar(mov, mov.refId, mov.cantidad, mov.tandaId)
        }
        break
      }

      case 'entrega_insumo': {
        if (mov.refId === undefined || mov.tandaId === undefined) break
        entregar(mov, mov.refId, mov.cantidad, mov.tandaId)
        break
      }

      /**
       * Un gasto cae en el nivel más preciso que traiga —animal, tanda, lugar—
       * y si no trae ninguno queda a nombre de la granja. Nunca en dos a la vez:
       * de eso depende que sumar los niveles de arriba no cuente dos veces.
       *
       * Lo imputado a un animal se sigue aparte del costo de su tanda, porque
       * viaja distinto: los medicamentos de Rambo van con Rambo, el alimento que
       * comieron todos se reparte.
       */
      case 'gasto': {
        if (mov.animalId !== undefined) {
          const costo = obtener(costosDeAnimales, mov.animalId, costoAnimalNuevo)
          costo.costoCentavos += importe
          costo.movimientoIds.push(mov.id)
        } else if (mov.tandaId !== undefined) {
          imputar(mov, mov.tandaId, importe, 'gasto')
        } else if (mov.unidadId !== undefined) {
          const unidad = obtener(unidades, mov.unidadId, unidadNueva)
          unidad.costoCentavos += importe
          unidad.movimientoIds.push(mov.id)
        } else {
          general.egresos += importe
          general.movimientoIds.push(mov.id)
        }
        break
      }

      /**
       * Una venta suma deuda, baja existencias si el producto lo pide, y además
       * imputa su importe al nivel del que salió. Sin eso, un lugar sabría cuánto
       * costó pero no cuánto dio, que es la pregunta que importa.
       *
       * Vender un animal con nombre además le saca su costo: se va con él.
       */
      case 'venta': {
        if (mov.contraparteId !== undefined) {
          deudaPorContraparte.set(mov.contraparteId, (deudaPorContraparte.get(mov.contraparteId) ?? 0n) + importe)
        }

        const nivel = mov.animalId ?? mov.tandaId ?? mov.unidadId
        if (nivel === undefined) {
          general.ingresos += importe
          general.movimientoIds.push(mov.id)
        } else {
          const ingreso = obtener(ingresosPorNivel, nivel, ingresoNuevo)
          ingreso.centavos += importe
          ingreso.movimientoIds.push(mov.id)
        }

        if (mov.animalId !== undefined) {
          const costo = costosDeAnimales.get(mov.animalId)
          if (costo !== undefined) {
            costo.costoCentavos = 0n
          }
        }
        // Vender siempre saca algo del stock de esa tanda: un pollo entero baja
        // un animal, una docena de huevos baja doce huevos.
        const producto = mov.refId !== undefined ? catalogo.productos.get(mov.refId) : undefined
        if (producto !== undefined && mov.tandaId !== undefined) {
          const tanda = obtener(tandas, mov.tandaId, tandaNueva)

          if (producto.descuenta === 'animales') {
            tanda.animales -= mov.cantidad
            if (tanda.animales < 0n) {
              avisos.push({
                movimientoId: mov.id,
                clase: 'existencias_en_descubierto',
                detalle: `La tanda ${mov.tandaId} queda en ${tanda.animales} animales.`,
              })
            }
          } else {
            tanda.huevosDisponibles -= mov.cantidad
            if (tanda.huevosDisponibles < 0n) {
              avisos.push({
                movimientoId: mov.id,
                clase: 'huevos_en_descubierto',
                detalle: `La tanda ${mov.tandaId} queda en ${tanda.huevosDisponibles} huevos. Falta registrar una recolección anterior.`,
              })
            }
          }
        }
        break
      }

      case 'cobro': {
        if (mov.contraparteId !== undefined) {
          deudaPorContraparte.set(mov.contraparteId, (deudaPorContraparte.get(mov.contraparteId) ?? 0n) - importe)
        }
        break
      }

      // Un pago a proveedor no toca la deuda de una contraparte, que §4 define
      // como ventas − cobros. Queda registrado para el flujo de caja.
      case 'pago':
        break

      case 'ingreso_animales': {
        if (mov.tandaId === undefined) break
        const tanda = obtener(tandas, mov.tandaId, tandaNueva)
        tanda.animales += mov.cantidad
        if (importe !== 0n) imputar(mov, mov.tandaId, importe, 'ingreso_animales')
        break
      }

      /**
       * Un nacimiento suma a la tanda donde se registra, que no tiene por qué
       * ser la de la madre: si los gazapos nacen ya anotados en la tanda de
       * cría, no hace falta después trasladarlos, y el costo de los
       * reproductores no se reparte entre las camadas.
       *
       * Con `animalId` se le anota además a la madre, para saber cuál rinde.
       */
      case 'nacimiento': {
        if (mov.tandaId === undefined) break
        const tanda = obtener(tandas, mov.tandaId, tandaNueva)
        tanda.animales += mov.cantidad
        tanda.nacidos += mov.cantidad

        if (mov.animalId !== undefined) {
          const madre = obtener(animales, mov.animalId, animalNuevo)
          madre.nacidos += mov.cantidad
          madre.partos += 1
          madre.ultimoParto = mov.fecha
        }
        break
      }

      case 'muerte': {
        if (mov.tandaId === undefined) break
        const tanda = obtener(tandas, mov.tandaId, tandaNueva)
        tanda.animales -= mov.cantidad
        if (tanda.animales < 0n) {
          avisos.push({
            movimientoId: mov.id,
            clase: 'existencias_en_descubierto',
            detalle: `La tanda ${mov.tandaId} queda en ${tanda.animales} animales. Falta registrar un ingreso anterior.`,
          })
        }
        break
      }

      case 'traslado': {
        if (mov.tandaId === undefined || mov.tandaDestinoId === undefined) break
        const origen = obtener(tandas, mov.tandaId, tandaNueva)

        // El costo viaja con los animales, en proporción a cuántos se van sobre
        // los que había en ese momento. Es la única regla que no obliga al usuario
        // a cargar un dato más.
        const arrastrado = repartirProporcional(origen.costoCentavos, mov.cantidad, origen.animales)

        if (origen.animales === 0n) {
          avisos.push({
            movimientoId: mov.id,
            clase: 'traslado_sin_existencias',
            detalle: `La tanda ${mov.tandaId} no tiene existencias registradas: el traslado no arrastra costo.`,
          })
        }

        origen.animales -= mov.cantidad
        origen.costoCentavos -= arrastrado
        imputaciones.push({
          movimientoId: mov.id,
          tandaId: mov.tandaId,
          centavos: -arrastrado,
          concepto: 'traslado_saliente',
        })

        const destino = obtener(tandas, mov.tandaDestinoId, tandaNueva)
        destino.animales += mov.cantidad
        destino.costoCentavos += arrastrado
        imputaciones.push({
          movimientoId: mov.id,
          tandaId: mov.tandaDestinoId,
          centavos: arrastrado,
          concepto: 'traslado_entrante',
        })

        if (origen.animales < 0n) {
          avisos.push({
            movimientoId: mov.id,
            clase: 'existencias_en_descubierto',
            detalle: `La tanda ${mov.tandaId} queda en ${origen.animales} animales.`,
          })
        }
        break
      }

      /**
       * El recuento guarda lo que se contó, no la diferencia (§5.3).
       *
       * Es un set-point: a partir de acá las existencias son las contadas. Guardar
       * el delta lo dejaría mintiendo en cuanto entrara un movimiento retroactivo
       * anterior al recuento. La diferencia se deriva y se muestra; no se persiste.
       */
      case 'recuento': {
        if (mov.tandaId === undefined) break
        const tanda = obtener(tandas, mov.tandaId, tandaNueva)
        tanda.animales = mov.cantidad
        break
      }

      /**
       * Cargar la incubadora.
       *
       * Con `tandaDestinoId`, los huevos salen de la tanda de ponedoras y entran
       * a la incubadora: es un traslado de huevos, no una aparición. Sin él,
       * `tandaId` es la incubadora y los huevos vinieron de afuera —comprados, o
       * de antes de empezar a usar la app—.
       */
      case 'carga_incubacion': {
        // Huevos comprados o de antes de usar la app: entran a la incubadora
        // sin salir del stock de nadie.
        if (mov.tandaId === undefined) {
          if (mov.tandaDestinoId !== undefined) {
            obtener(tandas, mov.tandaDestinoId, tandaNueva).huevosCargados += mov.cantidad
          }
          break
        }

        if (mov.tandaDestinoId !== undefined) {
          const origen = obtener(tandas, mov.tandaId, tandaNueva)
          origen.huevosDisponibles -= mov.cantidad
          if (origen.huevosDisponibles < 0n) {
            avisos.push({
              movimientoId: mov.id,
              clase: 'huevos_en_descubierto',
              detalle: `La tanda ${mov.tandaId} queda en ${origen.huevosDisponibles} huevos.`,
            })
          }
          obtener(tandas, mov.tandaDestinoId, tandaNueva).huevosCargados += mov.cantidad
        } else {
          obtener(tandas, mov.tandaId, tandaNueva).huevosCargados += mov.cantidad
        }
        break
      }

      /**
       * Ovoscopía, alrededor del día 18: se miran los huevos a trasluz y se
       * descartan los que no tienen embrión o lo tienen muerto. Los que quedan
       * son los que pasan a la nacedora.
       *
       * No se restan de los cargados: cargados es lo que entró, y el descarte
       * es parte del resultado de esa incubación.
       */
      case 'descarte_incubacion': {
        if (mov.tandaId === undefined) break
        obtener(tandas, mov.tandaId, tandaNueva).huevosDescartados += mov.cantidad
        break
      }

      case 'fertiles': {
        if (mov.tandaId === undefined) break
        const tanda = obtener(tandas, mov.tandaId, tandaNueva)
        tanda.huevosFertiles += mov.cantidad
        tanda.registrosFertiles += 1
        break
      }

      /** Recolección diaria: suma a lo juntado y a lo disponible. */
      case 'huevos': {
        if (mov.tandaId === undefined) break
        const tanda = obtener(tandas, mov.tandaId, tandaNueva)
        tanda.huevosRecolectados += mov.cantidad
        tanda.huevosDisponibles += mov.cantidad
        break
      }

      /** Huevos que salen sin venderse: rotos, o consumidos en casa. */
      case 'salida_huevos': {
        if (mov.tandaId === undefined) break
        const tanda = obtener(tandas, mov.tandaId, tandaNueva)
        tanda.huevosDisponibles -= mov.cantidad
        if (tanda.huevosDisponibles < 0n) {
          avisos.push({
            movimientoId: mov.id,
            clase: 'huevos_en_descubierto',
            detalle: `La tanda ${mov.tandaId} queda en ${tanda.huevosDisponibles} huevos.`,
          })
        }
        break
      }

      // El peso no altera ningún saldo: se consulta sobre los movimientos.
      case 'peso':
        break

      default:
        avisos.push({
          movimientoId: mov.id,
          clase: 'tipo_desconocido',
          detalle: `Tipo de movimiento "${mov.tipo}" no interpretado por el motor.`,
        })
    }
  }

  return {
    depositos,
    tandas,
    unidades,
    animales,
    costosDeAnimales,
    ingresosPorNivel,
    general,
    deudaPorContraparte,
    imputaciones,
    avisos,
  }
}
