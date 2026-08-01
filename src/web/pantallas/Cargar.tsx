/**
 * Pantallas de carga (§5).
 *
 * Nunca se pide un dato que el sistema puede calcular: se escribe el total
 * pagado y el unitario sale solo. Y ninguna validación bloquea: si algo no
 * cierra, se guarda igual y se avisa. Falta un registro anterior, no sobra este.
 */

import { useState } from 'react'

import { api, guardarMovimiento } from '../api.js'
import type { Registro } from '../api.js'
import { Aviso, Campo, Selector, SelectorConAlta, useDatos, Vacio } from '../comun.js'
import { aCentavos, hoy, pesosExactos } from '../dinero.js'

type Solapa = 'compra' | 'venta' | 'animales'

export function Cargar({ alGuardar }: { alGuardar: () => void }) {
  const [solapa, setSolapa] = useState<Solapa>('compra')

  return (
    <>
      <div className="fila" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={solapa === 'compra' ? 'principal' : 'fantasma'}
          onClick={() => setSolapa('compra')}
        >
          Compras y gastos
        </button>
        <button
          type="button"
          className={solapa === 'venta' ? 'principal' : 'fantasma'}
          onClick={() => setSolapa('venta')}
        >
          Ventas
        </button>
        <button
          type="button"
          className={solapa === 'animales' ? 'principal' : 'fantasma'}
          onClick={() => setSolapa('animales')}
        >
          Animales
        </button>
      </div>

      {solapa === 'compra' && <CompraOGasto alGuardar={alGuardar} />}
      {solapa === 'venta' && <Venta alGuardar={alGuardar} />}
      {solapa === 'animales' && <Animales alGuardar={alGuardar} />}
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

function CompraOGasto({ alGuardar }: { alGuardar: () => void }) {
  const insumos = useDatos(() => api.listar('insumo'))
  const rubros = useDatos(() => api.listar('rubro_gasto'))
  const tandas = useDatos(() => api.listar('tanda'))
  const { mensaje, enviando, enviar } = useEnvio(alGuardar)

  const [esInsumo, setEsInsumo] = useState(true)
  const [refId, setRefId] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [cantidad, setCantidad] = useState('')
  const [importe, setImporte] = useState('')
  const [tandaId, setTandaId] = useState('')

  const centavos = aCentavos(importe)
  const bolsas = cantidad.trim() === '' ? null : Number(cantidad)
  const unitario = centavos !== null && bolsas !== null && bolsas > 0 ? Number(centavos) / bolsas : null

  const puede = refId !== '' && centavos !== null && (!esInsumo || (bolsas !== null && bolsas > 0))

  const enviarFormulario = (e: React.FormEvent) => {
    e.preventDefault()
    void enviar(
      {
        fecha,
        tipo: esInsumo ? 'compra' : 'gasto',
        refId,
        cantidad: esInsumo ? String(Math.trunc(bolsas ?? 0)) : '0',
        importe: String(centavos),
        ...(tandaId !== '' ? { tandaId } : {}),
      },
      esInsumo ? 'Compra registrada.' : 'Gasto registrado.',
      () => {
        setCantidad('')
        setImporte('')
      },
    )
  }

  return (
    <section className="tarjeta">
      <h2>{esInsumo ? 'Compra de insumo' : 'Gasto'}</h2>

      <div className="fila" style={{ marginBottom: '1rem' }}>
        <button type="button" className={esInsumo ? 'principal' : 'fantasma'} onClick={() => { setEsInsumo(true); setRefId('') }}>
          Insumo
        </button>
        <button type="button" className={!esInsumo ? 'principal' : 'fantasma'} onClick={() => { setEsInsumo(false); setRefId('') }}>
          Otro gasto
        </button>
      </div>

      <form onSubmit={enviarFormulario}>
        {esInsumo ? (
          <SelectorConAlta
            etiqueta="Insumo"
            valor={refId}
            alCambiar={setRefId}
            opciones={(insumos.datos ?? []) as Registro[]}
            fijos={{ presentacion: 'bolsa' }}
            campos={[
              { clave: 'nombre', etiqueta: 'Nombre del insumo', sugerencia: 'Alimento terminador' },
              { clave: 'gramosPorBolsa', etiqueta: 'Kilos por bolsa', tipo: 'numero', inicial: '25' },
              { clave: 'minimoReposicion', etiqueta: 'Avisar cuando queden menos de', tipo: 'numero', inicial: '5' },
            ]}
            alCrear={async (datos) => {
              // La persona piensa en kilos por bolsa; la base guarda gramos.
              const kilos = Number(datos['gramosPorBolsa'] ?? 0)
              const creado = await api.crear('insumo', {
                ...datos,
                gramosPorBolsa: Math.round(kilos * 1000),
                minimoReposicion: Number(datos['minimoReposicion'] ?? 0),
              })
              insumos.recargar()
              return creado as { id: string }
            }}
          />
        ) : (
          <SelectorConAlta
            etiqueta="Rubro"
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
        )}

        <Campo etiqueta="Fecha">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>

        {esInsumo && (
          <Campo etiqueta="Bolsas">
            <input
              inputMode="numeric"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="0"
            />
          </Campo>
        )}

        <Campo etiqueta="Total pagado">
          <input
            inputMode="decimal"
            value={importe}
            onChange={(e) => setImporte(e.target.value)}
            placeholder="0,00"
          />
        </Campo>

        {unitario !== null && (
          <p style={{ marginTop: '-0.4rem', color: '#666', fontSize: '0.85rem' }}>
            Sale a {pesosExactos(unitario)} por bolsa. El unitario no se escribe: lo calcula el sistema.
          </p>
        )}

        <Campo etiqueta="¿Va a una tanda? (opcional)">
          <Selector valor={tandaId} alCambiar={setTandaId} opciones={(tandas.datos ?? []) as Registro[]} vacio="General" />
        </Campo>

        {mensaje !== null && <Aviso clase={mensaje.clase}>{mensaje.texto}</Aviso>}

        <button type="submit" className="principal" disabled={!puede || enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </section>
  )
}

function Venta({ alGuardar }: { alGuardar: () => void }) {
  const productos = useDatos(() => api.listar('producto'))
  const contrapartes = useDatos(() => api.listar('contraparte'))
  const tandas = useDatos(() => api.listar('tanda'))
  const { mensaje, enviando, enviar } = useEnvio(alGuardar)

  const [refId, setRefId] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [cantidad, setCantidad] = useState('')
  const [importe, setImporte] = useState('')
  const [cobrado, setCobrado] = useState('')
  const [contraparteId, setContraparteId] = useState('')
  const [tandaId, setTandaId] = useState('')

  const centavos = aCentavos(importe)
  const cobradoCentavos = aCentavos(cobrado)
  const puede = refId !== '' && centavos !== null && cantidad.trim() !== ''

  const enviarFormulario = async (e: React.FormEvent) => {
    e.preventDefault()

    await enviar(
      {
        fecha,
        tipo: 'venta',
        refId,
        cantidad: String(Math.trunc(Number(cantidad))),
        importe: String(centavos),
        ...(contraparteId !== '' ? { contraparteId } : {}),
        ...(tandaId !== '' ? { tandaId } : {}),
      },
      'Venta registrada.',
      () => {
        setCantidad('')
        setImporte('')
        setCobrado('')
      },
    )

    // Lo cobrado en el momento es un movimiento aparte: así la deuda queda
    // siendo ventas − cobros y no un campo más que mantener.
    if (cobradoCentavos !== null && cobradoCentavos > 0n && contraparteId !== '') {
      await guardarMovimiento({ fecha, tipo: 'cobro', importe: String(cobradoCentavos), contraparteId })
      alGuardar()
    }
  }

  const deuda = centavos !== null && cobradoCentavos !== null ? centavos - cobradoCentavos : null

  return (
    <section className="tarjeta">
      <h2>Venta</h2>

      <form onSubmit={enviarFormulario}>
        <SelectorConAlta
          etiqueta="Producto"
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
            { clave: 'descuentaAnimales', etiqueta: 'Venderlo baja animales de la tanda', tipo: 'casilla', inicial: true },
          ]}
          alCrear={async (datos) => {
            const creado = await api.crear('producto', datos)
            productos.recargar()
            return creado as { id: string }
          }}
        />

        <Campo etiqueta="Fecha">
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Campo>

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

        <SelectorConAlta
          etiqueta="Cliente"
          valor={contraparteId}
          alCambiar={setContraparteId}
          opciones={((contrapartes.datos ?? []) as Registro[]).filter((c) => c['esCliente'] === true)}
          fijos={{ esCliente: true }}
          campos={[
            { clave: 'nombre', etiqueta: 'Nombre del cliente', sugerencia: 'Almacén La Esquina' },
            { clave: 'contacto', etiqueta: 'Teléfono o contacto (opcional)' },
          ]}
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
          <Aviso>Queda una deuda de {pesosExactos(Number(deuda))}. Aparece en el inicio hasta saldarse.</Aviso>
        )}

        <Campo etiqueta="Tanda de la que salen (opcional)">
          <Selector valor={tandaId} alCambiar={setTandaId} opciones={(tandas.datos ?? []) as Registro[]} vacio="Ninguna" />
        </Campo>

        {mensaje !== null && <Aviso clase={mensaje.clase}>{mensaje.texto}</Aviso>}

        <button type="submit" className="principal" disabled={!puede || enviando}>
          {enviando ? 'Guardando…' : 'Guardar'}
        </button>
      </form>
    </section>
  )
}

/**
 * Movimientos de animales (§5.3): dos toques y un número.
 *
 * Los tipos que se ofrecen dependen de las capacidades de la categoría de la
 * tanda, no de su nombre. Una tanda de postura pide huevos; una de incubación,
 * huevos cargados. El código nunca mira cómo se llama la categoría.
 */
function Animales({ alGuardar }: { alGuardar: () => void }) {
  const tandas = useDatos(() => api.estado())
  const { mensaje, enviando, enviar } = useEnvio(alGuardar)

  const [tandaId, setTandaId] = useState('')
  const [tipo, setTipo] = useState('nacimiento')
  const [fecha, setFecha] = useState(hoy())
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('')
  const [destinoId, setDestinoId] = useState('')

  const lista = tandas.datos?.tandas ?? []
  const tanda = lista.find((t) => t.id === tandaId)
  const cat = tanda?.categoria

  const tipos: Array<{ valor: string; etiqueta: string }> = [
    { valor: 'ingreso_animales', etiqueta: 'Ingreso de animales' },
    { valor: 'muerte', etiqueta: 'Muerte' },
    { valor: 'traslado', etiqueta: 'Traslado a otra tanda' },
    { valor: 'recuento', etiqueta: 'Recuento (lo que conté)' },
  ]

  if (cat?.['registraNacimientos'] === true) tipos.splice(1, 0, { valor: 'nacimiento', etiqueta: 'Nacimiento' })
  if (cat?.['registraHuevos'] === true) tipos.push({ valor: 'huevos', etiqueta: 'Huevos recolectados' })
  if (cat?.['registraCargaIncubacion'] === true) {
    tipos.push({ valor: 'carga_incubacion', etiqueta: 'Huevos cargados a incubar' })
    tipos.push({ valor: 'fertiles', etiqueta: 'Huevos fértiles' })
  }
  if (cat?.['registraPeso'] === true) tipos.push({ valor: 'peso', etiqueta: 'Peso (gramos)' })

  const puede = tandaId !== '' && cantidad.trim() !== '' && (tipo !== 'traslado' || destinoId !== '')

  const enviarFormulario = (e: React.FormEvent) => {
    e.preventDefault()
    void enviar(
      {
        fecha,
        tipo,
        tandaId,
        cantidad: String(Math.trunc(Number(cantidad))),
        ...(motivo !== '' ? { motivo } : {}),
        ...(tipo === 'traslado' && destinoId !== '' ? { tandaDestinoId: destinoId } : {}),
      },
      'Registrado.',
      () => {
        setCantidad('')
        setMotivo('')
      },
    )
  }

  const diferencia =
    tipo === 'recuento' && tanda !== undefined && cantidad.trim() !== ''
      ? BigInt(Math.trunc(Number(cantidad))) - BigInt(tanda.animales)
      : null

  return (
    <section className="tarjeta">
      <h2>Movimiento de animales</h2>

      {lista.length === 0 ? (
        <Vacio>No hay tandas. Creá una en Configuración.</Vacio>
      ) : (
        <form onSubmit={enviarFormulario}>
          <Campo etiqueta="Tanda">
            <Selector valor={tandaId} alCambiar={setTandaId} opciones={lista as unknown as Registro[]} />
          </Campo>

          {tanda !== undefined && (
            <p style={{ marginTop: '-0.5rem', color: '#666', fontSize: '0.85rem' }}>
              Hoy tiene {tanda.animales} animales.
            </p>
          )}

          <Campo etiqueta="Qué pasó">
            <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
              {tipos.map((t) => (
                <option key={t.valor} value={t.valor}>
                  {t.etiqueta}
                </option>
              ))}
            </select>
          </Campo>

          <div className="fila">
            <Campo etiqueta="Fecha">
              <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </Campo>
            <Campo etiqueta="Cantidad">
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

          {tipo === 'traslado' && (
            <Campo etiqueta="Tanda de destino">
              <Selector
                valor={destinoId}
                alCambiar={setDestinoId}
                opciones={(lista as unknown as Registro[]).filter((t) => t.id !== tandaId)}
              />
            </Campo>
          )}

          {(tipo === 'muerte' || tipo === 'recuento') && (
            <Campo etiqueta="Motivo (opcional)">
              <input value={motivo} onChange={(e) => setMotivo(e.target.value)} />
            </Campo>
          )}

          {mensaje !== null && <Aviso clase={mensaje.clase}>{mensaje.texto}</Aviso>}

          <button type="submit" className="principal" disabled={!puede || enviando}>
            {enviando ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
    </section>
  )
}
