-- Jerarquía completa, razas, e imputación hasta el animal.
--
-- Cierra el modelo acordado:
--   Granja → Lugar (anidable) → Tanda → Animal
--
-- Y con él, la regla que lo sostiene: una compra o una venta apunta siempre a
-- un nivel, y lo que se carga en un nivel cuenta en todos los de arriba. Por
-- defecto cae en la granja, para que guardar nunca se trabe por no saber
-- todavía a quién imputárselo.

-- Un lugar dentro de otro: Aves contiene Gall 1, que contiene las tandas.
-- Sin profundidad fija, porque Conejos e Incubadora no tienen nivel del medio.
ALTER TABLE unidad ADD COLUMN unidad_padre_id TEXT REFERENCES unidad(id);
CREATE INDEX ix_unidad_padre ON unidad(unidad_padre_id) WHERE eliminado = 0;

-- La raza es un tercer eje, distinto de la especie y del propósito: Cornish y
-- Blanco son gallinas, y las dos pueden ir a engorde o a reproducción.
CREATE TABLE raza (
  id            TEXT PRIMARY KEY,
  granja_id     TEXT NOT NULL REFERENCES granja(id),
  nombre        TEXT NOT NULL,
  especie_id    TEXT REFERENCES especie(id),
  creado_en     TEXT NOT NULL,
  modificado_en TEXT NOT NULL,
  eliminado     INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX ix_raza_especie ON raza(especie_id) WHERE eliminado = 0;

ALTER TABLE tanda ADD COLUMN raza_id TEXT REFERENCES raza(id);
ALTER TABLE tanda ADD COLUMN especie_id TEXT REFERENCES especie(id);
ALTER TABLE animal ADD COLUMN raza_id TEXT REFERENCES raza(id);

-- La especie de una tanda venía de su categoría. Ahora es de la tanda: en un
-- mismo tipo "Engorde" puede haber gallinas y conejos.
UPDATE tanda
   SET especie_id = (SELECT c.especie_id FROM categoria c WHERE c.id = tanda.categoria_id)
 WHERE especie_id IS NULL;

-- El movimiento ya tenía animal_id para saber qué madre parió. Ahora también
-- sirve para imputar: los medicamentos de Rambo se le cargan a Rambo.
CREATE INDEX ix_movimiento_animal ON movimiento(animal_id) WHERE eliminado = 0;

-- Los movimientos que salen de una misma carga quedan unidos, para poder
-- anular la compra entera en vez de movimiento por movimiento.
ALTER TABLE movimiento ADD COLUMN grupo_id TEXT;
CREATE INDEX ix_movimiento_grupo ON movimiento(grupo_id) WHERE eliminado = 0;

-- Plantilla y categoría eran un molde de un molde. Queda la categoría, que
-- pasa a llamarse "tipo" en la interfaz y ya guarda sus propias capacidades.
-- Las granjas que sólo tenían plantillas se quedaban sin tipos para elegir:
-- se convierten, respetando las que ya hubieran creado.
INSERT INTO categoria (
  id, granja_id, nombre, plantilla_id,
  animales_con_nombre, registra_nacimientos, registra_huevos,
  registra_carga_incubacion, registra_peso, registra_alimento,
  creado_en, modificado_en, eliminado
)
SELECT
  p.id || '-tipo', p.granja_id, p.nombre, p.id,
  p.animales_con_nombre, p.registra_nacimientos, p.registra_huevos,
  p.registra_carga_incubacion, p.registra_peso, p.registra_alimento,
  p.creado_en, p.modificado_en, 0
FROM plantilla p
WHERE p.eliminado = 0
  AND NOT EXISTS (
    SELECT 1 FROM categoria c
     WHERE c.granja_id = p.granja_id AND c.eliminado = 0
       AND (c.plantilla_id = p.id OR c.nombre = p.nombre)
  );
