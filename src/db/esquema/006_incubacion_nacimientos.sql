-- Una incubadora tiene que poder registrar nacimientos.
--
-- La especificación se contradecía: §2.1 define la plantilla Incubación sólo
-- con "carga de incubación", pero §7 dice que después de la carga se registra
-- el nacimiento con la cantidad de nacidos.
--
-- Con la capacidad apagada el ciclo se cortaba a la mitad: se cargaban los
-- huevos y no había forma de anotar los pollitos, así que el porcentaje de
-- nacimientos —el número por el que existe una incubadora— nunca se podía
-- calcular.

UPDATE categoria
   SET registra_nacimientos = 1, modificado_en = datetime('now')
 WHERE registra_carga_incubacion = 1
   AND registra_nacimientos = 0
   AND eliminado = 0;

UPDATE plantilla
   SET registra_nacimientos = 1, modificado_en = datetime('now')
 WHERE registra_carga_incubacion = 1
   AND registra_nacimientos = 0
   AND eliminado = 0;
