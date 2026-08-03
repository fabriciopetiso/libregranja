/**
 * De dónde salen los datos: del servidor o del propio teléfono.
 *
 * Las dos formas conviven a propósito durante la transición. La de servidor es
 * la que está probada y en uso; la local es la que lleva al P2P. Tener las dos
 * detrás de la misma interfaz permite ir moviéndose sin quedarse sin app
 * funcionando en el medio, y volver atrás si algo no cierra.
 *
 * Las pantallas no saben cuál está activa: piden datos y reciben la misma forma.
 */

import { api } from '../api.js'
import type { AnimalApi, EstadoApi, MovimientoApi, RangoQuery, Registro, RespuestaVentas, TablaApi } from '../api.js'
import * as local from './local.js'

export type Modo = 'servidor' | 'local'

const CLAVE = 'libregranja.modo'

export function modoActual(): Modo {
  return localStorage.getItem(CLAVE) === 'local' ? 'local' : 'servidor'
}

export function cambiarModo(modo: Modo): void {
  localStorage.setItem(CLAVE, modo)
  window.location.reload()
}

/** Igual que `api`, pero resolviendo contra el teléfono cuando corresponde. */
export const datos = {
  async listar<T = Registro>(tabla: string): Promise<T[]> {
    if (modoActual() === 'servidor') return api.listar<T>(tabla)
    const granjaId = await local.granjaActiva()
    return (await local.listar(tabla, granjaId)) as T[]
  },

  async crear<T = Registro>(tabla: string, cuerpo: Record<string, unknown>): Promise<T> {
    if (modoActual() === 'servidor') return api.crear<T>(tabla, cuerpo)
    const granjaId = await local.granjaActiva()
    return (await local.crear(tabla, granjaId, cuerpo)) as T
  },

  async actualizar<T = Registro>(tabla: string, id: string, cuerpo: Record<string, unknown>): Promise<T> {
    if (modoActual() === 'servidor') return api.actualizar<T>(tabla, id, cuerpo)
    return (await local.actualizar(id, cuerpo)) as T
  },

  async anular(tabla: string, id: string): Promise<void> {
    if (modoActual() === 'servidor') {
      await api.anular(tabla, id)
      return
    }
    await local.anular(id)
  },

  async movimientos(): Promise<MovimientoApi[]> {
    if (modoActual() === 'servidor') return api.movimientos()
    const granjaId = await local.granjaActiva()
    const filas = await local.leerMovimientos(granjaId)
    return filas.map((m) => ({
      id: m.id,
      fecha: m.fecha,
      tipo: m.tipo,
      cantidad: m.cantidad.toString(),
      ...(m.importe !== undefined ? { importe: m.importe.toString() } : {}),
      ...(m.tandaId !== undefined ? { tandaId: m.tandaId } : {}),
      ...(m.unidadId !== undefined ? { unidadId: m.unidadId } : {}),
      ...(m.refId !== undefined ? { refId: m.refId } : {}),
      ...(m.contraparteId !== undefined ? { contraparteId: m.contraparteId } : {}),
      ...(m.motivo !== undefined ? { motivo: m.motivo } : {}),
    }))
  },

  async guardarMovimiento(cuerpo: Record<string, unknown>): Promise<boolean> {
    if (modoActual() === 'servidor') {
      const { guardarMovimiento } = await import('../api.js')
      return guardarMovimiento(cuerpo)
    }
    const granjaId = await local.granjaActiva()
    await local.crearMovimiento(granjaId, cuerpo)
    // Sin servidor no hay nada que esperar: ya está guardado.
    return true
  },

  async anularMovimiento(id: string, motivo?: string): Promise<void> {
    if (modoActual() === 'servidor') {
      await api.anularMovimiento(id, motivo)
      return
    }
    await local.anularMovimiento(id, motivo)
  },

  async estado(): Promise<EstadoApi> {
    if (modoActual() === 'servidor') return api.estado()
    const granjaId = await local.granjaActiva()
    return (await local.estado(granjaId)) as unknown as EstadoApi
  },

  async animales(): Promise<AnimalApi[]> {
    if (modoActual() === 'servidor') return api.animales()
    const granjaId = await local.granjaActiva()
    return (await local.animales(granjaId)) as unknown as AnimalApi[]
  },

  async rubros(r?: RangoQuery): Promise<TablaApi> {
    if (modoActual() === 'servidor') return api.rubros(r)
    const granjaId = await local.granjaActiva()
    return (await local.reporteRubros(granjaId, r)) as TablaApi
  },

  async ventas(r?: RangoQuery): Promise<RespuestaVentas> {
    if (modoActual() === 'servidor') return api.ventas(r)
    const granjaId = await local.granjaActiva()
    return (await local.reporteVentas(granjaId, r)) as RespuestaVentas
  },

  async resultado(r?: RangoQuery): Promise<{ ventas: string; gastos: string; diferencia: string }> {
    if (modoActual() === 'servidor') return api.resultado(r)
    const granjaId = await local.granjaActiva()
    return (await local.reporteResultado(granjaId, r)) as { ventas: string; gastos: string; diferencia: string }
  },
}
