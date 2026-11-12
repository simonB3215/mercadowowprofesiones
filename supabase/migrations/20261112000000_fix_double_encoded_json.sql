-- Corrige valores jsonb guardados como cadena JSON (doble codificación).
-- Causa: con postgres.js, un parámetro de texto (JSON.stringify) en una columna jsonb se volvía a
-- serializar y quedaba como un string jsonb ("[...]") en vez de un array u objeto.
-- Desde esta versión las escrituras usan $n::text::jsonb. Solo afecta a filas cuyo valor es un string.

update app_setting set value = (value #>> '{}')::jsonb where jsonb_typeof(value) = 'string';
update character_profile set data = (data #>> '{}')::jsonb where jsonb_typeof(data) = 'string';
update scenario set data = (data #>> '{}')::jsonb where jsonb_typeof(data) = 'string';
update crafting_plan set data = (data #>> '{}')::jsonb where jsonb_typeof(data) = 'string';
update ledger_entry set estimate = (estimate #>> '{}')::jsonb where jsonb_typeof(estimate) = 'string';
