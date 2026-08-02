# Decisiones

Registro de lo que se resolvió y por qué. La especificación dice **qué** hace la app;
este archivo dice **cómo** se construye y qué ambigüedades se cerraron.

Fecha: 1 de agosto de 2026.

---

## Resoluciones sobre la especificación

Cinco puntos donde la especificación se contradecía o quedaba abierta.

### R1 · El costo unitario no se almacena

§4 exige enteros de centavos, pero §8 pide que el costo por bolsa valga $14.140,625.

Se guardan **dos enteros por depósito**: `unidades` y `centavos`. El costo por bolsa es
el cociente, derivado al mostrar. La imputación de una entrega es
`repartir(centavos, cantidad, unidades)` y **ese mismo entero se resta del acumulado**,
no una reconstrucción a partir de un unitario redondeado.

Invariante verificada por test: imputado + saldo del depósito = comprado, al centavo.

### R2 · Retroactividad: recomputo por fecha

Orden canónico `(fecha, creadoEn, id)`, fold recomputado en cada consulta. Cargar un
movimiento con fecha vieja **corrige el histórico**. El `id` desempata para que dos
consultas sobre los mismos datos nunca difieran.

Descartada la alternativa append-only por orden de carga: contradice §4.

### R3 · El traslado con costo se resuelve en una sola pasada cronológica

§7 hace que el costo de una tanda dependa del de otra. Calcular tanda por tanda exigiría
orden topológico y detección de ciclos, y los ciclos son reales: mover animales de ida y
de vuelta entre dos tandas es normal.

Se recorren **todos los movimientos de todas las tandas juntos, en orden de fecha**.
Cuando la pasada llega a un traslado, el estado del origen ya está calculado. El orden
correcto de cálculo es el cronológico, y el tiempo no tiene ciclos.

Reparto: `costo_origen × trasladados / existencias_origen` en ese momento. Desde una
tanda sin existencias arrastra $0 y deja aviso (§4 no bloquea).

### R4 · El recuento guarda lo contado, no la diferencia

Guardar el delta lo dejaría mintiendo apenas entrara un movimiento retroactivo anterior
al recuento. El movimiento `recuento` es un **set-point**; la diferencia se deriva y se
muestra al confirmar la carga, pero no se persiste.

### R5 · Bolsas enteras

Se elimina la fracción de bolsa que §5.1 admitía como opción secundaria. `cantidad` es
un entero en la unidad base de aquello a lo que se refiere: bolsas, animales, huevos, o
gramos para pesos y productos vendidos por kilo.

### R6 · `fertiles` como tipo de movimiento

§7 pide registrar huevos fértiles, pero el esquema de §3.2 no tiene dónde. Se usa el
mecanismo que la propia spec prevé —"agregar un tipo nuevo no obliga a tocar el
esquema"— en lugar de sumarle un campo a `movimiento`.

---

## Decisiones de producto

| # | Decisión |
|---|---|
| P1 | **Multi-granja**: `granjaId` en todas las entidades desde el día uno, aunque hoy haya una sola granja. |
| P2 | **Dos roles**: *admin* (configura, anula, gestiona usuarios) y *operador* (carga y consulta). |
| P3 | **Movimientos inmutables**: no se editan, se anulan (`eliminado`) y se vuelve a cargar. Con promedio ponderado móvil, editar un importe viejo en silencio produce números que nadie puede explicar. |
| P4 | **Cola de reintento**: si se corta la señal al confirmar una carga, queda en cola local y se reintenta al volver la conexión. No es offline-first. |
| P5 | **Sin migración**: no hay historia previa que importar. |
| P6 | **Licencia AGPL-3.0-or-later**: para una app web es la que obliga a publicar los cambios a quien la hospede modificada. |

---

## Stack

Criterio que ordena todo lo demás: **mínima dependencia externa y software libre**.
Una granja carga del orden de 10.000 movimientos por año, unos 2 MB. Eso descarta
media infraestructura por innecesaria.

| Capa | Elección | Motivo |
|---|---|---|
| Base | SQLite en WAL | Un archivo. Sin servicio que administrar ni que se caiga. Dominio público. |
| Acceso a datos | SQL a mano + migraciones `.sql` numeradas | 12 tablas no justifican un ORM. Auditable de un vistazo. |
| Backend | Node 22 LTS + Hono | Hono no tiene dependencias transitivas. |
| Frontend | React + Vite, compilado a estáticos | Sin SEO ni first-paint crítico: el SSR no aporta y cuesta un runtime entero en producción. |
| Estilos | CSS plano con custom properties | 15 pantallas mobile-first no necesitan toolchain. Carga más rápido con señal mala. |
| Claves | `crypto.scrypt` del core de Node | Evita una dependencia nativa. KDF aceptado por OWASP. |
| Sesiones | Tabla + cookie httpOnly SameSite=Lax | Sin OAuth: los usuarios los da de alta un admin. |
| PWA | `manifest.json` + service worker propio | Sólo se cachea el app shell. |
| Deploy | systemd + Caddy | Sin base de datos que orquestar, no hace falta Docker. TLS automático. |
| Backup | `sqlite3 .backup` por cron + copia fuera de la máquina | Restaurar es copiar un archivo. |

Dependencias de producción: `hono`, `better-sqlite3`, `zod` en el servidor; `react`,
`react-dom`, `react-router` compilados a estáticos. Todo lo demás es `devDependencies`
y no existe en la máquina de producción.

Licencias de terceros: MIT, Apache-2.0 y dominio público.

### Soberanía sobre los datos

- El dato es un archivo SQLite que se copia y se abre con cualquier herramienta.
- Export completo a CSV desde la app.
- Cero CDNs: fuentes y assets servidos desde el propio servidor.
- Cero telemetría.
- Build reproducible offline con lockfile commiteado.
- La base es intercambiable: el motor es TypeScript puro y sólo recibe movimientos.
  Migrar a Postgres sería cambiar la capa de repositorios; el dominio no se entera.

### Límite conocido

SQLite se degrada con escritura concurrente sostenida de muchos procesos. Con WAL y el
perfil de uso previsto —dos a cinco personas, cargas espaciadas, mayormente lecturas— no
se llega a ese techo. Si algún día se llega, el punto anterior cubre la salida.

---

## Reglas de arquitectura

1. **El motor no toca la base.** `src/core/` son funciones puras: reciben movimientos y
   devuelven estado. Los casos de §8 corren sin Postgres, sin SQLite y sin servidor.
2. **Nada hardcodeado.** Ninguna categoría, especie, alimento, producto, rubro ni
   plantilla aparece como literal en el código. La UI decide qué campos mostrar leyendo
   los seis booleanos de capacidades. Un chequeo en CI hace grep y falla el build si
   aparece alguno.
3. **Ningún saldo se guarda.** No existe `cantidadActual` en ninguna entidad.
4. **Todo agregado devuelve sus componentes.** Cada celda de cada tabla se construye a
   partir de ids de movimiento, no de un número suelto (§6.6). Se diseña así desde la
   primera consulta, no se agrega después.
5. **Dinero en BigInt.** Centavos, siempre. Ni un `number` en un cálculo de dinero.
6. **UUID generados en el cliente.** Cuesta cero hoy y habilita sincronización offline
   mañana sin migrar nada.
7. **Fechas:** `fecha` es día calendario `AAAA-MM-DD` sin hora, en
   `America/Argentina/Buenos_Aires`. `creadoEn` es timestamp con zona.

---

### R7 · Un nivel entre la granja y la tanda

La spec va de granja a tanda directamente. Con diez o veinte tandas simultáneas eso
es una lista plana donde no se encuentra nada, y no hay forma de preguntar "cuánto me
cuesta el gallinero".

Se agrega la **unidad productiva**: el gallinero, la conejera, la incubadora, el
chiquero. Es un agrupador y nada más: no tiene capacidades ni tipo. Qué se registra en
cada tanda lo sigue definiendo su categoría.

```
Granja → Unidad productiva → Tanda → Animales con nombre
```

Dentro de una misma unidad conviven tandas de propósitos distintos: en el mismo
gallinero, reproductoras Negra INTA y parrilleros de engorde.

### R8 · Multi-granja de verdad

`usuario_granja` dice a qué granjas tiene acceso cada persona y con qué rol en cada
una. `usuario.granja_id` queda como la granja con la que abre la sesión. Cambiar de
granja cambia todo lo que se ve; los datos están completamente separados.

## Abierto

- **VPS y dominio.** Con 1 vCPU y 1 GB de RAM sobra: Debian 12 o Ubuntu 24.04.
- **Cómo entra una compra de insumo en el reporte por rubro (§6.3).** Hoy el reporte
  agrupa los movimientos de tipo `gasto`, que sí llevan rubro. Una compra lleva insumo,
  no rubro. Lo más probable es agregarle `rubroId` al insumo, pero la spec no lo define
  y no se inventa.
- **Node 22 en la máquina de desarrollo.** Hoy hay Node 18, que dejó de tener soporte en
  abril de 2025.
