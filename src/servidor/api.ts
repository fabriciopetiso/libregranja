/**
 * API REST.
 *
 * Contrato HTTP explícito y versionado en vez de acciones acopladas a la UI:
 * así el día que convenga una app nativa, o un script de export, hablan con lo
 * mismo que habla el navegador.
 *
 * Los importes viajan como STRING en el JSON. `JSON.stringify` no sabe
 * serializar BigInt, y convertirlos a `number` sería reintroducir el float que
 * el resto del sistema evita. El cliente los vuelve a BigInt al recibirlos.
 */

import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Context, MiddlewareHandler } from 'hono'
import { z } from 'zod'

import { calcular } from '../core/motor.js'
import {
  deudaPorContraparte,
  gastosPorRubro,
  rendimientoIncubacion,
  resultadoDelPeriodo,
  ventasPorProducto,
} from '../core/reportes.js'
import type { Rango } from '../core/reportes.js'
import type { Catalogo } from '../core/tipos.js'
import type { Base } from '../db/conexion.js'
import * as repos from '../db/repos.js'
import { autenticar, cerrarSesion, crearSesion, crearUsuario, usuarioDeSesion } from './auth.js'
import type { Usuario } from './auth.js'

const COOKIE = 'libregranja_sesion'

type Entorno = { Variables: { usuario: Usuario } }

function serializar(datos: unknown): string {
  return JSON.stringify(datos, (_, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))
}

/** Respuesta JSON con BigInt serializado como string. */
function json(datos: unknown, estado = 200): Response {
  return new Response(serializar(datos), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/**
 * Igual que `json`, pero conserva las cabeceras que Hono acumuló en el contexto.
 *
 * Hace falta cuando el handler setea una cookie: `setCookie` escribe sobre el
 * contexto, y un `new Response(...)` armado a mano las descartaría en silencio.
 */
function jsonCon(c: Context<Entorno>, datos: unknown, estado = 200): Response {
  return c.body(serializar(datos), estado as 200, {
    'content-type': 'application/json; charset=utf-8',
  })
}

const aBigInt = z.union([z.string(), z.number()]).transform((v, ctx) => {
  try {
    return BigInt(v)
  } catch {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'no es un entero' })
    return z.NEVER
  }
})

const esquemaMovimiento = z.object({
  id: z.string().optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'la fecha va como AAAA-MM-DD'),
  tipo: z.string().min(1),
  cantidad: aBigInt.optional(),
  importe: aBigInt.optional(),
  tandaId: z.string().optional(),
  refId: z.string().optional(),
  contraparteId: z.string().optional(),
  tandaDestinoId: z.string().optional(),
  animalId: z.string().optional(),
  motivo: z.string().optional(),
  fotoId: z.string().optional(),
})

export function crearApi(base: Base): Hono<Entorno> {
  const api = new Hono<Entorno>()

  // --- sesión ---------------------------------------------------------------

  api.post('/sesion', async (c) => {
    const cuerpo = await c.req.json().catch(() => null)
    const datos = z.object({ usuario: z.string(), clave: z.string() }).safeParse(cuerpo)
    if (!datos.success) return json({ error: 'faltan usuario y clave' }, 400)

    const usuario = await autenticar(base, datos.data.usuario, datos.data.clave)
    if (usuario === null) return json({ error: 'usuario o clave incorrectos' }, 401)

    const token = crearSesion(base, usuario.id)
    setCookie(c, COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: 30 * 24 * 60 * 60,
      secure: c.req.url.startsWith('https://'),
    })

    return jsonCon(c, { usuario })
  })

  api.delete('/sesion', (c) => {
    const token = getCookie(c, COOKIE)
    if (token !== undefined) cerrarSesion(base, token)
    deleteCookie(c, COOKIE, { path: '/' })
    return jsonCon(c, { ok: true })
  })

  // --- a partir de acá, todo pide sesión ------------------------------------

  const pedirSesion: MiddlewareHandler<Entorno> = async (c, next) => {
    const token = getCookie(c, COOKIE)
    const usuario = token === undefined ? null : usuarioDeSesion(base, token)
    if (usuario === null) return json({ error: 'sin sesión' }, 401)
    c.set('usuario', usuario)
    await next()
    return undefined
  }

  const soloAdmin: MiddlewareHandler<Entorno> = async (c, next) => {
    if (c.get('usuario').rol !== 'admin') return json({ error: 'requiere rol admin' }, 403)
    await next()
    return undefined
  }

  api.use('*', pedirSesion)

  api.get('/yo', (c) => json({ usuario: c.get('usuario') }))

  // --- catálogos ------------------------------------------------------------

  api.get('/catalogo/:tabla', (c) => {
    const tabla = c.req.param('tabla')
    if (!repos.esTabla(tabla)) return json({ error: 'no existe' }, 404)
    return json(repos.listar(base, tabla, c.get('usuario').granjaId))
  })

  api.post('/catalogo/:tabla', async (c) => {
    const tabla = c.req.param('tabla')
    if (!repos.esTabla(tabla)) return json({ error: 'no existe' }, 404)

    const cuerpo = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    if (cuerpo === null) return json({ error: 'cuerpo inválido' }, 400)

    // Crear una categoría copia las capacidades de su plantilla, para que
    // editar la plantilla después no altere categorías ya creadas (§3.1).
    if (tabla === 'categoria' && typeof cuerpo['plantillaId'] === 'string') {
      const plantilla = repos.obtener(base, 'plantilla', cuerpo['plantillaId'])
      if (plantilla !== null) {
        for (const capacidad of [
          'animalesConNombre',
          'registraNacimientos',
          'registraHuevos',
          'registraCargaIncubacion',
          'registraPeso',
          'registraAlimento',
        ]) {
          cuerpo[capacidad] = plantilla[capacidad]
        }
      }
    }

    return json(repos.crear(base, tabla, c.get('usuario').granjaId, cuerpo), 201)
  })

  api.patch('/catalogo/:tabla/:id', async (c) => {
    const tabla = c.req.param('tabla')
    if (!repos.esTabla(tabla)) return json({ error: 'no existe' }, 404)

    const cuerpo = (await c.req.json().catch(() => null)) as Record<string, unknown> | null
    if (cuerpo === null) return json({ error: 'cuerpo inválido' }, 400)

    const actual = repos.obtener(base, tabla, c.req.param('id'))
    if (actual === null || actual['granjaId'] !== c.get('usuario').granjaId) return json({ error: 'no existe' }, 404)

    return json(repos.actualizar(base, tabla, c.req.param('id'), cuerpo))
  })

  api.delete('/catalogo/:tabla/:id', soloAdmin, (c) => {
    const tabla = c.req.param('tabla')
    if (!repos.esTabla(tabla)) return json({ error: 'no existe' }, 404)

    const actual = repos.obtener(base, tabla, c.req.param('id'))
    if (actual === null || actual['granjaId'] !== c.get('usuario').granjaId) return json({ error: 'no existe' }, 404)

    repos.anular(base, tabla, c.req.param('id'))
    return json({ ok: true })
  })

  // --- movimientos ----------------------------------------------------------

  api.get('/movimientos', (c) => json(repos.leerMovimientos(base, c.get('usuario').granjaId)))

  api.post('/movimientos', async (c) => {
    const cuerpo = await c.req.json().catch(() => null)
    const datos = esquemaMovimiento.safeParse(cuerpo)
    if (!datos.success) return json({ error: 'movimiento inválido', detalle: datos.error.issues }, 400)

    const usuario = c.get('usuario')
    return json(repos.crearMovimiento(base, usuario.granjaId, usuario.id, datos.data), 201)
  })

  api.delete('/movimientos/:id', async (c) => {
    const cuerpo = (await c.req.json().catch(() => ({}))) as { motivo?: string }
    repos.anularMovimiento(base, c.req.param('id'), cuerpo.motivo)
    return json({ ok: true })
  })

  api.get('/mas-usados/:tipo', (c) =>
    json(repos.refsMasUsadas(base, c.get('usuario').granjaId, c.req.param('tipo'))),
  )

  // --- estado y reportes ----------------------------------------------------

  const catalogoDe = (granjaId: string): Catalogo => ({
    productos: new Map(
      repos.listar(base, 'producto', granjaId).map((p) => [
        p['id'] as string,
        { id: p['id'] as string, descuentaAnimales: p['descuentaAnimales'] === true },
      ]),
    ),
  })

  const rangoDe = (desde?: string, hasta?: string): Rango | undefined =>
    desde !== undefined && hasta !== undefined ? { desde, hasta } : undefined

  /** Estado actual (§6.1) y depósito (§6.2). Todo derivado, nada guardado. */
  api.get('/estado', (c) => {
    const granjaId = c.get('usuario').granjaId
    const movimientos = repos.leerMovimientos(base, granjaId)
    const estado = calcular(movimientos, catalogoDe(granjaId))

    const tandas = repos.listar(base, 'tanda', granjaId)
    const categorias = new Map(repos.listar(base, 'categoria', granjaId).map((x) => [x['id'] as string, x]))
    const insumos = repos.listar(base, 'insumo', granjaId)
    const hoy = new Date()

    return json({
      tandas: tandas.map((t) => {
        const calculado = estado.tandas.get(t['id'] as string)
        const inicio = new Date(String(t['fechaInicio']))
        return {
          ...t,
          categoria: categorias.get(t['categoriaId'] as string) ?? null,
          animales: calculado?.animales ?? 0n,
          costoCentavos: calculado?.costoCentavos ?? 0n,
          huevosCargados: calculado?.huevosCargados ?? 0n,
          nacidos: calculado?.nacidos ?? 0n,
          huevosRecolectados: calculado?.huevosRecolectados ?? 0n,
          incubacion: calculado === undefined ? null : rendimientoIncubacion(calculado),
          diasAbierta: Math.max(0, Math.floor((hoy.getTime() - inicio.getTime()) / 86_400_000)),
        }
      }),
      deposito: insumos.map((i) => {
        const d = estado.depositos.get(i['id'] as string)
        const unidades = d?.unidades ?? 0n
        const centavos = d?.centavos ?? 0n
        return {
          ...i,
          unidades,
          centavos,
          costoUnitario: unidades === 0n ? null : Number(centavos) / Number(unidades),
          bajoMinimo: unidades < BigInt(Number(i['minimoReposicion'] ?? 0)),
        }
      }),
      avisos: estado.avisos,
    })
  })

  /** Alimento por tanda (§6.2). */
  api.get('/reportes/alimento', (c) => {
    const granjaId = c.get('usuario').granjaId
    const movimientos = repos.leerMovimientos(base, granjaId)
    const estado = calcular(movimientos, catalogoDe(granjaId))
    const insumos = new Map(repos.listar(base, 'insumo', granjaId).map((i) => [i['id'] as string, i]))
    const porId = new Map(movimientos.map((m) => [m.id, m]))

    const porTanda = new Map<string, { bolsas: bigint; centavos: bigint; gramos: bigint; ids: string[] }>()

    for (const imp of estado.imputaciones) {
      if (imp.concepto !== 'entrega_insumo' || imp.refId === undefined) continue
      const mov = porId.get(imp.movimientoId)
      if (mov === undefined) continue

      let fila = porTanda.get(imp.tandaId)
      if (fila === undefined) {
        fila = { bolsas: 0n, centavos: 0n, gramos: 0n, ids: [] }
        porTanda.set(imp.tandaId, fila)
      }

      const gramosPorBolsa = BigInt(Number(insumos.get(imp.refId)?.['gramosPorBolsa'] ?? 0))
      fila.bolsas += mov.cantidad
      fila.centavos += imp.centavos
      fila.gramos += mov.cantidad * gramosPorBolsa
      fila.ids.push(imp.movimientoId)
    }

    const tandas = repos.listar(base, 'tanda', granjaId)
    return json(
      tandas.map((t) => {
        const fila = porTanda.get(t['id'] as string)
        const costoTotal = estado.tandas.get(t['id'] as string)?.costoCentavos ?? 0n
        const alimento = fila?.centavos ?? 0n
        return {
          tandaId: t['id'],
          nombre: t['nombre'],
          bolsas: fila?.bolsas ?? 0n,
          gramos: fila?.gramos ?? 0n,
          centavos: alimento,
          costoTotalTanda: costoTotal,
          participacion: costoTotal === 0n ? null : Number((alimento * 10000n) / costoTotal) / 100,
          movimientoIds: fila?.ids ?? [],
        }
      }),
    )
  })

  api.get('/reportes/rubros', (c) => {
    const movimientos = repos.leerMovimientos(base, c.get('usuario').granjaId)
    const rango = rangoDe(c.req.query('desde'), c.req.query('hasta'))
    return json(gastosPorRubro(movimientos, rango, c.req.query('tandaId')))
  })

  api.get('/reportes/ventas', (c) => {
    const movimientos = repos.leerMovimientos(base, c.get('usuario').granjaId)
    const { porContraparte, total } = deudaPorContraparte(movimientos)
    return json({
      ...ventasPorProducto(movimientos, rangoDe(c.req.query('desde'), c.req.query('hasta'))),
      deuda: {
        filas: [...porContraparte.entries()].map(([id, saldo]) => ({ contraparteId: id, saldo })),
        total,
      },
    })
  })

  api.get('/reportes/resultado', (c) =>
    json(
      resultadoDelPeriodo(
        repos.leerMovimientos(base, c.get('usuario').granjaId),
        rangoDe(c.req.query('desde'), c.req.query('hasta')),
      ),
    ),
  )

  // --- usuarios (sólo admin) ------------------------------------------------

  api.post('/usuarios', soloAdmin, async (c) => {
    const cuerpo = await c.req.json().catch(() => null)
    const datos = z
      .object({
        nombre: z.string().min(1),
        usuario: z.string().min(3),
        clave: z.string().min(8, 'la clave necesita al menos 8 caracteres'),
        rol: z.enum(['admin', 'operador']),
      })
      .safeParse(cuerpo)

    if (!datos.success) return json({ error: 'datos inválidos', detalle: datos.error.issues }, 400)
    return json(await crearUsuario(base, c.get('usuario').granjaId, datos.data), 201)
  })

  return api
}
