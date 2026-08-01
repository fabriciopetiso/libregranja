# Libregranja

Gestión de granja: lo que entra, lo que sale, las existencias y los números.

Aplicación web que se instala en el celular desde el navegador, sin tiendas. Pensada
para cargarse con una mano, en un galpón, con conexión intermitente.

Software libre bajo [AGPL-3.0](LICENSE).

---

## Qué hace

Cuatro cosas, y nada más hasta que estas cuatro funcionen en una granja de verdad:

- **Registrar lo que entra** — compras y gastos, imputables a una tanda o generales.
- **Registrar lo que sale** — ventas, con lo cobrado y lo que queda como deuda.
- **Ver el stock de animales** — cuántos hay vivos en cada tanda, siempre al día.
- **Ver los números** — alimento por tanda, gastos por rubro, ventas y resultado.

## Las dos ideas que sostienen todo

**Nada está escrito en el código.** Ninguna categoría, especie, alimento, producto,
rubro ni plantilla vive en el programa: son datos que el usuario crea y borra desde la
app. La interfaz decide qué campos mostrar leyendo capacidades, nunca nombres. Una
granja que no cría gallinas borra la especie y no se rompe nada.

**Ningún saldo se guarda.** No existe `cantidad_actual` en ninguna tabla. Las
existencias, el costo por bolsa, la deuda y el costo de cada tanda se recalculan desde
los movimientos en cada consulta. Cargar hoy un comprobante con fecha del mes pasado
corrige el histórico solo.

## Poner a andar

```bash
npm ci
npm run granja:crear -- --nombre "Mi granja" --usuario fabricio --clave ********
npm run build
npm start
```

Queda en `http://localhost:8787`. En desarrollo, `npm run dev` levanta la API y Vite
con recarga en caliente.

Requiere Node 18.19 o superior; recomendado Node 22 LTS.

## Verificar

```bash
npm test        # los casos de prueba de la especificación
npm run typecheck
```

Los tests de [`especificacion.test.ts`](src/core/especificacion.test.ts) son los casos
de §8 del documento de especificación, verificados a mano antes de escribir el código.
Si el código y ese archivo se contradicen, gana ese archivo.

## Cómo está armado

```
src/
  core/       motor de cálculo. TypeScript puro: sin base de datos, sin framework.
  db/         esquema SQL, migraciones y acceso a datos. Sin ORM.
  servidor/   API REST con Hono, sesiones con scrypt.
  web/        PWA en React. CSS plano, sin toolchain de estilos.
```

El motor no toca la base: recibe movimientos y devuelve estado. Por eso los casos de
prueba corren en milisegundos sin levantar nada, y por eso cambiar de SQLite a otra
base no lo afectaría.

**Una sola pasada cronológica.** Todos los movimientos de todas las tandas se recorren
juntos, en orden de fecha. Eso resuelve de una que el costo de una tanda dependa del de
otra cuando hubo traslados, sin grafos ni detección de ciclos: mover animales de ida y
de vuelta entre dos tandas no genera una dependencia circular, porque el tiempo no
tiene ciclos.

**El dinero es BigInt de centavos.** Nunca punto flotante. El costo por bolsa no se
almacena: es el cociente de dos enteros, y por eso puede valer $14.140,625 sin que
exista ningún valor fraccionario guardado.

## Dependencias

En producción corren seis paquetes: `hono`, `better-sqlite3` y `zod` en el servidor;
`react`, `react-dom` y `react-router-dom` compilados a archivos estáticos. Todo lo
demás es herramienta de desarrollo y no existe en el servidor.

Sin servicios de terceros, sin CDNs, sin telemetría. La base de datos es un archivo
que se copia a un pendrive y se abre con cualquier herramienta SQLite.

## Documentos

- [Especificación técnica](docs/ESPECIFICACION-TECNICA.md) — qué hace la app
- [Decisiones](docs/DECISIONES.md) — por qué está construida así
- [Plan de trabajo](docs/PLAN-DE-TRABAJO.md) — hitos y cómo se verifica cada uno
