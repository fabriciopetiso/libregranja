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

import { randomUUID } from 'node:crypto'

import { Hono } from 'hono'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import type { Context, MiddlewareHandler } from 'hono'
import { z } from 'zod'

import { calcular } from '../core/motor.js'
import {
  balancePorNivel,
  deudaPorContraparte,
  gastosPorRubro,
  rendimientoIncubacion,
  resultadoDelPeriodo,
  ventasPorProducto,
} from '../core/reportes.js'
import type { Rango } from '../core/reportes.js'
import type { Catalogo } from '../core/tipos.js'
import type { Base } from '../db/conexion.js'
import { sembrarValoresIniciales } from '../db/inicializar.js'
import * as repos from '../db/repos.js'
import { autenticar, cerrarSesion, crearSesion, crearUsuario, usuarioDeSesion } from './auth.js'
import type { Usuario } from './auth.js'
import { exportarCsv, nombreArchivo } from './exportar.js'

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
  unidadId: z.string().optional(),
  refId: z.string().optional(),
  contraparteId: z.string().optional(),
  tandaDestinoId: z.string().optional(),
  animalId: z.string().optional(),
  motivo: z.string().optional(),
  fotoId: z.string().optional(),
})

export function crearApi(base: Base): Hono<Entorno> {
  const api = new Hono<Entorno>()

  // Un 500 sin cuerpo no le dice nada a nadie. Cualquier error que se escape
  // vuelve como JSON con su mensaje, que es lo que la pantalla puede mostrar.
  api.onError((error) => {
    console.error('[api]', error)
    return json({ error: error.message }, 500)
  })

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

  api.get('/yo', (c) => {
    const usuario = c.get('usuario')
    const granjas = base
      .prepare(
        `SELECT g.id, g.nombre, ug.rol
         FROM usuario_granja ug
         JOIN granja g ON g.id = ug.granja_id
         WHERE ug.usuario_id = ? AND g.eliminado = 0
         ORDER BY g.nombre COLLATE NOCASE`,
      )
      .all(usuario.id)

    return json({ usuario, granjas })
  })

  // --- granjas --------------------------------------------------------------

  /**
   * Crear una granja nueva. Quien la crea queda como admin de ella.
   *
   * Una persona puede llevar más de una granja —la propia y la de un vecino, o
   * dos establecimientos— y cada una tiene sus datos completamente separados.
   */
  api.post('/granjas', async (c) => {
    const cuerpo = await c.req.json().catch(() => null)
    const datos = z.object({ nombre: z.string().min(1) }).safeParse(cuerpo)
    if (!datos.success) return json({ error: 'falta el nombre' }, 400)

    const usuario = c.get('usuario')
    const granjaId = randomUUID()
    const momento = new Date().toISOString()

    const crearTodo = base.transaction(() => {
      base
        .prepare('INSERT INTO granja (id, nombre, creado_en, modificado_en, eliminado) VALUES (?, ?, ?, ?, 0)')
        .run(granjaId, datos.data.nombre, momento, momento)
      base
        .prepare('INSERT INTO usuario_granja (usuario_id, granja_id, rol, creado_en) VALUES (?, ?, ?, ?)')
        .run(usuario.id, granjaId, 'admin', momento)
      sembrarValoresIniciales(base, granjaId, momento)
    })

    crearTodo()
    return json({ id: granjaId, nombre: datos.data.nombre }, 201)
  })

  /** Cambiar de granja activa. Sólo a una de las que el usuario es miembro. */
  api.post('/granja-activa', async (c) => {
    const cuerpo = await c.req.json().catch(() => null)
    const datos = z.object({ granjaId: z.string() }).safeParse(cuerpo)
    if (!datos.success) return json({ error: 'falta granjaId' }, 400)

    const usuario = c.get('usuario')
    const membresia = base
      .prepare('SELECT rol FROM usuario_granja WHERE usuario_id = ? AND granja_id = ?')
      .get(usuario.id, datos.data.granjaId) as { rol: 'admin' | 'operador' } | undefined

    if (membresia === undefined) return json({ error: 'no sos miembro de esa granja' }, 403)

    base
      .prepare('UPDATE usuario SET granja_id = ?, rol = ?, modificado_en = ? WHERE id = ?')
      .run(datos.data.granjaId, membresia.rol, new Date().toISOString(), usuario.id)

    return json({ ok: true })
  })

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
        {
          id: p['id'] as string,
          // Vender siempre saca algo del stock: animales o huevos.
          descuenta: (p['descuenta'] === 'huevos' ? 'huevos' : 'animales') as 'animales' | 'huevos',
        },
      ]),
    ),
    jerarquia: repos.leerJerarquia(base, granjaId),
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
    const unidades = repos.listar(base, 'unidad', granjaId)
    const hoy = new Date()

    /**
     * Resumen por unidad productiva: cuánto hay y cuánto costó cada lugar.
     *
     * Es la pregunta que una lista plana de veinte tandas no contesta: "¿cuánto
     * me cuesta el gallinero?".
     */
    const jerarquia = repos.leerJerarquia(base, granjaId)
    const balances = balancePorNivel(estado, jerarquia)

    /**
     * Cuántos animales hay dentro de un lugar, contando los de sus lugares hijos.
     * Se desglosa por especie: sumar gallinas y conejos en un solo número no
     * querría decir nada.
     */
    const nombreEspecie = new Map(
      repos.listar(base, 'especie', granjaId).map((e) => [e['id'] as string, e['nombre'] as string]),
    )

    const animalesDe = (unidadId: string): { total: bigint; huevos: bigint; porEspecie: Record<string, string> } => {
      const porEspecie = new Map<string, bigint>()
      let total = 0n
      let huevos = 0n

      const recorrer = (id: string, visitados: Set<string>): void => {
        if (visitados.has(id)) return
        visitados.add(id)

        for (const t of tandas.filter((x) => x['unidadId'] === id)) {
          const suya = estado.tandas.get(t['id'] as string)
          huevos += suya?.huevosDisponibles ?? 0n
          const cantidad = suya?.animales ?? 0n
          if (cantidad === 0n) continue
          total += cantidad
          const id = t['especieId'] as string | null
          // Por nombre, no por id: el desglose es para leerlo.
          const especie = id === null ? 'Sin especie' : (nombreEspecie.get(id) ?? 'Sin especie')
          porEspecie.set(especie, (porEspecie.get(especie) ?? 0n) + cantidad)
        }

        for (const hija of unidades.filter((x) => x['unidadPadreId'] === id)) {
          recorrer(hija['id'] as string, visitados)
        }
      }

      recorrer(unidadId, new Set())
      return {
        total,
        huevos,
        porEspecie: Object.fromEntries([...porEspecie].map(([k, v]) => [k, v.toString()])),
      }
    }

    const resumenUnidades = unidades.map((u) => {
      const id = u['id'] as string
      const b = balances.get(id)
      const conteo = animalesDe(id)

      return {
        ...u,
        tandas: tandas.filter((t) => t['unidadId'] === id).length,
        animales: conteo.total,
        huevos: conteo.huevos,
        animalesPorEspecie: conteo.porEspecie,
        costoPropio: b?.propioEgresos ?? 0n,
        costoCentavos: b?.totalEgresos ?? 0n,
        ingresos: b?.totalIngresos ?? 0n,
        resultado: b?.resultado ?? 0n,
        movimientoIds: b?.movimientoIds ?? [],
      }
    })

    return json({
      unidades: resumenUnidades,
      general: estado.general,
      tandas: tandas.map((t) => {
        const calculado = estado.tandas.get(t['id'] as string)
        const inicio = new Date(String(t['fechaInicio']))
        return {
          ...t,
          categoria: categorias.get(t['categoriaId'] as string) ?? null,
          animales: calculado?.animales ?? 0n,
          costoCentavos: balances.get(t['id'] as string)?.totalEgresos ?? calculado?.costoCentavos ?? 0n,
          ingresos: balances.get(t['id'] as string)?.totalIngresos ?? 0n,
          resultado: balances.get(t['id'] as string)?.resultado ?? 0n,
          /**
           * Cerrada es una cuenta, no un dato: tuvo animales alguna vez y ahora
           * tiene cero. Una tanda recién creada, con cero, no está cerrada:
           * está esperando.
           */
          cerrada: calculado !== undefined && calculado.animales === 0n,
          huevosCargados: calculado?.huevosCargados ?? 0n,
          nacidos: calculado?.nacidos ?? 0n,
          huevosRecolectados: calculado?.huevosRecolectados ?? 0n,
          huevos: calculado?.huevosDisponibles ?? 0n,
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
      totales: {
        animales: [...estado.tandas.values()].reduce((s, t) => s + t.animales, 0n),
        huevos: [...estado.tandas.values()].reduce((s, t) => s + t.huevosDisponibles, 0n),
      },
      avisos: estado.avisos,
    })
  })

  /**
   * Animales con nombre, con lo que rindió cada uno.
   *
   * Sólo aplica donde se los sigue de a uno: seis conejas madre, no
   * novecientos pollos. Por eso es una consulta aparte y no parte de /estado.
   */
  api.get('/animales', (c) => {
    const granjaId = c.get('usuario').granjaId
    const estado = calcular(repos.leerMovimientos(base, granjaId), catalogoDe(granjaId))
    const tandas = new Map(repos.listar(base, 'tanda', granjaId).map((t) => [t['id'] as string, t]))
    const especies = new Map(repos.listar(base, 'especie', granjaId).map((e) => [e['id'] as string, e]))

    return json(
      repos.listar(base, 'animal', granjaId).map((a) => {
        const rendimiento = estado.animales.get(a['id'] as string)
        return {
          ...a,
          tanda: tandas.get(a['tandaId'] as string)?.['nombre'] ?? null,
          especie: especies.get(a['especieId'] as string)?.['nombre'] ?? null,
          nacidos: rendimiento?.nacidos ?? 0n,
          partos: rendimiento?.partos ?? 0,
          ultimoParto: rendimiento?.ultimoParto ?? null,
          promedioPorParto:
            rendimiento === undefined || rendimiento.partos === 0
              ? null
              : Math.round((Number(rendimiento.nacidos) / rendimiento.partos) * 100) / 100,
        }
      }),
    )
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

    /**
     * Denominador de la participación: todo lo que se le cargó a la tanda, no su
     * saldo actual.
     *
     * Con el saldo, un traslado saliente achica el divisor y el porcentaje se va
     * arriba de 100: el alimento ya imputado se compara contra un costo que en
     * parte se fue con los animales. La pregunta de §6.2 es "de lo que costó esta
     * tanda, cuánto fue alimento", así que se suman las imputaciones que entraron.
     */
    const costoBruto = new Map<string, bigint>()
    for (const imp of estado.imputaciones) {
      if (imp.centavos <= 0n) continue
      costoBruto.set(imp.tandaId, (costoBruto.get(imp.tandaId) ?? 0n) + imp.centavos)
    }

    const tandas = repos.listar(base, 'tanda', granjaId)
    return json(
      tandas.map((t) => {
        const fila = porTanda.get(t['id'] as string)
        const costoTotal = costoBruto.get(t['id'] as string) ?? 0n
        const alimento = fila?.centavos ?? 0n
        return {
          tandaId: t['id'],
          nombre: t['nombre'],
          bolsas: fila?.bolsas ?? 0n,
          gramos: fila?.gramos ?? 0n,
          centavos: alimento,
          costoTotalTanda: costoTotal,
          saldoActual: estado.tandas.get(t['id'] as string)?.costoCentavos ?? 0n,
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

  /**
   * Cambiar a qué nivel se imputa un movimiento ya cargado.
   *
   * Única excepción a que los movimientos no se editen: no toca la plata, sólo
   * dónde aparece. Cargar rápido en la granja y afinar después no debería
   * obligar a anular y volver a cargar.
   */
  api.patch('/movimientos/:id/imputacion', async (c) => {
    const cuerpo = await c.req.json().catch(() => null)
    const datos = z
      .object({
        tandaId: z.string().nullable().optional(),
        unidadId: z.string().nullable().optional(),
        animalId: z.string().nullable().optional(),
      })
      .safeParse(cuerpo)

    if (!datos.success) return json({ error: 'destino inválido' }, 400)

    repos.reimputar(base, c.req.param('id'), datos.data)
    return json({ ok: true })
  })

  /** Anula de una vez todos los movimientos que salieron de la misma carga. */
  api.delete('/grupos/:grupoId', (c) => {
    const anulados = repos.anularGrupo(base, c.req.param('grupoId'))
    return json({ ok: true, anulados })
  })

  // --- export ---------------------------------------------------------------

  /**
   * Todas las cargas del período en un CSV, en el mismo orden en que el motor
   * las calcula. Es la puerta de salida: el dato es del usuario, no del sistema.
   */
  api.get('/export.csv', (c) => {
    const desde = c.req.query('desde')
    const hasta = c.req.query('hasta')
    const csv = exportarCsv(base, c.get('usuario').granjaId, { desde, hasta })

    return c.body(csv, 200, {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="${nombreArchivo(desde, hasta)}"`,
    })
  })

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
