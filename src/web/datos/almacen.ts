/**
 * La base de datos, en el teléfono.
 *
 * IndexedDB en crudo, sin librería: son tres almacenes y media docena de
 * operaciones. Traer una dependencia de 30 KB para esto sería pagar de más.
 *
 * Por qué IndexedDB y no SQLite en WASM: el motor de cálculo no necesita SQL.
 * Recibe todos los movimientos y los recorre en memoria, así que lo único que
 * hace falta es guardarlos y devolverlos. Un megabyte de WASM bajando a cada
 * teléfono no compraría nada.
 *
 * Los movimientos son un conjunto que sólo crece: se agregan y se anulan, nunca
 * se editan. Eso hace que dos teléfonos que intercambian lo que tienen lleguen
 * exactamente al mismo estado, sin importar el orden ni cuántas veces
 * sincronicen. Es lo que hace posible el P2P sin resolver conflictos.
 */

const BASE = 'libregranja'
const VERSION = 1

export const MOVIMIENTOS = 'movimientos'
export const CATALOGO = 'catalogo'
export const META = 'meta'

let conexion: Promise<IDBDatabase> | null = null

function abrir(): Promise<IDBDatabase> {
  if (conexion !== null) return conexion

  conexion = new Promise((resolver, rechazar) => {
    const pedido = indexedDB.open(BASE, VERSION)

    pedido.onupgradeneeded = () => {
      const base = pedido.result

      if (!base.objectStoreNames.contains(MOVIMIENTOS)) {
        const store = base.createObjectStore(MOVIMIENTOS, { keyPath: 'id' })
        // El motor lee en orden (fecha, creadoEn, id); el índice evita ordenar
        // en memoria cada vez.
        store.createIndex('granja_fecha', ['granjaId', 'fecha'])
      }

      if (!base.objectStoreNames.contains(CATALOGO)) {
        const store = base.createObjectStore(CATALOGO, { keyPath: 'id' })
        store.createIndex('granja_tabla', ['granjaId', 'tabla'])
      }

      if (!base.objectStoreNames.contains(META)) {
        base.createObjectStore(META, { keyPath: 'clave' })
      }
    }

    pedido.onsuccess = () => resolver(pedido.result)
    pedido.onerror = () => rechazar(pedido.error ?? new Error('no se pudo abrir la base'))
  })

  return conexion
}

function esperar<T>(pedido: IDBRequest<T>): Promise<T> {
  return new Promise((resolver, rechazar) => {
    pedido.onsuccess = () => resolver(pedido.result)
    pedido.onerror = () => rechazar(pedido.error ?? new Error('falló la operación'))
  })
}

/** Todo lo de un almacén que pertenezca a una granja. */
export async function leerTodo<T extends { granjaId: string }>(almacen: string, granjaId: string): Promise<T[]> {
  const base = await abrir()
  const tx = base.transaction(almacen, 'readonly')
  const filas = await esperar<T[]>(tx.objectStore(almacen).getAll() as IDBRequest<T[]>)
  return filas.filter((f) => f.granjaId === granjaId)
}

export async function leerUno<T>(almacen: string, id: string): Promise<T | null> {
  const base = await abrir()
  const tx = base.transaction(almacen, 'readonly')
  const fila = await esperar<T | undefined>(tx.objectStore(almacen).get(id) as IDBRequest<T | undefined>)
  return fila ?? null
}

/**
 * Guarda una fila. Si el id ya existe la reemplaza.
 *
 * Para los movimientos eso es exactamente lo que hace falta: recibir dos veces
 * el mismo movimiento —porque se reintentó, o porque llegó de otro teléfono—
 * tiene que dejar la base igual, no duplicar nada.
 */
export async function guardar<T>(almacen: string, fila: T): Promise<T> {
  const base = await abrir()
  const tx = base.transaction(almacen, 'readwrite')
  tx.objectStore(almacen).put(fila)
  await new Promise<void>((resolver, rechazar) => {
    tx.oncomplete = () => resolver()
    tx.onerror = () => rechazar(tx.error ?? new Error('no se pudo guardar'))
  })
  return fila
}

/** Guarda muchas filas de una. Es lo que usa la sincronización al recibir. */
export async function guardarVarias<T>(almacen: string, filas: readonly T[]): Promise<number> {
  if (filas.length === 0) return 0

  const base = await abrir()
  const tx = base.transaction(almacen, 'readwrite')
  const store = tx.objectStore(almacen)
  for (const fila of filas) store.put(fila)

  await new Promise<void>((resolver, rechazar) => {
    tx.oncomplete = () => resolver()
    tx.onerror = () => rechazar(tx.error ?? new Error('no se pudieron guardar'))
  })

  return filas.length
}

export async function leerMeta<T>(clave: string): Promise<T | null> {
  const fila = await leerUno<{ clave: string; valor: T }>(META, clave)
  return fila?.valor ?? null
}

export async function guardarMeta<T>(clave: string, valor: T): Promise<void> {
  await guardar(META, { clave, valor })
}

/** Cuántas filas hay, para saber si el teléfono ya tiene datos. */
export async function contar(almacen: string): Promise<number> {
  const base = await abrir()
  const tx = base.transaction(almacen, 'readonly')
  return esperar(tx.objectStore(almacen).count())
}

/** Borra todo. Sólo para empezar de cero a propósito. */
export async function vaciar(): Promise<void> {
  const base = await abrir()
  const tx = base.transaction([MOVIMIENTOS, CATALOGO, META], 'readwrite')
  tx.objectStore(MOVIMIENTOS).clear()
  tx.objectStore(CATALOGO).clear()
  tx.objectStore(META).clear()
  await new Promise<void>((resolver, rechazar) => {
    tx.oncomplete = () => resolver()
    tx.onerror = () => rechazar(tx.error ?? new Error('no se pudo vaciar'))
  })
}
