/**
 * Tipos del dominio.
 *
 * Regla que manda sobre todo lo demás (§2, §10): acá no se nombra ninguna
 * categoría, especie, alimento, producto, rubro ni plantilla concreta. Todo eso
 * es data que el usuario crea desde la app.
 */

/** Fecha calendario 'AAAA-MM-DD', sin hora ni zona. */
export type Fecha = string

/**
 * Tipos de movimiento conocidos por el motor.
 *
 * La lista es abierta a propósito: `TipoMovimiento` incluye `string` para que
 * agregar un tipo nuevo no obligue a tocar el esquema (§3.2). El motor ignora
 * los tipos que no sabe interpretar y deja un aviso, en vez de romper.
 *
 * `fertiles` no está en la lista original de §3.2: se agregó para registrar los
 * huevos fértiles de una carga de incubación (§7) usando el mecanismo que la
 * propia spec prevé, en lugar de sumarle un campo al esquema.
 */
export type TipoConocido =
  | 'compra'
  | 'gasto'
  | 'entrega_insumo'
  | 'venta'
  | 'cobro'
  | 'pago'
  | 'ingreso_animales'
  | 'nacimiento'
  | 'muerte'
  | 'traslado'
  | 'recuento'
  | 'carga_incubacion'
  | 'fertiles'
  | 'huevos'
  | 'peso'

export type TipoMovimiento = TipoConocido | (string & {})

/**
 * La tabla central. Todo pasa por acá (§3.2).
 *
 * `cantidad` es un entero en la unidad base de aquello a lo que se refiere:
 * bolsas, unidades, animales, huevos, o gramos cuando se trata de peso o de un
 * producto que se vende por kilo. Nunca fraccionario: las bolsas son enteras.
 *
 * `importe` son centavos. Siempre el total pagado o cobrado, nunca un unitario.
 */
export interface Movimiento {
  readonly id: string
  readonly granjaId: string
  readonly fecha: Fecha
  readonly creadoEn: string
  readonly tipo: TipoMovimiento
  readonly cantidad: bigint
  readonly importe?: bigint
  readonly tandaId?: string
  readonly refId?: string
  readonly contraparteId?: string
  readonly tandaDestinoId?: string
  readonly animalId?: string
  readonly motivo?: string
  readonly fotoId?: string
  readonly eliminado: boolean
}

/** Lo único del catálogo que el motor necesita para calcular. */
export interface Producto {
  readonly id: string
  readonly descuentaAnimales: boolean
}

export interface Catalogo {
  readonly productos: ReadonlyMap<string, Producto>
}

/** Estado de un insumo en el depósito. El costo por bolsa es el cociente, no un campo. */
export interface EstadoDeposito {
  unidades: bigint
  centavos: bigint
}

export interface EstadoTanda {
  animales: bigint
  costoCentavos: bigint
  huevosCargados: bigint
  huevosFertiles: bigint
  /** Cuántas veces se registraron fértiles. Si es 0, el porcentaje sobre fértiles no se muestra (§7). */
  registrosFertiles: number
  nacidos: bigint
  huevosRecolectados: bigint
}

/** Un peso imputado a una tanda, con el movimiento que lo originó. Sostiene el drill-down de §6.6. */
export interface Imputacion {
  readonly movimientoId: string
  readonly tandaId: string
  readonly centavos: bigint
  readonly concepto: 'entrega_insumo' | 'gasto' | 'ingreso_animales' | 'traslado_entrante' | 'traslado_saliente'
  readonly refId?: string
}

/**
 * Algo que no cierra pero que no bloqueó la carga (§4).
 * "Falta un registro anterior, no sobra este."
 */
export interface Aviso {
  readonly movimientoId: string
  readonly clase: 'deposito_en_descubierto' | 'existencias_en_descubierto' | 'traslado_sin_existencias' | 'tipo_desconocido'
  readonly detalle: string
}

export interface Estado {
  readonly depositos: ReadonlyMap<string, EstadoDeposito>
  readonly tandas: ReadonlyMap<string, EstadoTanda>
  readonly deudaPorContraparte: ReadonlyMap<string, bigint>
  readonly imputaciones: readonly Imputacion[]
  readonly avisos: readonly Aviso[]
}
