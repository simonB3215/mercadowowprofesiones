-- «La hice ahora» de Transmutaciones guardado con el personaje de Battle.net (no solo en el navegador).
-- slot = grupo de espera compartida («transmutacion»), «receta:<id>» o «uso:<clave>». Se borra con el personaje o la cuenta.
create table if not exists character_cooldown (
  character_id  uuid not null references bnet_character(id) on delete cascade,
  slot          text not null,
  done_at       timestamptz not null,
  cooldown_s    integer not null check (cooldown_s > 0),
  name          text not null,
  primary key (character_id, slot)
);

alter table character_cooldown enable row level security;
