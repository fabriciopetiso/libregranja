-- Un movimiento puede corresponder a una tanda, a un lugar entero, o a la granja.
--
-- Hasta acá un gasto era de una tanda o era general, sin nada en el medio. Pero
-- arreglar el techo del gallinero no es de los parrilleros ni de las
-- reproductoras: es del gallinero. Cargarlo en una tanda cualquiera ensucia su
-- costo, y cargarlo como general pierde de dónde salió.
--
-- Los tres niveles se derivan del mismo par de columnas:
--   tanda_id  lleno  → corresponde a esa tanda
--   unidad_id lleno  → corresponde a ese lugar, sin tanda concreta
--   los dos vacíos   → corresponde a toda la granja

ALTER TABLE movimiento ADD COLUMN unidad_id TEXT REFERENCES unidad(id);
CREATE INDEX ix_movimiento_unidad ON movimiento(unidad_id) WHERE eliminado = 0;
