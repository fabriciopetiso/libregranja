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
  readonly unidadId?: string
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

/**
 * La forma de la granja: quién está dentro de quién.
 *
 * El motor la necesita para sumar hacia arriba, y no puede deducirla de los
 * movimientos: que la tanda "Ponedoras" viva en "Gall 3" es data del catálogo.
 * Se la pasa como argumento para que el motor siga sin tocar la base.
 */
export interface Jerarquia {
  /** unidadId → unidadPadreId. Sin entrada = cuelga de la granja. */
  readonly lugarPadre: ReadonlyMap<string, string>
  /** tandaId → unidadId. Sin entrada = la tanda no está en ningún lugar. */
  readonly tandaEnLugar: ReadonlyMap<string, string>
  /** animalId → tandaId. */
  readonly animalEnTanda: ReadonlyMap<string, string>
}

export interface Catalogo {
  readonly productos: ReadonlyMap<string, Producto>
  readonly jerarquia?: Jerarquia
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
  readonly concepto:
    | 'entrega_insumo'
    | 'gasto'
    | 'ingreso_animales'
    | 'traslado_entrante'
    | 'traslado_saliente'
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

/**
 * Rendimiento de un animal con nombre.
 *
 * Sólo tiene sentido donde se sigue a los animales de a uno: seis conejas
 * madre, no novecientos pollos de engorde. Por eso se llena únicamente cuando
 * el movimiento trae `animalId`.
 */
export interface EstadoAnimal {
  /** Cuántas crías se le anotaron en total. */
  nacidos: bigint
  /** Cuántas veces parió: un movimiento de nacimiento es un parto. */
  partos: number
  ultimoParto: Fecha | null
}

/**
 * Lo imputado directamente a un lugar, sin pasar por una tanda.
 *
 * Es sólo lo propio del lugar —el techo, la luz, el alambrado—. Lo de sus
 * tandas se suma aparte, en el balance.
 */
export interface EstadoUnidad {
  costoCentavos: bigint
  movimientoIds: string[]
}

/**
 * Lo imputado a un animal con nombre: los medicamentos de Rambo.
 *
 * Se sigue por separado del costo de su tanda porque viaja distinto. Cuando el
 * animal se traslada, su costo va entero con él; cuando se vende o muere, sale
 * con él. El alimento que comieron todos, en cambio, se reparte proporcional.
 */
export interface CostoAnimal {
  costoCentavos: bigint
  movimientoIds: string[]
}

/**
 * Balance de un nivel: lo suyo propio y lo de todo lo que tiene adentro.
 *
 * `propio` es lo que se le imputó directamente. `total` incluye además lo de
 * los niveles de abajo. Un gasto cae en un solo nivel, así que sumar los
 * totales de los hijos nunca cuenta dos veces lo mismo.
 */
export interface Balance {
  readonly propioEgresos: bigint
  readonly propioIngresos: bigint
  readonly totalEgresos: bigint
  readonly totalIngresos: bigint
  readonly resultado: bigint
  readonly movimientoIds: readonly string[]
}

/** Ingresos imputados a un nivel: lo que se vendió desde ahí. */
export interface EstadoIngreso {
  centavos: bigint
  movimientoIds: string[]
}

export interface Estado {
  readonly depositos: ReadonlyMap<string, EstadoDeposito>
  readonly tandas: ReadonlyMap<string, EstadoTanda>
  readonly unidades: ReadonlyMap<string, EstadoUnidad>
  readonly animales: ReadonlyMap<string, EstadoAnimal>
  readonly costosDeAnimales: ReadonlyMap<string, CostoAnimal>
  /** Ventas por nivel: la clave es el id de la tanda, del lugar o del animal. */
  readonly ingresosPorNivel: ReadonlyMap<string, EstadoIngreso>
  /** Lo imputado a la granja entera, sin nivel más preciso. */
  readonly general: { egresos: bigint; ingresos: bigint; movimientoIds: string[] }
  readonly deudaPorContraparte: ReadonlyMap<string, bigint>
  readonly imputaciones: readonly Imputacion[]
  readonly avisos: readonly Aviso[]
}
