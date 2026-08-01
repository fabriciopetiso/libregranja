/**
 * Dinero en el navegador. Mismas reglas que en el servidor: enteros, sin float.
 *
 * Lo que la persona escribe ("12.500,50") se convierte a centavos parseando el
 * texto, no multiplicando por 100 un número decimal. `12500.5 * 100` puede dar
 * 1250049.9999999998; acá eso no puede pasar.
 */

/** Texto en pesos → centavos. Acepta "12.500,50", "12500,5", "12500" y "12500.50". */
export function aCentavos(texto: string): bigint | null {
  const limpio = texto.trim().replace(/\s/g, '')
  if (limpio === '') return null

  // Si tiene coma, la coma es el separador decimal y los puntos son de miles.
  // Si no tiene coma, un punto solo con 1 o 2 dígitos detrás es decimal.
  let normalizado: string
  if (limpio.includes(',')) {
    normalizado = limpio.replace(/\./g, '').replace(',', '.')
  } else if (/\.\d{1,2}$/.test(limpio)) {
    normalizado = limpio
  } else {
    normalizado = limpio.replace(/\./g, '')
  }

  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null

  const negativo = normalizado.startsWith('-')
  const sinSigno = negativo ? normalizado.slice(1) : normalizado
  const [entera = '0', decimal = ''] = sinSigno.split('.')
  const centavos = BigInt(entera) * 100n + BigInt((decimal + '00').slice(0, 2))

  return negativo ? -centavos : centavos
}

/** Centavos → "12.500,50". La API los manda como string. */
export function pesos(centavos: bigint | string | null | undefined): string {
  if (centavos === null || centavos === undefined) return '—'
  const valor = typeof centavos === 'string' ? BigInt(centavos) : centavos

  const negativo = valor < 0n
  const abs = negativo ? -valor : valor
  const enteros = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  const resto = (abs % 100n).toString().padStart(2, '0')

  return `${negativo ? '-' : ''}$${enteros},${resto}`
}

/** Igual que `pesos` pero admite fracciones de centavo, para costos unitarios derivados. */
export function pesosExactos(centavos: number | null): string {
  if (centavos === null) return '—'
  return `$${(centavos / 100).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 3 })}`
}

export function entero(valor: bigint | string | null | undefined): string {
  if (valor === null || valor === undefined) return '—'
  return (typeof valor === 'string' ? BigInt(valor) : valor).toString()
}

export function hoy(): string {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mes}-${dia}`
}

/** Primer y último día del mes en curso: el rango por defecto de §6. */
export function mesEnCurso(): { desde: string; hasta: string } {
  const d = new Date()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const ultimo = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  return {
    desde: `${d.getFullYear()}-${mes}-01`,
    hasta: `${d.getFullYear()}-${mes}-${String(ultimo).padStart(2, '0')}`,
  }
}
