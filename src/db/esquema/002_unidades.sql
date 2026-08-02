-- Unidades productivas y familias de insumos.
--
-- Falta un nivel entre la granja y la tanda. Una granja tiene lugares —el
-- gallinero, la conejera, la incubadora, el chiquero— y dentro de cada uno
-- conviven tandas de propósitos distintos: en el mismo gallinero puede haber
-- reproductoras Negra INTA y parrilleros de engorde.
--
-- Sin ese nivel, veinte tandas simultáneas son una lista plana donde no se
-- encuentra nada. Con él, la pregunta "cuánto me cuesta el gallinero" tiene
-- respuesta.
--
-- La unidad NO tiene capacidades ni tipo: es un agrupador. Qué se registra en
-- cada tanda lo sigue definiendo su categoría, como hasta ahora.

CREATE TABLE unidad (
  id            TEXT PRIMARY KEY,
  granja_id     TEXT NOT NULL REFERENCES granja(id),
  nombre        TEXT NOT NULL,
  nota          TEXT,
  creado_en     TEXT NOT NULL,
  modificado_en TEXT NOT NULL,
  eliminado     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_unidad_granja ON unidad(granja_id) WHERE eliminado = 0;

-- Nullable: las tandas que ya existen no tienen unidad y siguen funcionando.
ALTER TABLE tanda ADD COLUMN unidad_id TEXT REFERENCES unidad(id);
CREATE INDEX ix_tanda_unidad ON tanda(unidad_id) WHERE eliminado = 0;

-- La familia de un insumo es su rubro de gasto.
--
-- Además de ordenar la lista de carga, cierra un hueco que estaba abierto: una
-- compra de insumo lleva insumo, no rubro, así que no aparecía en el reporte de
-- gastos por rubro (§6.3). Con esto, comprar balanceado suma al rubro Alimento
-- sin que haya que elegirlo a mano.
ALTER TABLE insumo ADD COLUMN rubro_id TEXT REFERENCES rubro_gasto(id);

-- Un usuario puede trabajar en más de una granja.
--
-- `usuario.granja_id` queda como la granja con la que abre la sesión; esta
-- tabla dice a cuáles más tiene acceso y con qué rol en cada una.
CREATE TABLE usuario_granja (
  usuario_id TEXT NOT NULL REFERENCES usuario(id),
  granja_id  TEXT NOT NULL REFERENCES granja(id),
  rol        TEXT NOT NULL CHECK (rol IN ('admin', 'operador')),
  creado_en  TEXT NOT NULL,
  PRIMARY KEY (usuario_id, granja_id)
);

-- Los usuarios que ya existen quedan como miembros de su granja.
INSERT INTO usuario_granja (usuario_id, granja_id, rol, creado_en)
  SELECT id, granja_id, rol, creado_en FROM usuario WHERE eliminado = 0;
