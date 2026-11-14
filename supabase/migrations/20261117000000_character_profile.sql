-- Ficha del personaje (Forever, comprobado el 14-11-2026 con /character-media y /equipment):
-- retrato y equipo puesto tal como estaban al actualizar desde Blizzard. null = nunca leído (no «sin equipo»).
alter table bnet_character add column if not exists guild_name text;
alter table bnet_character add column if not exists media jsonb;
alter table bnet_character add column if not exists equipment jsonb;
alter table bnet_character add column if not exists profile_synced_at timestamptz;
alter table bnet_character add column if not exists profile_detail text;
