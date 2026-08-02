-- Stock de huevos, y qué descuenta cada producto al venderse.
--
-- Los huevos son lo único que la granja produce y después consume. Hasta acá
-- "junté 95 huevos" sumaba a un contador que no bajaba nunca: vender no
-- restaba, incubar tampoco, y no había forma de saber cuántos había hoy.
--
-- El stock se deriva como todo lo demás:
--   juntados − vendidos − incubados − perdidos
--
-- Va por tanda, y sube a su gallinero y a la granja con el mismo rollup que la
-- plata.

-- Qué sale del stock al vender este producto. Vender siempre descuenta algo:
-- un pollo entero baja un animal, un huevo baja un huevo.
ALTER TABLE producto ADD COLUMN descuenta TEXT
  CHECK (descuenta IN ('animales', 'huevos'));

UPDATE producto
   SET descuenta = CASE WHEN descuenta_animales = 1 THEN 'animales' ELSE 'huevos' END
 WHERE descuenta IS NULL;

-- El rubro para lo que se consume en casa, que no es una venta pero saca del
-- stock igual. Es data como cualquier otro rubro: se puede renombrar o borrar.
INSERT INTO rubro_gasto (id, granja_id, nombre, creado_en, modificado_en, eliminado)
  SELECT g.id || '-consumo', g.id, 'Consumo propio', g.creado_en, g.creado_en, 0
    FROM granja g
   WHERE g.eliminado = 0
     AND NOT EXISTS (
       SELECT 1 FROM rubro_gasto r
        WHERE r.granja_id = g.id AND r.eliminado = 0 AND r.nombre = 'Consumo propio'
     );
