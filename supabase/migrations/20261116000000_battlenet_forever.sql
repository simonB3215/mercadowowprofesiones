-- WoW Forever: los personajes no tienen reino; Blizzard los identifica por «nombre-apellido»
-- (/profile/wow/character/mati-fernandez). Se guarda el enlace que da la propia API y el apellido,
-- y la clave única trata un reino ausente como un valor (antes cada sincronización podía duplicar el personaje).
alter table bnet_character add column if not exists profile_path text;
alter table bnet_character add column if not exists surname text;

delete from bnet_character a using bnet_character b
 where a.realm_id is null and b.realm_id is null and a.account_id = b.account_id and a.namespace = b.namespace
   and a.character_id = b.character_id and (a.synced_at, a.id::text) < (b.synced_at, b.id::text);

alter table bnet_character drop constraint if exists bnet_character_account_id_namespace_character_id_realm_id_key;
alter table bnet_character drop constraint if exists bnet_character_key;
alter table bnet_character add constraint bnet_character_key unique nulls not distinct (account_id, namespace, character_id, realm_id);
