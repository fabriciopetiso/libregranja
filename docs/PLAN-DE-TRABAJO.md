# Plan de trabajo

Seis hitos. Cada uno se verifica corriendo algo, no leyendo código.

**Definición de terminado del proyecto:** las cuatro cosas de §1 de la especificación
andando en el celular de la granja, con datos reales, cargados por más de una persona.

---

## Hito 0 · Andamiaje — ✅ hecho

Repo, TypeScript, Vitest, licencia, `.gitignore` que mantiene los datos de la granja
fuera del control de versiones.

## Hito 1 · Motor de cálculo — ✅ hecho

`src/core/` en TypeScript puro, sin base de datos y sin framework.

- `dinero.ts` — aritmética en BigInt, reparto proporcional con redondeo sin fuga de centavos
- `tipos.ts` — modelo del dominio
- `motor.ts` — la pasada cronológica única (costeo, existencias, traslados con arrastre, incubación)
- `reportes.ts` — las consultas de §6, cada agregado con sus componentes

**Verificación:** 28 tests en verde, incluidos los cinco casos de §8, más traslado con
arrastre de costo, ciclo entre tandas, retroactividad, independencia del orden de carga,
cargas en descubierto y anulación.

```bash
npm test && npm run typecheck
```

## Hito 2 · Persistencia y cuentas

Esquema SQLite con migraciones `.sql` numeradas, repositorios, sesiones, dos roles,
`granjaId` en todo. API REST bajo `/api/v1` con Hono.

**Verificación:** entrás con usuario y contraseña desde el celular y la sesión persiste.

## Hito 3 · Configuración

CRUD de especies, plantillas, categorías, insumos, productos, rubros y contrapartes.
Las capacidades se copian de la plantilla al crear la categoría, de modo que editar la
plantilla después no altera categorías ya creadas.

**Verificación:** creás una categoría desde una plantilla y las capacidades mandan sobre
qué campos muestra la UI. Ningún nombre de categoría aparece en el código.

## Hito 4 · Pantallas de carga

Compras y gastos, ventas, movimientos de animales, fotos de comprobante con compresión
en el navegador, cola de reintento.

Ergonomía de galpón: botones de 48 px o más, teclado numérico, listas ordenadas por
frecuencia de uso, creación de insumo o producto sin salir de la pantalla.

**Verificación:** cargás una semana real de la granja desde el celular, sin ayuda.

## Hito 5 · Visualización

Las cinco vistas de §6 con rango de fechas común y drill-down hasta el comprobante.

**Verificación:** tocás cualquier número de cualquier tabla y llegás a los movimientos
que lo componen.

## Hito 6 · Producción

PWA instalable, deploy con systemd y Caddy, backup por cron, usuarios reales, export a CSV.

**Verificación:** andando en la granja.

---

## Orden

Los hitos 2 y 3 pueden solaparse. El 5 depende de que existan datos cargados por el 4.

## Qué no se hace

Nada fuera de las cuatro funciones de §1 hasta que esas cuatro estén andando en la granja.
