-- Esquema inicial.
--
-- Reglas que este archivo respeta y que no hay que romper después:
--   · Nada se borra físicamente: todo lleva `eliminado`.
--   · Ningún saldo se guarda. No hay `cantidad_actual` en ninguna tabla.
--   · `granja_id` en todo, desde el día uno.
--   · El dinero es INTEGER de centavos (int64 de SQLite), leído como BigInt.
--   · Los nombres de categorías, especies, alimentos, rubros y plantillas son
--     data, no código: las filas de abajo son valores iniciales editables, y
--     ninguna consulta del sistema depende de ellos.

PRAGMA foreign_keys = ON;

CREATE TABLE granja (
  id            TEXT PRIMARY KEY,
  nombre        TEXT NOT NULL,
  creado_en     TEXT NOT NULL,
  modificado_en TEXT NOT NULL,
  eliminado     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE usuario (
  id            TEXT PRIMARY KEY,
  granja_id     TEXT NOT NULL REFERENCES granja(id),
  nombre        TEXT NOT NULL,
  usuario       TEXT NOT NULL,
  clave_hash    TEXT NOT NULL,
  rol           TEXT NOT NULL CHECK (rol IN ('admin', 'operador')),
  creado_en     TEXT NOT NULL,
  modificado_en TEXT NOT NULL,
  eliminado     INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX ux_usuario_login ON usuario(usuario) WHERE eliminado = 0;

CREATE TABLE sesion (
  id         TEXT PRIMARY KEY,             -- hash del token, nunca el token
  usuario_id TEXT NOT NULL REFERENCES usuario(id),
  creada_en  TEXT NOT NULL,
  expira_en  TEXT NOT NULL
);
CREATE INDEX ix_sesion_usuario ON sesion(usuario_id);

-- --- Configuración: todo esto lo crea y edita el usuario -------------------

CREATE TABLE especie (
  id            TEXT PRIMARY KEY,
  granja_id     TEXT NOT NULL REFERENCES granja(id),
  nombre        TEXT NOT NULL,
  creado_en     TEXT NOT NULL,
  modificado_en TEXT NOT NULL,
  eliminado     INTEGER NOT NULL DEFAULT 0
);

-- Una plantilla es un conjunto de capacidades activadas. Nada más.
-- El sistema nunca mira el nombre de una plantilla: sólo estos seis booleanos.
CREATE TABLE plantilla (
  id                        TEXT PRIMARY KEY,
  granja_id                 TEXT NOT NULL REFERENCES granja(id),
  nombre                    TEXT NOT NULL,
  animales_con_nombre       INTEGER NOT NULL DEFAULT 0,
  registra_nacimientos      INTEGER NOT NULL DEFAULT 0,
  registra_huevos           INTEGER NOT NULL DEFAULT 0,
  registra_carga_incubacion INTEGER NOT NULL DEFAULT 0,
  registra_peso             INTEGER NOT NULL DEFAULT 0,
  registra_alimento         INTEGER NOT NULL DEFAULT 0,
  creado_en                 TEXT NOT NULL,
  modificado_en             TEXT NOT NULL,
  eliminado                 INTEGER NOT NULL DEFAULT 0
);

-- La categoría COPIA las capacidades de la plantilla al crearse, para que
-- editar la plantilla después no altere categorías ya creadas (§3.1).
CREATE TABLE categoria (
  id                        TEXT PRIMARY KEY,
  granja_id                 TEXT NOT NULL REFERENCES granja(id),
  nombre                    TEXT NOT NULL,
  especie_id                TEXT REFERENCES especie(id),
  plantilla_id              TEXT REFERENCES plantilla(id),
  animales_con_nombre       INTEGER NOT NULL DEFAULT 0,
  registra_nacimientos      INTEGER NOT NULL DEFAULT 0,
  registra_huevos           INTEGER NOT NULL DEFAULT 0,
  registra_carga_incubacion INTEGER NOT NULL DEFAULT 0,
  registra_peso             INTEGER NOT NULL DEFAULT 0,
  registra_alimento         INTEGER NOT NULL DEFAULT 0,
  creado_en                 TEXT NOT NULL,
  modificado_en             TEXT NOT NULL,
  eliminado                 INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE insumo (
  id                 TEXT PRIMARY KEY,
  granja_id          TEXT NOT NULL REFERENCES granja(id),
  nombre             TEXT NOT NULL,
  presentacion       TEXT NOT NULL CHECK (presentacion IN ('bolsa', 'unidad')),
  gramos_por_bolsa   INTEGER,
  minimo_reposicion  INTEGER NOT NULL DEFAULT 0,
  creado_en          TEXT NOT NULL,
  modificado_en      TEXT NOT NULL,
  eliminado          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE producto (
  id                 TEXT PRIMARY KEY,
  granja_id          TEXT NOT NULL REFERENCES granja(id),
  nombre             TEXT NOT NULL,
  unidad_venta       TEXT NOT NULL CHECK (unidad_venta IN ('kg', 'unidad', 'maple', 'docena')),
  unidades_por_bulto INTEGER,
  descuenta_animales INTEGER NOT NULL DEFAULT 0,
  creado_en          TEXT NOT NULL,
  modificado_en      TEXT NOT NULL,
  eliminado          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE rubro_gasto (
  id            TEXT PRIMARY KEY,
  granja_id     TEXT NOT NULL REFERENCES granja(id),
  nombre        TEXT NOT NULL,
  creado_en     TEXT NOT NULL,
  modificado_en TEXT NOT NULL,
  eliminado     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE contraparte (
  id            TEXT PRIMARY KEY,
  granja_id     TEXT NOT NULL REFERENCES granja(id),
  nombre        TEXT NOT NULL,
  contacto      TEXT,
  es_cliente    INTEGER NOT NULL DEFAULT 0,
  es_proveedor  INTEGER NOT NULL DEFAULT 0,
  nota          TEXT,
  creado_en     TEXT NOT NULL,
  modificado_en TEXT NOT NULL,
  eliminado     INTEGER NOT NULL DEFAULT 0
);

-- --- Operación --------------------------------------------------------------

-- Sin campo de cantidad: las existencias se derivan de los movimientos (§3.2).
CREATE TABLE tanda (
  id            TEXT PRIMARY KEY,
  granja_id     TEXT NOT NULL REFERENCES granja(id),
  nombre        TEXT NOT NULL,
  categoria_id  TEXT REFERENCES categoria(id),
  fecha_inicio  TEXT NOT NULL,
  fecha_cierre  TEXT,
  nota          TEXT,
  creado_en     TEXT NOT NULL,
  modificado_en TEXT NOT NULL,
  eliminado     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_tanda_granja ON tanda(granja_id) WHERE eliminado = 0;

CREATE TABLE animal (
  id                 TEXT PRIMARY KEY,
  granja_id          TEXT NOT NULL REFERENCES granja(id),
  nombre             TEXT NOT NULL,
  especie_id         TEXT REFERENCES especie(id),
  sexo               TEXT,
  tanda_id           TEXT REFERENCES tanda(id),
  fecha_nacimiento   TEXT,
  estado             TEXT,
  creado_en          TEXT NOT NULL,
  modificado_en      TEXT NOT NULL,
  eliminado          INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE foto (
  id            TEXT PRIMARY KEY,
  granja_id     TEXT NOT NULL REFERENCES granja(id),
  archivo       TEXT NOT NULL,
  creado_en     TEXT NOT NULL,
  modificado_en TEXT NOT NULL,
  eliminado     INTEGER NOT NULL DEFAULT 0
);

-- La tabla central. Todo pasa por acá.
--
-- `cantidad` es entero en la unidad base del referente: bolsas, animales,
-- huevos, o gramos para pesos y productos vendidos por kilo.
-- `importe` son centavos, siempre el total, nunca un unitario.
CREATE TABLE movimiento (
  id                TEXT PRIMARY KEY,
  granja_id         TEXT NOT NULL REFERENCES granja(id),
  fecha             TEXT NOT NULL,
  tipo              TEXT NOT NULL,
  cantidad          INTEGER NOT NULL DEFAULT 0,
  importe           INTEGER,
  tanda_id          TEXT REFERENCES tanda(id),
  ref_id            TEXT,
  contraparte_id    TEXT REFERENCES contraparte(id),
  tanda_destino_id  TEXT REFERENCES tanda(id),
  animal_id         TEXT REFERENCES animal(id),
  motivo            TEXT,
  foto_id           TEXT REFERENCES foto(id),
  creado_por        TEXT REFERENCES usuario(id),
  creado_en         TEXT NOT NULL,
  modificado_en     TEXT NOT NULL,
  eliminado         INTEGER NOT NULL DEFAULT 0
);

-- El motor lee los movimientos en orden (fecha, creado_en, id). Este índice es
-- exactamente ese orden, para que la lectura completa no ordene en memoria.
CREATE INDEX ix_movimiento_orden ON movimiento(granja_id, fecha, creado_en, id) WHERE eliminado = 0;
CREATE INDEX ix_movimiento_tanda ON movimiento(tanda_id) WHERE eliminado = 0;
CREATE INDEX ix_movimiento_ref ON movimiento(ref_id) WHERE eliminado = 0;

-- Frecuencia de uso, para ordenar las listas de carga por lo más usado (§5.1).
-- Es una vista: no guarda nada.
CREATE VIEW uso_de_referencia AS
  SELECT granja_id, tipo, ref_id, COUNT(*) AS veces, MAX(fecha) AS ultima
  FROM movimiento
  WHERE eliminado = 0 AND ref_id IS NOT NULL
  GROUP BY granja_id, tipo, ref_id;
