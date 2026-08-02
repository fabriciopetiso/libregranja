/**
 * Pantallas de carga.
 *
 * Organizadas por lo que pasó, no por tipo de cosa: comprar 20 parrilleros y
 * comprar 20 bolsas de alimento son las dos una compra, y las dos tienen que
 * estar donde uno las busca. Repartirlas por entidad —insumos acá, animales
 * allá— obligaba a adivinar en qué solapa mirar.
 *
 * Dos reglas que no se rompen:
 *   · Nunca se pide un dato que el sistema puede calcular. Se escribe el total
 *     pagado y el unitario sale solo.
 *   · Ninguna validación bloquea. Si algo no cierra se guarda igual y se avisa:
 *     falta un registro anterior, no sobra este.
 */

import { useState } from 'react'

import { api, guardarMovimiento, nuevoId } from '../api.js'
import type { Registro } from '../api.js'
import { Aviso, Campo, Selector, SelectorConAlta, SelectorDestino, useDatos, Vacio } from '../comun.js'
import type { Destino } from '../comun.js'
import { aCentavos, hoy, pesosExactos } from '../dinero.js'

type Solapa = 'compre' | 'vendi' | 'paso'

export function Cargar({ alGuardar }: { alGuardar: () => void }) {
  const [solapa, setSolapa] = useState<Solapa>('compre')

  return (
    <>
      <nav className="subpestanas">
        <button type="button" className={solapa === 'compre' ? 'activa' : ''} onClick={() => setSolapa('compre')}>
          Compré
        </button>
        <button type="button" className={solapa === 'vendi' ? 'activa' : ''} onClick={() => setSolapa('vendi')}>
          Vendí
        </button>
        <button type="button" className={solapa === 'paso' ? 'activa' : ''} onClick={() => setSolapa('paso')}>
          Pasó algo
        </button>
      </nav>

      {solapa === 'compre' && <Compre alGuardar={alGuardar} />}
      {solapa === 'vendi' && <Vendi alGuardar={alGuardar} />}
      {solapa === 'paso' && <PasoAlgo alGuardar={alGuardar} />}
    </>
  )
}

/** Resultado de un guardado, para avisar sin bloquear. */
function useEnvio(alGuardar: () => void) {
  const [mensaje, setMensaje] = useState<{ texto: string; clase: string } | null>(null)
  const [enviando, setEnviando] = useState(false)

  const enviar = async (cuerpo: Record<string, unknown>, exito: string, limpiar: () => void) => {
    setEnviando(true)
    setMensaje(null)
    try {
      const llego = await guardarMovimiento(cuerpo)
      setMensaje(
        llego
          ? { texto: exito, clase: '' }
          : { texto: 'Sin conexión: quedó guardado y se manda solo cuando vuelva.', clase: '' },
      )
      limpiar()
      alGuardar()
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : 'no se pudo guardar', clase: 'error' })
    } finally {
      setEnviando(false)
    }
  }

  return { mensaje, enviando, enviar }
}

/** Los catálogos que casi todas las pantallas necesitan. */
function useCatalogos() {
  const tandas = useDatos(() => api.listar('tanda'))
  const unidades = useDatos(() => api.listar('unidad'))
  const animales = useDatos(() => api.animales())

  const crearLugar = async (nombre: string) => {
    const creado = (await api.crear('unidad', { nombre })) as Registro
    unidades.recargar()
    return creado
  }

  return {
    tandas: (tandas.datos ?? []) as Array<Registro & { unidadId?: string | null }>,
    unidades: (unidades.datos ?? []) as Registro[],
    animales: animales.datos ?? [],
    recargarTandas: tandas.recargar,
    crearLugar,
  }
}

// --- Compré ------------------------------------------------------------------

type QueCompre = 'insumo' | 'animales' | 'gasto'

function Compre({ alGuardar }: { alGuardar: () => void }) {
  const [que, setQue] = useState<QueCompre>('insumo')

  return (
    <section className="tarjeta">
      <h2>Compré</h2>

      <div className="fila" style={{ marginBottom: '1rem' }}>
        <button type="button" className={que === 'insumo' ? 'principal' : 'fantasma'} onClick={() => setQue('insumo')}>
          Alimento o insumo
        </button>
        <button
          type="button"
          className={que === 'animales' ? 'principal' : 'fantasma'}
          onClick={() => setQue('animales')}
        >
          Animales
        </button>
        <button type="button" className={que === 'gasto' ? 'principal' : 'fantasma'} onClick={() => setQue('gasto')}>
          Otro gasto
        </button>
      </div>

      {que === 'insumo' && <CompraInsumo alGuardar={alGuardar} />}
      {que === 'animales' && <CompraAnimales alGuardar={alGuardar} />}
      {que === 'gasto' && <Gasto alGuardar={alGuardar} />}
    </section>
  )
}

function CompraInsumo({ alGuardar }: { alGuardar: () => void }) {
  const insumos = useDatos(() => api.listar('insumo'))
  const cat = useCatalogos()
  const { mensaje, enviando, enviar } = useEnvio(alGuardar)

  const [refId, setRefId] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [bolsas, setBolsas] = useState('')
  const [importe, setImporte] = useState('')
  const [destino, setDestino] = useState<Destino>({ unidadId: '', tandaId: '' })

  const centavos = aCentavos(importe)
  const n = bolsas.trim() === '' ? null : Number(bolsas)
  const unitario = centavos !== null && n !== null && n > 0 ? Number(centavos) / n : null

  const enviarFormulario = (e: React.FormEvent) => {
    e.preventDefault()
    void enviar(
      {
        fecha,
        tipo: 'compra',
        refId,
        cantidad: String(Math.trunc(n ?? 0)),
        importe: String(centavos),
        ...destinoAMovimiento(destino),
      },
      'Compra registrada.',
      () => {
        setBolsas('')
        setImporte('')
      },
    )
  }

  return (
    <form onSubmit={enviarFormulario}>
      <SelectorConAlta
        etiqueta="¿Qué compraste?"
        valor={refId}
        alCambiar={setRefId}
        opciones={(insumos.datos ?? []) as Registro[]}
        fijos={{ presentacion: 'bolsa' }}
        campos={[
          { clave: 'nombre', etiqueta: 'Nombre del insumo', sugerencia: 'Alimento terminador' },
          { clave: 'gramosPorBolsa', etiqueta: 'Kilos por bolsa', tipo: 'numero', inicial: '25' },
        ]}
        alCrear={async (datos) => {
          const kilos = Number(datos['gramosPorBolsa'] ?? 0)
          const creado = await api.crear('insumo', { ...datos, gramosPorBolsa: Math.round(kilos * 1000) })
          insumos.recargar()
          return creado as { id: string }
        }}
      />

      <div className="fila">
        <Campo etiqueta="Bolsas">
          <input
            inputMode="numeric"
            value={bolsas}
            onChange={(e) => setBolsas(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="0"
          />
        </Campo>
        <Campo etiqueta="Total pagado">
          <input inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="0,00" />
        </Campo>
      </div>

      {unitario !== null && (
        <p className="calculado">Sale a {pesosExactos(unitario)} por bolsa. El unitario lo calcula el sistema.</p>
      )}

      <Campo etiqueta="Fecha">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>

      <SelectorDestino
        destino={destino}
        alCambiar={setDestino}
        unidades={cat.unidades}
        tandas={cat.tandas}
        alCrearLugar={cat.crearLugar}
      />

      {mensaje !== null && <Aviso clase={mensaje.clase}>{mensaje.texto}</Aviso>}

      <button
        type="submit"
        className="principal"
        disabled={refId === '' || centavos === null || n === null || n <= 0 || enviando}
      >
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}

/**
 * Comprar animales abre siempre una tanda: una compra es una camada de la misma
 * edad y tipo. Se puede elegir una tanda que ya exista —si es la misma camada
 * llegando en dos veces— o crear una acá mismo, en un lugar que también puede
 * ser nuevo.
 */
function CompraAnimales({ alGuardar }: { alGuardar: () => void }) {
  const cat = useCatalogos()
  const especies = useDatos(() => api.listar('especie'))
  const razas = useDatos(() => api.listar('raza'))
  const tipos = useDatos(() => api.listar('categoria'))
  const { mensaje, enviando, enviar } = useEnvio(alGuardar)

  const [fecha, setFecha] = useState(hoy())
  const [cantidad, setCantidad] = useState('')
  const [importe, setImporte] = useState('')
  const [destino, setDestino] = useState<Destino>({ unidadId: '', tandaId: '' })

  const centavos = aCentavos(importe)
  const n = cantidad.trim() === '' ? null : Number(cantidad)
  const unitario = centavos !== null && n !== null && n > 0 ? Number(centavos) / n : null

  const enviarFormulario = (e: React.FormEvent) => {
    e.preventDefault()
    void enviar(
      {
        fecha,
        tipo: 'ingreso_animales',
        tandaId: destino.tandaId,
        ...(destino.unidadId !== '' ? { unidadId: destino.unidadId } : {}),
        cantidad: String(Math.trunc(n ?? 0)),
        ...(centavos !== null ? { importe: String(centavos) } : {}),
      },
      'Animales cargados.',
      () => {
        setCantidad('')
        setImporte('')
      },
    )
  }

  const razasDe = (especieId: string) =>
    ((razas.datos ?? []) as Registro[]).filter((r) => r['especieId'] === especieId || especieId === '')

  return (
    <form onSubmit={enviarFormulario}>
      <div className="fila">
        <Campo etiqueta="Cuántos">
          <input
            inputMode="numeric"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/[^\d]/g, ''))}
            placeholder="20"
          />
        </Campo>
        <Campo etiqueta="Total pagado">
          <input inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="0,00" />
        </Campo>
      </div>

      {unitario !== null && <p className="calculado">Sale a {pesosExactos(unitario)} por animal.</p>}

      <Campo etiqueta="Fecha">
        <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
      </Campo>

      <SelectorDestino
        etiqueta="¿A qué tanda entran?"
        destino={destino}
        alCambiar={setDestino}
        unidades={cat.unidades}
        tandas={cat.tandas}
        exigirTanda
        alCrearLugar={cat.crearLugar}
      />

      <SelectorConAlta
        etiqueta=""
        soloAlta
        textoAlta="Es una tanda nueva"
        valor={destino.tandaId}
        alCambiar={(id) => setDestino({ ...destino, tandaId: id })}
        opciones={[]}
        campos={[
          { clave: 'nombre', etiqueta: 'Nombre de la tanda', sugerencia: 'Parrilleros agosto' },
          {
            clave: 'unidadId',
            etiqueta: '¿En qué lugar?',
            tipo: 'opciones',
            inicial: destino.unidadId,
            opciones: [
              { valor: '', etiqueta: 'Sin lugar' },
              ...cat.unidades.map((u) => ({ valor: u.id, etiqueta: (u['nombre'] as string) ?? u.id })),
            ],
          },
          {
            clave: 'categoriaId',
            etiqueta: '¿Para qué es?',
            tipo: 'opciones',
            opciones: [
              { valor: '', etiqueta: 'Sin definir' },
              ...((tipos.datos ?? []) as Registro[]).map((t) => ({
                valor: t.id,
                etiqueta: (t['nombre'] as string) ?? t.id,
              })),
            ],
          },
          {
            clave: 'especieId',
            etiqueta: 'Especie',
            tipo: 'opciones',
            opciones: [
              { valor: '', etiqueta: 'Sin definir' },
              ...((especies.datos ?? []) as Registro[]).map((e) => ({
                valor: e.id,
                etiqueta: (e['nombre'] as string) ?? e.id,
              })),
            ],
          },
          {
            clave: 'razaId',
            etiqueta: 'Raza',
            tipo: 'opciones',
            opciones: [
              { valor: '', etiqueta: 'Sin definir' },
              ...razasDe('').map((r) => ({ valor: r.id, etiqueta: (r['nombre'] as string) ?? r.id })),
            ],
          },
        ]}
        alCrear={async (datos) => {
          const creado = await api.crear('tanda', { ...datos, fechaInicio: fecha })
          cat.recargarTandas()
          return creado as { id: string }
        }}
      />

      {mensaje !== null && <Aviso clase={mensaje.clase}>{mensaje.texto}</Aviso>}

      <button type="submit" className="principal" disabled={destino.tandaId === '' || n === null || n <= 0 || enviando}>
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}

function Gasto({ alGuardar }: { alGuardar: () => void }) {
  const rubros = useDatos(() => api.listar('rubro_gasto'))
  const cat = useCatalogos()
  const { mensaje, enviando, enviar } = useEnvio(alGuardar)

  const [refId, setRefId] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [importe, setImporte] = useState('')
  const [destino, setDestino] = useState<Destino>({ unidadId: '', tandaId: '' })
  const [animalId, setAnimalId] = useState('')

  const centavos = aCentavos(importe)

  // Los animales con nombre de la tanda elegida: el remedio de un reproductor
  // se le carga a él, y desde ahí sube a su tanda y a su lugar.
  const animalesDeLaTanda = cat.animales.filter((a) => a.tandaId === destino.tandaId)

  const enviarFormulario = (e: React.FormEvent) => {
    e.preventDefault()
    void enviar(
      {
        fecha,
        tipo: 'gasto',
        refId,
        cantidad: '0',
        importe: String(centavos),
        ...(animalId !== '' ? { animalId } : destinoAMovimiento(destino)),
      },
      'Gasto registrado.',
      () => setImporte(''),
    )
  }

  return (
    <form onSubmit={enviarFormulario}>
      <SelectorConAlta
        etiqueta="¿De qué?"
        valor={refId}
        alCambiar={setRefId}
        opciones={(rubros.datos ?? []) as Registro[]}
        campos={[{ clave: 'nombre', etiqueta: 'Nombre del rubro', sugerencia: 'Combustible' }]}
        alCrear={async (datos) => {
          const creado = await api.crear('rubro_gasto', datos)
          rubros.recargar()
          return creado as { id: string }
        }}
      />

      <div className="fila">
        <Campo etiqueta="Importe">
          <input inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="0,00" />
        </Campo>
        <Campo etiqueta="Fecha">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>
      </div>

      <SelectorDestino
        destino={destino}
        alCambiar={(d) => {
          setDestino(d)
          setAnimalId('')
        }}
        unidades={cat.unidades}
        tandas={cat.tandas}
        alCrearLugar={cat.crearLugar}
      />

      {animalesDeLaTanda.length > 0 && (
        <Campo etiqueta="¿Es de un animal en particular? (opcional)">
          <Selector
            valor={animalId}
            alCambiar={setAnimalId}
            opciones={animalesDeLaTanda as unknown as Registro[]}
            vacio="Toda la tanda"
          />
        </Campo>
      )}

      {mensaje !== null && <Aviso clase={mensaje.clase}>{mensaje.texto}</Aviso>}

      <button type="submit" className="principal" disabled={refId === '' || centavos === null || enviando}>
        {enviando ? 'Guardando…' : 'Guardar'}
      </button>
    </form>
  )
}

// --- Vendí -------------------------------------------------------------------

function Vendi({ alGuardar }: { alGuardar: () => void }) {
  const productos = useDatos(() => api.listar('producto'))
  const contrapartes = useDatos(() => api.listar('contraparte'))
  const cat = useCatalogos()
  const { mensaje, enviando, enviar } = useEnvio(alGuardar)

  const [refId, setRefId] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [cantidad, setCantidad] = useState('')
  const [importe, setImporte] = useState('')
  const [cobrado, setCobrado] = useState('')
  const [contraparteId, setContraparteId] = useState('')
  const [destino, setDestino] = useState<Destino>({ unidadId: '', tandaId: '' })
  const [animalId, setAnimalId] = useState('')

  const centavos = aCentavos(importe)
  const cobradoCentavos = aCentavos(cobrado)
  const deuda = centavos !== null ? centavos - (cobradoCentavos ?? 0n) : null
  const animalesDeLaTanda = cat.animales.filter((a) => a.tandaId === destino.tandaId)

  const enviarFormulario = async (e: React.FormEvent) => {
    e.preventDefault()

    // Venta y cobro salen de la misma carga: el grupo los une para poder
    // anular la operación entera si se cargó mal.
    const grupoId = nuevoId()

    await enviar(
      {
        fecha,
        tipo: 'venta',
        refId,
        grupoId,
        cantidad: String(Math.trunc(Number(cantidad || '0'))),
        importe: String(centavos),
        ...(contraparteId !== '' ? { contraparteId } : {}),
        ...(animalId !== '' ? { animalId } : {}),
        ...destinoAMovimiento(destino),
      },
      'Venta registrada.',
      () => {
        setCantidad('')
        setImporte('')
        setCobrado('')
      },
    )

    if (cobradoCentavos !== null && cobradoCentavos > 0n && contraparteId !== '') {
      await guardarMovimiento({
        fecha,
        tipo: 'cobro',
        grupoId,
        importe: String(cobradoCentavos),
        contraparteId,
      })
      alGuardar()
    }
  }

  return (
    <section className="tarjeta">
      <h2>Vendí</h2>

      <form onSubmit={enviarFormulario}>
        <SelectorConAlta
          etiqueta="¿Qué vendiste?"
          valor={refId}
          alCambiar={setRefId}
          opciones={(productos.datos ?? []) as Registro[]}
          campos={[
            { clave: 'nombre', etiqueta: 'Nombre del producto', sugerencia: 'Pollo entero' },
            {
              clave: 'unidadVenta',
              etiqueta: 'Se vende por',
              tipo: 'opciones',
              inicial: 'unidad',
              opciones: [
                { valor: 'unidad', etiqueta: 'unidad' },
                { valor: 'kg', etiqueta: 'kilo' },
                { valor: 'maple', etiqueta: 'maple' },
                { valor: 'docena', etiqueta: 'docena' },
              ],
            },
            {
              clave: 'descuentaAnimales',
              etiqueta: 'Venderlo baja animales de la tanda',
              tipo: 'casilla',
              inicial: true,
            },
          ]}
          alCrear={async (datos) => {
            const creado = await api.crear('producto', datos)
            productos.recargar()
            return creado as { id: string }
          }}
        />

        <div className="fila">
          <Campo etiqueta="Cantidad">
            <input
              inputMode="numeric"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="0"
            />
          </Campo>
          <Campo etiqueta="Importe total">
            <input inputMode="decimal" value={importe} onChange={(e) => setImporte(e.target.value)} placeholder="0,00" />
          </Campo>
        </div>

        <Campo etiqueta="Fecha">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>

        <SelectorConAlta
          etiqueta="¿A quién?"
          valor={contraparteId}
          alCambiar={setContraparteId}
          opciones={((contrapartes.datos ?? []) as Registro[]).filter((c) => c['esCliente'] === true)}
          fijos={{ esCliente: true }}
          campos={[{ clave: 'nombre', etiqueta: 'Nombre del cliente', sugerencia: 'Almacén La Esquina' }]}
          alCrear={async (datos) => {
            const creado = await api.crear('contraparte', datos)
            contrapartes.recargar()
            return creado as { id: string }
          }}
        />

        <Campo etiqueta="Cobrado ahora (opcional)">
          <input inputMode="decimal" value={cobrado} onChange={(e) => setCobrado(e.target.value)} placeholder="0,00" />
        </Campo>

        {deuda !== null && deuda > 0n && (
          <Aviso>Queda una deuda de {pesosExactos(Number(deuda))}. Aparece en Números hasta saldarse.</Aviso>
        )}

        <SelectorDestino
          etiqueta="¿De dónde salió?"
          destino={destino}
          alCambiar={(d) => {
            setDestino(d)
            setAnimalId('')
          }}
          unidades={cat.unidades}
          tandas={cat.tandas}
          alCrearLugar={cat.crearLugar}
        />

        {animalesDeLaTanda.length > 0 && (
          <Campo etiqueta="¿Es un animal con nombre? (opcional)">
            <Selector
              valor={animalId}
              alCambiar={setAnimalId}
              opciones={animalesDeLaTanda as unknown as Registro[]}
              vacio="No, es de la tanda"
            />
          </Campo>
        )}

        {animalId !== '' && (
          <p className="calculado">
            Al venderlo, su costo sale con él: la tanda se queda con el ingreso y sin ese costo.
          </p>
        )}

        {mensaje !== null && <Aviso clase={mensaje.clase}>{mensaje.texto}</Aviso>}

        <button type="submit" className="principal" disabled={refId === '' || centavos === null || enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </section>
  )
}

// --- Pasó algo ---------------------------------------------------------------

function PasoAlgo({ alGuardar }: { alGuardar: () => void }) {
  const estado = useDatos(() => api.estado())
  const cat = useCatalogos()
  const tipos = useDatos(() => api.listar('categoria'))
  const { mensaje, enviando, enviar } = useEnvio(alGuardar)

  const [destino, setDestino] = useState<Destino>({ unidadId: '', tandaId: '' })
  const [tipo, setTipo] = useState('muerte')
  const [fecha, setFecha] = useState(hoy())
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [madreId, setMadreId] = useState('')
  const [aDonde, setADonde] = useState<Destino>({ unidadId: '', tandaId: '' })

  const lista = estado.datos?.tandas.filter((t) => !t.cerrada) ?? []
  const tanda = lista.find((t) => t.id === destino.tandaId)
  const capacidades = tanda?.categoria
  const hembras = cat.animales.filter((a) => a.sexo !== 'macho')

  const opciones: Array<{ valor: string; etiqueta: string }> = [
    { valor: 'muerte', etiqueta: 'Se murió' },
    { valor: 'traslado', etiqueta: 'Se movieron de tanda o lugar' },
    { valor: 'recuento', etiqueta: 'Los conté' },
  ]

  if (capacidades?.['registraNacimientos'] === true) {
    opciones.splice(0, 0, { valor: 'nacimiento', etiqueta: 'Nacieron' })
  }
  if (capacidades?.['registraHuevos'] === true) {
    opciones.push({ valor: 'huevos', etiqueta: 'Junté huevos' })
  }
  if (capacidades?.['registraCargaIncubacion'] === true) {
    opciones.push({ valor: 'carga_incubacion', etiqueta: 'Cargué huevos a incubar' })
    opciones.push({ valor: 'fertiles', etiqueta: 'Conté los fértiles' })
  }
  if (capacidades?.['registraPeso'] === true) {
    opciones.push({ valor: 'peso', etiqueta: 'Los pesé (gramos)' })
  }

  const valido = opciones.some((o) => o.valor === tipo) ? tipo : (opciones[0]?.valor ?? 'muerte')

  const enviarFormulario = (e: React.FormEvent) => {
    e.preventDefault()
    void enviar(
      {
        fecha,
        tipo: valido,
        tandaId: destino.tandaId,
        ...(destino.unidadId !== '' ? { unidadId: destino.unidadId } : {}),
        cantidad: String(Math.trunc(Number(cantidad || '0'))),
        ...(motivo !== '' ? { motivo } : {}),
        ...(valido === 'traslado' && aDonde.tandaId !== '' ? { tandaDestinoId: aDonde.tandaId } : {}),
        ...(valido === 'nacimiento' && madreId !== '' ? { animalId: madreId } : {}),
      },
      'Registrado.',
      () => {
        setCantidad('')
        setMotivo('')
      },
    )
  }

  const diferencia =
    valido === 'recuento' && tanda !== undefined && cantidad.trim() !== ''
      ? BigInt(Math.trunc(Number(cantidad))) - BigInt(tanda.animales)
      : null

  return (
    <section className="tarjeta">
      <h2>Pasó algo</h2>

      {lista.length === 0 ? (
        <Vacio>
          No hay tandas abiertas. Empezá cargando animales en <strong>Compré</strong>.
        </Vacio>
      ) : (
        <form onSubmit={enviarFormulario}>
          <SelectorDestino
            etiqueta="¿Dónde?"
            destino={destino}
            alCambiar={setDestino}
            unidades={cat.unidades}
            tandas={lista as unknown as Array<Registro & { unidadId?: string | null }>}
            exigirTanda
            alCrearLugar={cat.crearLugar}
          />

          {tanda !== undefined && (
            <p className="calculado">
              Hoy tiene {tanda.animales} animales · {tanda.diasAbierta} días abierta.
            </p>
          )}

          <Campo etiqueta="¿Qué pasó?">
            <select value={valido} onChange={(e) => setTipo(e.target.value)}>
              {opciones.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.etiqueta}
                </option>
              ))}
            </select>
          </Campo>

          <div className="fila">
            <Campo etiqueta="Fecha">
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Campo>
            <Campo etiqueta="Cuántos">
              <input
                inputMode="numeric"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value.replace(/[^\d]/g, ''))}
                placeholder="0"
              />
            </Campo>
          </div>

          {diferencia !== null && diferencia !== 0n && (
            <Aviso>
              El sistema tenía {tanda?.animales}. Se asienta un ajuste de {diferencia > 0n ? '+' : ''}
              {diferencia.toString()}. No se toca el pasado.
            </Aviso>
          )}

          {valido === 'nacimiento' && hembras.length > 0 && (
            <>
              <Campo etiqueta="¿De qué madre? (opcional)">
                <Selector
                  valor={madreId}
                  alCambiar={setMadreId}
                  opciones={hembras.map((a) => ({
                    id: a.id,
                    nombre: a.tanda === null ? a.nombre : `${a.nombre} · ${a.tanda}`,
                  }))}
                  vacio="Sin especificar"
                />
              </Campo>
              <p className="calculado">
                Anotá el nacimiento en la tanda donde se van a criar. Así no hace falta trasladarlos
                después, y el costo de los reproductores no se reparte entre las camadas.
              </p>
            </>
          )}

          {valido === 'traslado' && (
            <>
              <SelectorDestino
                etiqueta="¿A dónde van?"
                destino={aDonde}
                alCambiar={setADonde}
                unidades={cat.unidades}
                tandas={cat.tandas.filter((t) => t.id !== destino.tandaId)}
                exigirTanda
                alCrearLugar={cat.crearLugar}
              />

              <SelectorConAlta
                etiqueta=""
                soloAlta
                textoAlta="Van a una tanda nueva"
                valor={aDonde.tandaId}
                alCambiar={(id) => setADonde({ ...aDonde, tandaId: id })}
                opciones={[]}
                campos={[
                  { clave: 'nombre', etiqueta: 'Nombre de la tanda', sugerencia: 'Reproductoras elegidas' },
                  {
                    clave: 'unidadId',
                    etiqueta: '¿En qué lugar?',
                    tipo: 'opciones',
                    inicial: aDonde.unidadId,
                    opciones: [
                      { valor: '', etiqueta: 'Sin lugar' },
                      ...cat.unidades.map((u) => ({ valor: u.id, etiqueta: (u['nombre'] as string) ?? u.id })),
                    ],
                  },
                  {
                    clave: 'categoriaId',
                    etiqueta: '¿Para qué es?',
                    tipo: 'opciones',
                    opciones: [
                      { valor: '', etiqueta: 'Sin definir' },
                      ...((tipos.datos ?? []) as Registro[]).map((t) => ({
                        valor: t.id,
                        etiqueta: (t['nombre'] as string) ?? t.id,
                      })),
                    ],
                  },
                ]}
                alCrear={async (datos) => {
                  const creado = await api.crear('tanda', { ...datos, fechaInicio: fecha })
                  cat.recargarTandas()
                  return creado as { id: string }
                }}
              />

              <p className="calculado">
                El costo viaja con los animales, en proporción a cuántos se van.
              </p>
            </>
          )}

          {(valido === 'muerte' || valido === 'recuento' || valido === 'traslado') && (
            <Campo etiqueta={valido === 'traslado' ? 'Comentario' : 'Motivo (opcional)'}>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder={valido === 'traslado' ? 'Las mejores para reproducción' : ''}
              />
            </Campo>
          )}

          {mensaje !== null && <Aviso clase={mensaje.clase}>{mensaje.texto}</Aviso>}

          <button
            type="submit"
            className="principal"
            disabled={
              destino.tandaId === '' ||
              cantidad.trim() === '' ||
              (valido === 'traslado' && aDonde.tandaId === '') ||
              enviando
            }
          >
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
    </section>
  )
}

/**
 * Traduce el destino elegido a los campos del movimiento.
 *
 * Cae en un solo nivel: la tanda si la hay, si no el lugar, si no nada —que
 * significa toda la granja—. De eso depende que sumar los niveles no cuente
 * dos veces lo mismo.
 */
function destinoAMovimiento(destino: Destino): Record<string, string> {
  if (destino.tandaId !== '') return { tandaId: destino.tandaId }
  if (destino.unidadId !== '') return { unidadId: destino.unidadId }
  return {}
}
