/**
 * Aritmética de dinero. Todo en centavos, todo en BigInt, nunca punto flotante.
 *
 * El costo unitario (por bolsa, por animal) NO se almacena: se deriva del par
 * (unidades, centavos) que lleva cada depósito o tanda. Eso permite que el costo
 * por bolsa valga $14.140,625 sin que exista jamás un valor fraccionario guardado.
 */

/** División con redondeo a la mitad hacia afuera del cero. Sin float. */
export function dividirRedondeando(numerador: bigint, denominador: bigint): bigint {
  if (denominador === 0n) throw new Error('división por cero')

  let n = numerador
  let d = denominador
  if (d < 0n) {
    n = -n
    d = -d
  }

  const negativo = n < 0n
  const abs = negativo ? -n : n
  const cociente = abs / d
  const resto = abs % d
  const redondeado = 2n * resto >= d ? cociente + 1n : cociente

  return negativo ? -redondeado : redondeado
}

/**
 * Reparte `total` en proporción a `parte / todo`.
 *
 * Es la operación central del sistema: imputa el costo de una entrega de insumo
 * sobre el depósito, y el costo arrastrado por un traslado sobre la tanda origen.
 *
 * Con `todo === 0n` devuelve 0: se puede entregar de un depósito vacío o trasladar
 * desde una tanda sin existencias (§4 no bloquea cargas), y en ese caso no hay
 * costo que arrastrar. El aviso lo emite quien llama.
 */
export function repartirProporcional(total: bigint, parte: bigint, todo: bigint): bigint {
  if (todo === 0n) return 0n
  return dividirRedondeando(total * parte, todo)
}

/** Formatea centavos como pesos argentinos: 1343750n → "13.437,50" */
export function formatearPesos(centavos: bigint): string {
  const negativo = centavos < 0n
  const abs = negativo ? -centavos : centavos
  const enteros = abs / 100n
  const decimales = abs % 100n

  const grupos = enteros.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const coma = decimales.toString().padStart(2, '0')

  return `${negativo ? '-' : ''}${grupos},${coma}`
}

/**
 * Costo unitario derivado, en centavos, como número decimal para mostrar.
 *
 * Devuelve `null` cuando no hay unidades: sin existencias no hay costo unitario,
 * y estimarlo sería inventar un dato (§10).
 */
export function costoUnitario(centavos: bigint, unidades: bigint): number | null {
  if (unidades === 0n) return null
  return Number(centavos) / Number(unidades)
}

/** Porcentaje con `decimales` cifras, para mostrar. No es dinero: acá el float es correcto. */
export function porcentaje(parte: bigint, total: bigint, decimales = 2): number | null {
  if (total === 0n) return null
  const factor = 10 ** decimales
  return Math.round((Number(parte) / Number(total)) * 100 * factor) / factor
}
