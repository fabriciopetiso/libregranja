/**
 * Cliente de la API y cola de reintento.
 *
 * La app se usa con conexión, pero en un galpón la señal se corta justo cuando
 * apretás "guardar". Un movimiento que no llegó al servidor queda en una cola
 * local y se reintenta solo. No es sincronización offline: es no perder una
 * carga que la persona ya hizo.
 *
 * Los ids se generan acá, en el navegador, para que reintentar no duplique: el
 * servidor ignora un id que ya tiene.
 */

const PENDIENTES = 'libregranja.pendientes'

export interface Sesion {
  id: string
  granjaId: string
  nombre: string
  usuario: string
  rol: 'admin' | 'operador'
}

export class ErrorApi extends Error {
  constructor(
    message: string,
    readonly estado: number,
  ) {
    super(message)
  }
}

async function pedir<T>(ruta: string, opciones: RequestInit = {}): Promise<T> {
  const respuesta = await fetch(`/api/v1${ruta}`, {
    ...opciones,
    headers: { 'content-type': 'application/json', ...opciones.headers },
    credentials: 'same-origin',
  })

  if (!respuesta.ok) {
    const cuerpo = (await respuesta.json().catch(() => ({}))) as { error?: string }
    throw new ErrorApi(cuerpo.error ?? `error ${respuesta.status}`, respuesta.status)
  }

  return (await respuesta.json()) as T
}

export const api = {
  entrar: (usuario: string, clave: string) =>
    pedir<{ usuario: Sesion }>('/sesion', { method: 'POST', body: JSON.stringify({ usuario, clave }) }),

  salir: () => pedir<{ ok: true }>('/sesion', { method: 'DELETE' }),

  yo: () => pedir<{ usuario: Sesion }>('/yo'),

  listar: <T = Registro>(tabla: string) => pedir<T[]>(`/catalogo/${tabla}`),

  crear: <T = Registro>(tabla: string, datos: unknown) =>
    pedir<T>(`/catalogo/${tabla}`, { method: 'POST', body: JSON.stringify(datos) }),

  anular: (tabla: string, id: string) => pedir<{ ok: true }>(`/catalogo/${tabla}/${id}`, { method: 'DELETE' }),

  movimientos: () => pedir<MovimientoApi[]>('/movimientos'),

  anularMovimiento: (id: string, motivo?: string) =>
    pedir<{ ok: true }>(`/movimientos/${id}`, { method: 'DELETE', body: JSON.stringify({ motivo }) }),

  estado: () => pedir<EstadoApi>('/estado'),

  animales: () => pedir<AnimalApi[]>('/animales'),

  alimento: () => pedir<FilaAlimento[]>('/reportes/alimento'),

  rubros: (r?: RangoQuery) => pedir<TablaApi>(`/reportes/rubros${consulta(r)}`),

  ventas: (r?: RangoQuery) => pedir<RespuestaVentas>(`/reportes/ventas${consulta(r)}`),

  resultado: (r?: RangoQuery) =>
    pedir<{ ventas: string; gastos: string; diferencia: string }>(`/reportes/resultado${consulta(r)}`),
}

export interface RangoQuery {
  desde: string
  hasta: string
}

function consulta(r?: RangoQuery): string {
  return r === undefined ? '' : `?desde=${r.desde}&hasta=${r.hasta}`
}

export type Registro = Record<string, unknown> & { id: string; nombre?: string }

export interface MovimientoApi {
  id: string
  fecha: string
  tipo: string
  cantidad: string
  importe?: string
  tandaId?: string
  refId?: string
  contraparteId?: string
  motivo?: string
}

export interface EstadoApi {
  tandas: Array<
    Registro & {
      animales: string
      costoCentavos: string
      huevosCargados: string
      nacidos: string
      huevosRecolectados: string
      diasAbierta: number
      categoria: Registro | null
      incubacion: { sobreCargados: number | null; sobreFertiles: number | null } | null
    }
  >
  deposito: Array<
    Registro & { unidades: string; centavos: string; costoUnitario: number | null; bajoMinimo: boolean }
  >
  avisos: Array<{ movimientoId: string; clase: string; detalle: string }>
}

export interface AnimalApi extends Registro {
  nombre: string
  sexo: string | null
  tandaId: string | null
  tanda: string | null
  especie: string | null
  estado: string | null
  fechaNacimiento: string | null
  nacidos: string
  partos: number
  ultimoParto: string | null
  promedioPorParto: number | null
}

export interface FilaAlimento {
  tandaId: string
  nombre: string
  bolsas: string
  gramos: string
  centavos: string
  costoTotalTanda: string
  participacion: number | null
  movimientoIds: string[]
}

export interface TablaApi {
  filas: Array<{ refId: string; centavos: string; participacion: number | null; movimientoIds: string[] }>
  total: string
}

export interface FilaVentaApi {
  refId: string
  centavos: string
  cantidad: string
  precioPromedio: number | null
  participacion: number | null
  movimientoIds: string[]
}

export interface FilaDeuda {
  contraparteId: string
  saldo: string
}

export interface RespuestaVentas {
  filas: FilaVentaApi[]
  total: string
  deuda: { filas: FilaDeuda[]; total: string }
}

// --- cola de reintento -------------------------------------------------------

export interface Pendiente {
  id: string
  cuerpo: Record<string, unknown>
  intentos: number
}

/**
 * UUID v4, ande o no ande `crypto.randomUUID`.
 *
 * `randomUUID` sólo existe en contextos seguros: HTTPS o localhost. Entrando
 * desde el celular a `http://192.168.x.x` no está, y sin esto no se podría
 * guardar ni un movimiento en el único dispositivo que importa.
 *
 * `getRandomValues` sí está disponible siempre, así que se arma el v4 a mano.
 */
export function nuevoId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }

  // Versión 4 y variante RFC 4122.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

function leerCola(): Pendiente[] {
  try {
    return JSON.parse(localStorage.getItem(PENDIENTES) ?? '[]') as Pendiente[]
  } catch {
    return []
  }
}

function guardarCola(cola: Pendiente[]): void {
  localStorage.setItem(PENDIENTES, JSON.stringify(cola))
}

export function pendientes(): number {
  return leerCola().length
}

/**
 * Guarda un movimiento. Si el servidor no contesta, lo deja en la cola.
 *
 * Devuelve `true` si llegó al servidor y `false` si quedó encolado. Nunca
 * lanza por falta de conexión: perder la carga sería peor que aceptarla tarde.
 */
export async function guardarMovimiento(cuerpo: Record<string, unknown>): Promise<boolean> {
  const id = (cuerpo['id'] as string | undefined) ?? nuevoId()
  const conId = { ...cuerpo, id }

  try {
    await pedir('/movimientos', { method: 'POST', body: JSON.stringify(conId) })
    return true
  } catch (e) {
    // Un rechazo del servidor (datos inválidos, sin sesión) no se reintenta:
    // reintentarlo daría el mismo error para siempre.
    if (e instanceof ErrorApi && e.estado >= 400 && e.estado < 500) throw e

    guardarCola([...leerCola(), { id, cuerpo: conId, intentos: 0 }])
    return false
  }
}

/** Reintenta la cola. Devuelve cuántos entraron. */
export async function vaciarCola(): Promise<number> {
  const cola = leerCola()
  if (cola.length === 0) return 0

  const quedan: Pendiente[] = []
  let entraron = 0

  for (const item of cola) {
    try {
      await pedir('/movimientos', { method: 'POST', body: JSON.stringify(item.cuerpo) })
      entraron += 1
    } catch (e) {
      if (e instanceof ErrorApi && e.estado >= 400 && e.estado < 500) continue // descartar: no va a mejorar
      quedan.push({ ...item, intentos: item.intentos + 1 })
    }
  }

  guardarCola(quedan)
  return entraron
}
