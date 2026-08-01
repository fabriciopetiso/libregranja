# Especificación — App de gestión de granja

**Versión:** 2.1 · 1 de agosto de 2026
**Uso:** es la fuente de verdad de **qué** hace la app. El **cómo** se construye, y las resoluciones a las ambigüedades que tenía la versión 2.0, están en [DECISIONES.md](DECISIONES.md).
**Contexto:** Argentina, pesos argentinos. Android, usada con conexión a internet. Español rioplatense en toda la interfaz.

Este documento es para construir. No contiene investigación, análisis de mercado ni justificaciones.

---

## 1. Qué hace la app

Cuatro cosas. Nada más hasta que estas cuatro funcionen.

**Registrar lo que entra** — compras y gastos: qué, cuándo, cuánto costó, y a qué tanda o rubro corresponde.

**Registrar lo que sale** — ventas: qué producto, cuánto, a qué precio, cuándo, a quién, y si quedó deuda.

**Ver el stock de animales** — cuántos animales vivos hay en cada tanda, siempre al día.

**Ver los números** — alimento por tanda, subtotales por rubro, totales, y todo filtrable por fecha.

---

## 2. Nada está fijo en el código

La granja tiene 6 conejas, 5 razas de gallinas con propósitos distintos, entre 10 y 20 tandas simultáneas y al menos 6 alimentos. Eso cambia mes a mes y en otra granja es completamente distinto.

**Ninguna categoría, especie, alimento, producto ni rubro de gasto se escribe en el código.** Todo es data que el usuario crea, edita y borra desde la app. Si aparece un `if categoria == "engorde"` en el código, está mal.

### 2.1 Plantillas de categoría

Una categoría define un tipo de tanda. Para no arrancar de cero, cada categoría se crea a partir de una **plantilla**, que es simplemente un conjunto de capacidades activadas.

Las capacidades disponibles son: `animales_con_nombre` (cada animal se sigue de a uno), `registra_nacimientos`, `registra_huevos` (recolección diaria), `registra_carga_incubacion` (huevos cargados y nacidos), `registra_peso`, `registra_alimento`.

Las plantillas que vienen cargadas por defecto:

| Plantilla | Capacidades activadas |
|---|---|
| Reproductores | animales con nombre · nacimientos · alimento |
| Engorde | peso · alimento |
| Postura | huevos · alimento |
| Incubación | carga de incubación |
| Cría | nacimientos · peso · alimento |
| Genérica | alimento |

El usuario crea una categoría eligiendo una plantilla, poniéndole nombre y asignándole una especie. Puede además **crear plantillas nuevas** marcando las capacidades que quiera. Las plantillas por defecto se pueden editar y borrar.

La app no tiene ninguna lógica que dependa del nombre de una plantilla ni de una categoría. Solo lee las capacidades para decidir qué campos mostrar.

---

## 3. Modelo de datos

Campos de control en todas las entidades: `id` (UUID), `creadoEn`, `modificadoEn`, `eliminado`. Nada se borra físicamente.

### 3.1 Configuración

**`especie`** — nombre. Por defecto: conejo, gallina.

**`plantilla`** — nombre y las seis capacidades como booleanos. Por defecto las seis de la tabla anterior.

**`categoria`** — nombre, `especieId`, `plantillaId`. Al crearse copia las capacidades de la plantilla, de modo que editar la plantilla después no altera categorías ya creadas.

**`insumo`** — nombre, `presentacion` (`bolsa` o `unidad`), `gramosPorBolsa` opcional, `minimoReposicion`. Se crea desde la misma pantalla de carga sin salir de ella.

**`producto`** — nombre, `unidadVenta` (`kg`, `unidad`, `maple`, `docena`), `unidadesPorBulto` opcional, `descuentaAnimales` (booleano).

**`rubro_gasto`** — nombre. Por defecto: alimento, pollitos, reproductores, veterinaria, infraestructura, mano de obra, energía, flete, otros.

**`contraparte`** — nombre, contacto, `esCliente`, `esProveedor`, nota.

### 3.2 Operación

**`tanda`** — nombre, `categoriaId`, `fechaInicio`, `fechaCierre` opcional, nota. **No tiene campo de cantidad.**

**`animal`** — solo si la categoría tiene `animales_con_nombre`. Nombre, `especieId`, sexo, `tandaId`, fecha de nacimiento o ingreso, estado.

**`movimiento`** — la tabla central. Todo pasa por acá.

| Campo | Tipo | Notas |
|---|---|---|
| `fecha` | fecha | Puede ser retroactiva |
| `tipo` | enum | Ver abajo |
| `tandaId` | UUID, opcional | |
| `refId` | UUID, opcional | Insumo, producto o rubro según el tipo |
| `cantidad` | decimal | Bolsas, unidades, kilos o animales según el tipo |
| `importe` | entero, opcional | Centavos |
| `contraparteId` | UUID, opcional | |
| `tandaDestinoId` | UUID, opcional | Solo en traslados |
| `animalId` | UUID, opcional | |
| `motivo` | texto, opcional | |
| `fotoId` | UUID, opcional | Comprobante |

Tipos: `compra`, `gasto`, `entrega_insumo`, `venta`, `cobro`, `pago`, `ingreso_animales`, `nacimiento`, `muerte`, `traslado`, `recuento`, `carga_incubacion`, `fertiles`, `huevos`, `peso`.

`cantidad` es siempre un entero, en la unidad base de aquello a lo que se refiere: bolsas, animales, huevos, o gramos cuando se trata de un peso o de un producto que se vende por kilo.

Una sola tabla para todo. Las pantallas son consultas distintas sobre ella. Agregar un tipo nuevo no obliga a tocar el esquema.

---

## 4. Reglas de cálculo

**Todo saldo se deriva, nunca se guarda.** No existe ningún campo `cantidadActual` en ninguna entidad. Los movimientos se recorren en orden de `fecha`, después momento de carga, después `id`. Un movimiento cargado tarde con fecha vieja entra en su lugar y corrige el histórico.

- **Existencias de una tanda** = ingresos + nacimientos + traslados entrantes − muertes − ventas − traslados salientes ± recuentos
- **Stock de un insumo** = compras − entregas ± recuentos
- **Deuda de una contraparte** = ventas − cobros
- **Costo de una tanda** = entregas de insumo imputadas + gastos con esa tanda + costo de animales ingresados + costo arrastrado por traslados entrantes

**Costo por bolsa: promedio ponderado móvil.** Se acumulan bolsas e importe; el costo por bolsa es el cociente. Comprar recalcula. Entregar imputa al costo vigente y no lo cambia.

**El dinero va en enteros de centavos.** Nunca punto flotante. Los pesos de animales en gramos, enteros. El costo por bolsa **no se almacena**: es el cociente de dos enteros, y por eso puede valer $14.140,625 sin que exista ningún valor fraccionario guardado.

**El costo de una tanda depende del de otra** cuando hubo traslados. Todos los movimientos de todas las tandas se recorren juntos en orden de fecha, no tanda por tanda: así el estado del origen ya está calculado cuando se llega al traslado, y mover animales de ida y de vuelta entre dos tandas no genera una dependencia circular. Lo que arrastra un traslado es `costo del origen × animales trasladados / existencias del origen` en ese momento.

**El recuento guarda la cantidad contada**, no la diferencia. La diferencia se deriva y se muestra al confirmar; guardarla la dejaría mintiendo apenas entrara un movimiento retroactivo anterior.

**Ninguna validación bloquea una carga.** Entregar más bolsas de las que hay, o registrar más muertes que existencias, se permite y se avisa. Falta un registro anterior, no sobra este.

---

## 5. Pantallas de carga

### 5.1 Compras y gastos

Una pantalla. Se elige el ítem de una lista de los más usados, ordenada por frecuencia, más un botón para crear uno nuevo sin salir. Después dos números: cantidad e importe **total pagado**. El unitario lo calcula el sistema y nunca se pide.

Gastos que no son insumos usan el mismo flujo eligiendo rubro en lugar de ítem.

Un interruptor define si va a una tanda concreta o es general. Foto del comprobante opcional.

El alimento se maneja **por bolsa entera**: comprar carga bolsas al depósito, entregar asigna bolsas a una tanda. La pantalla trabaja en bolsas, no en kilos. No se reparten fracciones de bolsa.

### 5.2 Ventas

Producto del catálogo, cantidad, precio, importe y contraparte. El precio se escribe en cada venta; el sistema propone el último precio de ese producto como sugerencia editable.

Lo no cobrado queda como deuda y aparece en el inicio hasta saldarse.

Si el producto tiene `descuentaAnimales`, la venta baja las existencias de la tanda.

### 5.3 Movimientos de animales

Dos toques y un número: tanda, tipo, cantidad. La causa de muerte es opcional.

El **recuento** registra la cantidad real contada; el sistema asienta la diferencia como ajuste con su motivo y no toca el pasado.

Los campos que se muestran dependen de las capacidades de la categoría: una tanda de postura pide huevos del día, una de incubación pide huevos cargados y nacidos, una de reproductores permite asociar el nacimiento a un animal con nombre.

---

## 6. Pantalla de visualización

Un rango de fechas arriba, común a todo. Por defecto, el mes en curso.

### 6.1 Estado actual

Todas las tandas activas agrupadas por categoría, cada una con sus existencias vivas y los días que lleva abierta. Al pie, el total de animales por especie y el total general de la granja.

### 6.2 Alimento por tanda

Tabla con una fila por tanda: bolsas recibidas, kilos equivalentes, costo del alimento, y qué porcentaje representa sobre el costo total de esa tanda. Al pie, totales de bolsas, kilos e importe.

Debajo, el estado del depósito: bolsas en existencia por insumo, costo por bolsa vigente, valor total del depósito, y aviso de los que están por debajo del mínimo.

### 6.3 Gastos por rubro

Tabla con una fila por rubro, su subtotal del período y qué porcentaje representa del total. Fila de total general al pie. Cada rubro se despliega para ver sus movimientos.

Se puede filtrar por tanda, y entonces la tabla muestra los gastos de esa tanda por rubro con sus subtotales y total.

### 6.4 Ventas

Tabla con una fila por producto: cantidad vendida, importe, precio promedio del período. Total general al pie. Debajo, deuda pendiente por contraparte y total adeudado.

### 6.5 Resultado del período

Total de ventas, total de gastos, y la diferencia. Un solo renglón, sin interpretación.

### 6.6 Regla común

**Cualquier número de cualquier tabla se puede tocar para llegar a los movimientos que lo componen**, hasta el registro individual con su foto de comprobante. Un número que no se puede abrir no se usa para decidir.

---

## 7. La incubadora

Es una tanda con categoría de plantilla Incubación. Se trata como máquina de producción, no como calendario.

Se registra una **carga** con especie, cantidad de huevos y fecha. Después el **nacimiento** con la cantidad de nacidos. El sistema muestra el porcentaje de nacimientos sobre huevos cargados.

Los nacidos salen por venta o por traslado a otra tanda. El traslado arrastra el costo, así que la tanda de destino arranca con lo que costó producir esos animales y no con cero.

Si se registra la cantidad de fértiles, se muestra además el porcentaje sobre fértiles. Si no se registra, no se estima. Los fértiles se cargan como un movimiento de tipo `fertiles` sobre la misma tanda.

---

## 8. Casos de prueba

Verificados a mano. Se implementan antes que el código que los satisface.

**Costo por bolsa.** Depósito vacío. Compra de 20 bolsas por $250.000 → $12.500,00 por bolsa. Compra de 12 bolsas por $180.000 → $13.437,50 sobre 32 bolsas. Entrega de 8 bolsas → imputa $107.500,00, quedan 24 bolsas valuadas en $322.500,00, el costo por bolsa no cambia. Compra de 8 bolsas por $130.000 → $14.140,625 sobre 32 bolsas. Entrega de 12 bolsas → imputa $169.687,50, quedan 20 bolsas valuadas en $282.812,50.

**Existencias.** Ingresan 100, mueren 7, se venden 60, se trasladan 10 → quedan 23. Un recuento de 21 asienta un ajuste de −2 y deja 21.

**Deuda.** Venta de $80.000 con cobro de $50.000 → deuda $30.000. Cobro posterior de $30.000 → deuda cero y sale del inicio.

**Subtotales por rubro.** Gastos del período de $120.000 en alimento, $45.000 en veterinaria y $35.000 en infraestructura → subtotales iguales a esos importes, total $200.000, y participaciones de 60,0%, 22,5% y 17,5%.

**Incubadora.** 1.200 huevos cargados y 912 nacidos → 76,00% sobre cargados. Con 1.044 fértiles registrados, además 87,36% sobre fértiles. Sin el dato de fértiles, ese porcentaje no se muestra.

---

## 9. Stack

Aplicación web para Android, usada con conexión. Backend con base de datos y cuentas de usuario desde el principio, porque la carga es compartida entre más de una persona.

Se abre desde el navegador del celular y se puede instalar en la pantalla de inicio. Sin tiendas de aplicaciones.

---

## 10. Qué no hacer

No escribir en el código ninguna categoría, especie, alimento, producto, rubro ni plantilla: todo es data editable. No poner lógica que dependa del nombre de una categoría; usar las capacidades. No guardar ningún saldo derivable. No borrar registros físicamente. No usar punto flotante para dinero. No bloquear una carga por validación. No pedir un dato calculable, empezando por el precio unitario. No inventar datos faltantes. No agregar funciones fuera de las cuatro de la sección 1 hasta que esas cuatro estén andando en la granja.
