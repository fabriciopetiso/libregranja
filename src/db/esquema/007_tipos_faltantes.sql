-- Toda granja necesita sus tipos de tanda.
--
-- Cuando desapareció la pantalla de plantillas y "categoría" pasó a llamarse
-- "tipo de tanda", el alta de granjas nuevas siguió sembrando plantillas: una
-- tabla que ya no mira ninguna pantalla. Las granjas creadas después de ese
-- cambio arrancaron sin ningún tipo utilizable.
--
-- El efecto era peor de lo que parece. Las opciones al cargar salen de las
-- capacidades del tipo de la tanda, así que sin tipos no hay forma de anotar
-- huevos, ni de usar una incubadora, ni de registrar nacimientos. La app queda
-- reducida a "genérica" sin que nada explique por qué.
--
-- Se convierten las plantillas de cada granja en tipos, salteando los que ya
-- existan por nombre para no duplicar lo que el usuario haya creado a mano.

INSERT INTO categoria (
  id, granja_id, nombre, plantilla_id,
  animales_con_nombre, registra_nacimientos, registra_huevos,
  registra_carga_incubacion, registra_peso, registra_alimento,
  creado_en, modificado_en, eliminado
)
SELECT
  p.id || '-t7', p.granja_id, p.nombre, p.id,
  p.animales_con_nombre, p.registra_nacimientos, p.registra_huevos,
  p.registra_carga_incubacion, p.registra_peso, p.registra_alimento,
  p.creado_en, p.modificado_en, 0
FROM plantilla p
WHERE p.eliminado = 0
  AND NOT EXISTS (
    SELECT 1 FROM categoria c
     WHERE c.granja_id = p.granja_id
       AND c.eliminado = 0
       AND c.nombre = p.nombre
  );
