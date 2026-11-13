-- Conexión con Battle.net, personajes propios y rutas de subida de nivel por personaje (PC-01 a PC-15).
-- Propietario = cuenta de Battle.net (identificador «sub» del inicio de sesión oficial). Todas las consultas de
-- /api/me/* filtran por ese propietario. RLS activado sin políticas, como el resto (D5): solo el servidor accede.

create table if not exists bnet_account (
  id          uuid primary key default gen_random_uuid(),
  bnet_sub    text not null unique,          -- identificador estable de la cuenta (userinfo «sub»)
  battletag   text,
  region      text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Sesión de Battle.net: el navegador guarda un identificador aleatorio; aquí solo su SHA-256.
-- El token de acceso se guarda cifrado (AES-256-GCM) y caduca con «expires_in»; no hay token de renovación.
create table if not exists bnet_session (
  id_hash       text primary key,
  account_id    uuid not null references bnet_account(id) on delete cascade,
  token_enc     text not null,
  scope         text,
  expires_at    timestamptz not null,
  created_at    timestamptz not null default now()
);
create index if not exists bnet_session_account on bnet_session(account_id);

-- «state» de OAuth de un solo uso (también ligado a una cookie del navegador que inició el flujo).
create table if not exists oauth_state (
  state_hash  text primary key,
  region      text not null,
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);

create table if not exists bnet_character (
  id              uuid primary key default gen_random_uuid(),
  account_id      uuid not null references bnet_account(id) on delete cascade,
  namespace       text not null,             -- p. ej. profile-forever-us
  wow_account_id  bigint,
  character_id    bigint not null,
  realm_id        bigint,
  realm_slug      text,
  realm_name      text,
  name            text not null,
  level           integer,
  class_name      text,
  race_name       text,
  faction         text,
  raw             jsonb,
  synced_at       timestamptz not null default now(),
  unique (account_id, namespace, character_id, realm_id)
);

-- Último dato de profesiones devuelto por Blizzard (o el motivo por el que no se pudo obtener).
create table if not exists profession_snapshot (
  id                uuid primary key default gen_random_uuid(),
  character_id      uuid not null references bnet_character(id) on delete cascade,
  profession_id     integer not null,
  profession_name   text,
  tier_id           integer,
  tier_name         text,
  skill_points      integer,                 -- null = la API no lo dio (nunca 0 por defecto)
  max_skill_points  integer,
  known_recipes     integer[],
  fetched_at        timestamptz not null default now(),
  unique (character_id, profession_id, tier_id)
);

create table if not exists character_sync (
  character_id  uuid primary key references bnet_character(id) on delete cascade,
  status        text not null,               -- ok | no_disponible | error
  http_status   integer,
  detail        text,
  checked_at    timestamptz not null default now()
);

-- Datos introducidos por el usuario: no sobrescriben el dato oficial y llevan procedencia y fecha.
create table if not exists profession_manual (
  character_id      uuid not null references bnet_character(id) on delete cascade,
  profession_id     integer not null,
  skill_points      integer,
  max_skill_points  integer,
  note              text,
  preferred         text not null default 'manual' check (preferred in ('manual', 'blizzard')),
  updated_at        timestamptz not null default now(),
  primary key (character_id, profession_id)
);

create table if not exists leveling_plan (
  id             uuid primary key default gen_random_uuid(),
  account_id     uuid not null references bnet_account(id) on delete cascade,
  character_id   uuid not null references bnet_character(id) on delete cascade,
  profession_id  integer not null,
  target         integer not null,
  mode           text not null,
  constraints    jsonb not null default '{}'::jsonb,
  algorithm      text not null,
  start_skill    integer not null,
  start_source   text not null,
  result         jsonb,
  status         text not null default 'activo',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists leveling_plan_owner on leveling_plan(account_id, character_id);

create table if not exists progress_event (
  id             uuid primary key default gen_random_uuid(),
  plan_id        uuid not null references leveling_plan(id) on delete cascade,
  observed_skill integer not null,
  source         text not null,              -- manual | blizzard
  note           text,
  created_at     timestamptz not null default now()
);

alter table bnet_account enable row level security;
alter table bnet_session enable row level security;
alter table oauth_state enable row level security;
alter table bnet_character enable row level security;
alter table profession_snapshot enable row level security;
alter table character_sync enable row level security;
alter table profession_manual enable row level security;
alter table leveling_plan enable row level security;
alter table progress_event enable row level security;
