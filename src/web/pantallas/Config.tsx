/**
 * Configuración: acá el usuario crea la data que en otro sistema estaría
 * escrita en el código.
 *
 * Nada de esta pantalla depende de cómo se llame un tipo, un lugar o una raza.
 * Lo único que el programa entiende son las seis capacidades, y hasta esas se
 * marcan a mano al crear el tipo.
 */

import { useState } from 'react'

import { api } from '../api.js'
import type { Registro } from '../api.js'
import { Aviso, Campo, Selector, useDatos, Vacio } from '../comun.js'
import { hoy } from '../dinero.js'
import { Animales } from './Animales.js'

const CAPACIDADES: Array<{ clave: string; etiqueta: string }> = [
  { clave: 'animalesConNombre', etiqueta: 'Animales con nombre' },
  { clave: 'registraNacimientos', etiqueta: 'Nacimientos' },
  { clave: 'registraHuevos', etiqueta: 'Huevos' },
  { clave: 'registraCargaIncubacion', etiqueta: 'Carga de incubación' },
  { clave: 'registraPeso', etiqueta: 'Peso' },
  { clave: 'registraAlimento', etiqueta: 'Alimento' },
]

/**
 * En orden de dependencia: una tanda necesita un lugar y un tipo. Mostrarlas
 * todas apiladas escondía las de abajo, que son las que hay que tocar primero.
 */
const SECCIONES = [
  { clave: 'unidades', etiqueta: 'Lugares' },
  { clave: 'tandas', etiqueta: 'Tandas' },
  { clave: 'animales', etiqueta: 'Animales' },
  { clave: 'categorias', etiqueta: 'Tipos de tanda' },
  { clave: 'razas', etiqueta: 'Razas' },
  { clave: 'insumos', etiqueta: 'Insumos' },
  { clave: 'productos', etiqueta: 'Productos' },
  { clave: 'contrapartes', etiqueta: 'Clientes' },
  { clave: 'rubros', etiqueta: 'Rubros' },
  { clave: 'especies', etiqueta: 'Especies' },
] as const

type Seccion = (typeof SECCIONES)[number]['clave']

export function Config({ rol }: { rol: 'admin' | 'operador' }) {
  const [seccion, setSeccion] = useState<Seccion>('tandas')

  return (
    <>
      <nav className="subpestanas">
        {SECCIONES.map((s) => (
          <button
            key={s.clave}
            type="button"
            className={seccion === s.clave ? 'activa' : ''}
            onClick={() => setSeccion(s.clave)}
          >
            {s.etiqueta}
          </button>
        ))}
      </nav>

      {seccion === 'unidades' && <Unidades />}
      {seccion === 'tandas' && <Tandas alIrA={setSeccion} />}
      {seccion === 'animales' && <Animales />}
      {seccion === 'categorias' && <Categorias alIrA={setSeccion} />}
      {seccion === 'razas' && <Razas />}
      {seccion === 'insumos' && <Insumos />}
      {seccion === 'productos' && <Productos />}
      {seccion === 'contrapartes' && <Contrapartes />}
      {seccion === 'rubros' && <SimpleCrud tabla="rubro_gasto" titulo="Rubros de gasto" rol={rol} />}
      {seccion === 'especies' && <SimpleCrud tabla="especie" titulo="Especies" rol={rol} />}
    </>
  )
}

function useCrud(tabla: string) {
  const { datos, error, recargar } = useDatos(() => api.listar(tabla))
  const [mensaje, setMensaje] = useState<string | null>(null)

  const crear = async (cuerpo: Record<string, unknown>) => {
    try {
      await api.crear(tabla, cuerpo)
      setMensaje(null)
      recargar()
      return true
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'no se pudo crear')
      return false
    }
  }

  const anular = async (id: string) => {
    try {
      await api.anular(tabla, id)
      recargar()
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'no se pudo borrar')
    }
  }

  return { lista: (datos ?? []) as Registro[], error, mensaje, crear, anular, recargar }
}

function Lista({ items, alBorrar }: { items: Registro[]; alBorrar?: (id: string) => void }) {
  if (items.length === 0) return <Vacio>Todavía no hay ninguno.</Vacio>
  return (
    <table>
      <tbody>
        {items.map((i) => (
          <tr key={i.id}>
            <td>{(i['nombre'] as string) ?? i.id}</td>
            {alBorrar !== undefined && (
              <td style={{ textAlign: 'right' }}>
                <button type="button" className="chico fantasma" onClick={() => alBorrar(i.id)}>
                  Borrar
                </button>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function SimpleCrud({ tabla, titulo, rol }: { tabla: string; titulo: string; rol: 'admin' | 'operador' }) {
  const { lista, mensaje, crear, anular } = useCrud(tabla)
  const [nombre, setNombre] = useState('')

  return (
    <section className="tarjeta">
      <h2>{titulo}</h2>
      <Lista items={lista} {...(rol === 'admin' ? { alBorrar: (id: string) => void anular(id) } : {})} />

      <form
        className="fila"
        style={{ marginTop: '0.75rem' }}
        onSubmit={(e) => {
          e.preventDefault()
          void crear({ nombre }).then((ok) => ok && setNombre(''))
        }}
      >
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre nuevo" />
        <button type="submit" className="fantasma" style={{ flex: '0 0 auto', width: 'auto' }} disabled={nombre === ''}>
          Agregar
        </button>
      </form>

      {mensaje !== null && <Aviso clase="error">{mensaje}</Aviso>}
    </section>
  )
}

function Insumos() {
  const { lista, mensaje, crear, anular } = useCrud('insumo')
  const [nombre, setNombre] = useState('')
  const [kilos, setKilos] = useState('25')

  return (
    <section className="tarjeta">
      <h2>Insumos</h2>
      <Lista items={lista} alBorrar={(id) => void anular(id)} />

      <form
        style={{ marginTop: '0.75rem' }}
        onSubmit={(e) => {
          e.preventDefault()
          void crear({
            nombre,
            presentacion: 'bolsa',
            gramosPorBolsa: Math.round(Number(kilos) * 1000),
          }).then((ok) => ok && setNombre(''))
        }}
      >
        <Campo etiqueta="Nombre">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <Campo etiqueta="Kilos por bolsa">
          <input inputMode="numeric" value={kilos} onChange={(e) => setKilos(e.target.value)} />
        </Campo>
        <button type="submit" className="fantasma" disabled={nombre === ''}>
          Agregar insumo
        </button>
      </form>

      {mensaje !== null && <Aviso clase="error">{mensaje}</Aviso>}
    </section>
  )
}

function Productos() {
  const { lista, mensaje, crear, anular } = useCrud('producto')
  const [nombre, setNombre] = useState('')
  const [unidad, setUnidad] = useState('unidad')
  const [descuenta, setDescuenta] = useState(true)

  return (
    <section className="tarjeta">
      <h2>Productos</h2>
      <Lista items={lista} alBorrar={(id) => void anular(id)} />

      <form
        style={{ marginTop: '0.75rem' }}
        onSubmit={(e) => {
          e.preventDefault()
          void crear({ nombre, unidadVenta: unidad, descuentaAnimales: descuenta }).then((ok) => ok && setNombre(''))
        }}
      >
        <Campo etiqueta="Nombre">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <Campo etiqueta="Unidad de venta">
          <select value={unidad} onChange={(e) => setUnidad(e.target.value)}>
            <option value="unidad">unidad</option>
            <option value="kg">kg</option>
            <option value="maple">maple</option>
            <option value="docena">docena</option>
          </select>
        </Campo>
        <label style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <input
            type="checkbox"
            checked={descuenta}
            onChange={(e) => setDescuenta(e.target.checked)}
            style={{ width: 'auto', minHeight: 0 }}
          />
          <span style={{ margin: 0 }}>Vender esto baja las existencias de la tanda</span>
        </label>
        <button type="submit" className="fantasma" disabled={nombre === ''}>
          Agregar producto
        </button>
      </form>

      {mensaje !== null && <Aviso clase="error">{mensaje}</Aviso>}
    </section>
  )
}

function Contrapartes() {
  const { lista, mensaje, crear, anular } = useCrud('contraparte')
  const [nombre, setNombre] = useState('')
  const [esCliente, setEsCliente] = useState(true)
  const [esProveedor, setEsProveedor] = useState(false)

  return (
    <section className="tarjeta">
      <h2>Clientes y proveedores</h2>
      <Lista items={lista} alBorrar={(id) => void anular(id)} />

      <form
        style={{ marginTop: '0.75rem' }}
        onSubmit={(e) => {
          e.preventDefault()
          void crear({ nombre, esCliente, esProveedor }).then((ok) => ok && setNombre(''))
        }}
      >
        <Campo etiqueta="Nombre">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} />
        </Campo>
        <div className="fila">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={esCliente}
              onChange={(e) => setEsCliente(e.target.checked)}
              style={{ width: 'auto', minHeight: 0 }}
            />
            <span style={{ margin: 0 }}>Cliente</span>
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <input
              type="checkbox"
              checked={esProveedor}
              onChange={(e) => setEsProveedor(e.target.checked)}
              style={{ width: 'auto', minHeight: 0 }}
            />
            <span style={{ margin: 0 }}>Proveedor</span>
          </label>
        </div>
        <button type="submit" className="fantasma" disabled={nombre === ''}>
          Agregar
        </button>
      </form>

      {mensaje !== null && <Aviso clase="error">{mensaje}</Aviso>}
    </section>
  )
}

function Categorias({ alIrA: _alIrA }: { alIrA: (s: Seccion) => void }) {
  const { lista, mensaje, crear, anular } = useCrud('categoria')

  const [nombre, setNombre] = useState('')
  const [marcadas, setMarcadas] = useState<Record<string, boolean>>({})

  return (
    <section className="tarjeta">
      <h2>Tipos de tanda</h2>

      <p style={{ marginTop: 0, color: '#666', fontSize: '0.88rem' }}>
        Un tipo define qué se le registra a las tandas de ese tipo. Marcá lo que corresponda: la app
        nunca mira cómo se llama, sólo estas casillas.
      </p>

      {lista.length === 0 ? (
        <Vacio>Todavía no hay ninguno.</Vacio>
      ) : (
        <table>
          <tbody>
            {lista.map((c) => (
              <tr key={c.id}>
                <td>
                  {c['nombre'] as string}
                  <div style={{ fontSize: '0.78rem', color: '#666' }}>
                    {CAPACIDADES.filter((cap) => c[cap.clave] === true)
                      .map((cap) => cap.etiqueta.toLowerCase())
                      .join(' · ') || 'sin capacidades'}
                  </div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="chico fantasma" onClick={() => void anular(c.id)}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form
        style={{ marginTop: '0.75rem' }}
        onSubmit={(e) => {
          e.preventDefault()
          void crear({ nombre, ...marcadas }).then((ok) => {
            if (ok) {
              setNombre('')
              setMarcadas({})
            }
          })
        }}
      >
        <Campo etiqueta="Nombre del tipo">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Engorde" />
        </Campo>

        <span style={{ display: 'block', fontSize: '0.85rem', color: '#666', marginBottom: '0.4rem' }}>
          ¿Qué se le registra?
        </span>

        {CAPACIDADES.map((c) => (
          <label key={c.clave} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.4rem' }}>
            <input
              type="checkbox"
              checked={marcadas[c.clave] === true}
              onChange={(e) => setMarcadas({ ...marcadas, [c.clave]: e.target.checked })}
              style={{ width: 'auto', minHeight: 0 }}
            />
            <span style={{ margin: 0 }}>{c.etiqueta}</span>
          </label>
        ))}

        <button type="submit" className="fantasma" style={{ marginTop: '0.5rem' }} disabled={nombre === ''}>
          Crear tipo
        </button>
      </form>

      {mensaje !== null && <Aviso clase="error">{mensaje}</Aviso>}
    </section>
  )
}

function Tandas({ alIrA }: { alIrA: (s: Seccion) => void }) {
  const { lista, mensaje, crear } = useCrud('tanda')
  const categorias = useDatos(() => api.listar('categoria'))
  const unidades = useDatos(() => api.listar('unidad'))
  const especies = useDatos(() => api.listar('especie'))
  const razas = useDatos(() => api.listar('raza'))

  const [nombre, setNombre] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [unidadId, setUnidadId] = useState('')
  const [especieId, setEspecieId] = useState('')
  const [razaId, setRazaId] = useState('')
  const [fechaInicio, setFechaInicio] = useState(hoy())

  const disponibles = (categorias.datos ?? []) as Registro[]

  return (
    <section className="tarjeta">
      <h2>Tandas</h2>
      <Lista items={lista} />

      {categorias.datos !== null && disponibles.length === 0 && (
        <Aviso>
          Para abrir una tanda hace falta una categoría.{' '}
          <button type="button" className="chico fantasma" onClick={() => alIrA('categorias')}>
            Crear una categoría
          </button>
        </Aviso>
      )}

      <form
        style={{ marginTop: '0.75rem' }}
        onSubmit={(e) => {
          e.preventDefault()
          void crear({ nombre, categoriaId, unidadId, especieId, razaId, fechaInicio }).then(
            (ok) => ok && setNombre(''),
          )
        }}
      >
        <Campo etiqueta="Nombre">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Engorde marzo" />
        </Campo>
        <Campo etiqueta="¿En qué lugar?">
          <Selector valor={unidadId} alCambiar={setUnidadId} opciones={(unidades.datos ?? []) as Registro[]} />
        </Campo>
        <div className="fila">
          <Campo etiqueta="Especie">
            <Selector valor={especieId} alCambiar={setEspecieId} opciones={(especies.datos ?? []) as Registro[]} />
          </Campo>
          <Campo etiqueta="Raza">
            <Selector valor={razaId} alCambiar={setRazaId} opciones={(razas.datos ?? []) as Registro[]} />
          </Campo>
        </div>
        <div className="fila">
          <Campo etiqueta="Categoría">
            <Selector valor={categoriaId} alCambiar={setCategoriaId} opciones={disponibles} />
          </Campo>
          <Campo etiqueta="Fecha de inicio">
            <input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
          </Campo>
        </div>
        <button type="submit" className="fantasma" disabled={nombre === '' || categoriaId === ''}>
          Abrir tanda
        </button>
      </form>

      {mensaje !== null && <Aviso clase="error">{mensaje}</Aviso>}
    </section>
  )
}

/**
 * Lugares, que se anidan: Aves contiene los gallineros, y cada gallinero sus
 * tandas. La profundidad no está fija porque conejos e incubadora no tienen
 * nivel del medio.
 */
function Unidades() {
  const { lista, mensaje, crear, anular, recargar } = useCrud('unidad')
  const [nombre, setNombre] = useState('')
  const [padreId, setPadreId] = useState('')

  const nombreDe = (id: unknown): string =>
    typeof id === 'string' ? ((lista.find((u) => u.id === id)?.['nombre'] as string) ?? '') : ''

  return (
    <section className="tarjeta">
      <h2>Lugares</h2>
      <p style={{ marginTop: 0, color: '#666', fontSize: '0.88rem' }}>
        Dónde están los animales. Un lugar puede estar adentro de otro: Aves contiene los gallineros,
        y cada gallinero sus tandas.
      </p>

      {lista.length === 0 ? (
        <Vacio>Todavía no hay ninguno.</Vacio>
      ) : (
        <table>
          <tbody>
            {lista.map((u) => (
              <tr key={u.id}>
                <td>
                  {u['nombre'] as string}
                  {typeof u['unidadPadreId'] === 'string' && (
                    <div style={{ fontSize: '0.78rem', color: '#666' }}>dentro de {nombreDe(u['unidadPadreId'])}</div>
                  )}
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="chico fantasma" onClick={() => void anular(u.id)}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form
        style={{ marginTop: '0.75rem' }}
        onSubmit={(e) => {
          e.preventDefault()
          void crear({ nombre, unidadPadreId: padreId }).then((ok) => {
            if (ok) {
              setNombre('')
              recargar()
            }
          })
        }}
      >
        <Campo etiqueta="Nombre">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Gallinero 1" />
        </Campo>
        <Campo etiqueta="¿Está dentro de otro lugar? (opcional)">
          <Selector valor={padreId} alCambiar={setPadreId} opciones={lista} vacio="No, cuelga de la granja" />
        </Campo>
        <button type="submit" className="fantasma" disabled={nombre === ''}>
          Agregar lugar
        </button>
      </form>

      {mensaje !== null && <Aviso clase="error">{mensaje}</Aviso>}
    </section>
  )
}

/** Razas: Cornish, Blanco, Negra INTA. Se crean una vez y se reutilizan. */
function Razas() {
  const { lista, mensaje, crear, anular } = useCrud('raza')
  const especies = useDatos(() => api.listar('especie'))
  const [nombre, setNombre] = useState('')
  const [especieId, setEspecieId] = useState('')

  const nombreEspecie = (id: unknown): string =>
    typeof id === 'string'
      ? ((((especies.datos ?? []) as Registro[]).find((e) => e.id === id)?.['nombre'] as string) ?? '')
      : ''

  return (
    <section className="tarjeta">
      <h2>Razas</h2>
      <p style={{ marginTop: 0, color: '#666', fontSize: '0.88rem' }}>
        La raza no es la especie ni el propósito: Cornish y Blanco son las dos gallinas, y las dos
        pueden ir a engorde o a reproducción.
      </p>

      {lista.length === 0 ? (
        <Vacio>Todavía no hay ninguna.</Vacio>
      ) : (
        <table>
          <tbody>
            {lista.map((r) => (
              <tr key={r.id}>
                <td>
                  {r['nombre'] as string}
                  <div style={{ fontSize: '0.78rem', color: '#666' }}>{nombreEspecie(r['especieId'])}</div>
                </td>
                <td style={{ textAlign: 'right' }}>
                  <button type="button" className="chico fantasma" onClick={() => void anular(r.id)}>
                    Borrar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <form
        style={{ marginTop: '0.75rem' }}
        onSubmit={(e) => {
          e.preventDefault()
          void crear({ nombre, especieId }).then((ok) => ok && setNombre(''))
        }}
      >
        <Campo etiqueta="Nombre">
          <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Cornish" />
        </Campo>
        <Campo etiqueta="¿De qué especie?">
          <Selector valor={especieId} alCambiar={setEspecieId} opciones={(especies.datos ?? []) as Registro[]} />
        </Campo>
        <button type="submit" className="fantasma" disabled={nombre === ''}>
          Agregar raza
        </button>
      </form>

      {mensaje !== null && <Aviso clase="error">{mensaje}</Aviso>}
    </section>
  )
}
