-- Esquema inicial. Nombres de la aplicación (sección 10 de la documentación).
-- Todas las tablas tienen RLS activado sin políticas: solo el servidor (conexión
-- directa con rol postgres/service) puede leerlas o escribirlas. La clave anónima
-- de Supabase no da acceso.

-- ---------------------------------------------------------------------------
-- Ingestas de precios (TSM)
-- ---------------------------------------------------------------------------
create table if not exists ingestion_run (
  id            bigserial primary key,
  provider      text not null,              -- 'tsm' | 'demo'
  game_version  text not null,              -- 'retail' | 'demo' ...
  region        text not null,
  realm         text,                       -- null para archivos regionales
  file_kind     text not null check (file_kind in ('commodities','realm_items','region_items')),
  source_url    text,
  status        text not null check (status in ('staging','ok','failed','rejected')),
  active        boolean not null default false,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  source_time   timestamptz,                -- updatedAt del archivo (escaneo de origen)
  checksum      text,
  bytes         integer,
  rows_valid    integer not null default 0,
  rows_rejected integer not null default 0,
  error         text,
  raw_path      text
);
create index if not exists ingestion_run_ctx on ingestion_run (game_version, region, realm, file_kind, started_at desc);
create unique index if not exists ingestion_run_one_active
  on ingestion_run (game_version, region, coalesce(realm, ''), file_kind) where active;

create table if not exists price_row (
  run_id          bigint not null references ingestion_run(id) on delete cascade,
  item_id         integer not null,
  name            text,
  market_value    bigint,
  min_buyout      bigint,
  recent          bigint,
  historical      bigint,
  avg_sale_price  bigint,
  sale_rate       numeric,
  sold_per_day    numeric,
  primary key (run_id, item_id)
);

-- ---------------------------------------------------------------------------
-- Catálogo (Blizzard Game Data API)
-- ---------------------------------------------------------------------------
create table if not exists catalog_run (
  id           bigserial primary key,
  game_version text not null,
  region       text not null,
  status       text not null check (status in ('running','ok','partial','failed')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  stats        jsonb not null default '{}'::jsonb,
  error        text
);

create table if not exists profession (
  game_version text not null,
  id           integer not null,
  name         text not null,
  name_en      text,
  type         text,
  kind         text not null default 'desconocido', -- fabricacion | recoleccion | secundaria | historica | desconocido
  raw          jsonb,
  fetched_at   timestamptz not null default now(),
  primary key (game_version, id)
);

create table if not exists skill_tier (
  game_version  text not null,
  id            integer not null,
  profession_id integer not null,
  name          text not null,
  name_en       text,
  expansion     text not null default 'Sin clasificar',
  min_skill     integer,
  max_skill     integer,
  raw           jsonb,
  fetched_at    timestamptz not null default now(),
  primary key (game_version, id)
);

create table if not exists recipe (
  game_version       text not null,
  id                 integer not null,
  profession_id      integer not null,
  skill_tier_id      integer,
  category           text,
  name               text,
  crafted_item_id    integer,
  alliance_item_id   integer,
  horde_item_id      integer,
  qty_min            integer,
  qty_max            integer,
  rank               integer,
  has_modified_slots boolean,
  raw                jsonb,
  fetch_error        text,
  fetched_at         timestamptz not null default now(),
  primary key (game_version, id)
);
create index if not exists recipe_prof on recipe (game_version, profession_id, skill_tier_id);

create table if not exists recipe_reagent (
  game_version text not null,
  recipe_id    integer not null,
  slot         integer not null,
  item_id      integer not null,
  quantity     integer,
  optional     boolean not null default false,
  primary key (game_version, recipe_id, slot)
);
create index if not exists recipe_reagent_item on recipe_reagent (game_version, item_id);

create table if not exists item (
  game_version  text not null,
  id            integer not null,
  name          text,
  name_en       text,
  quality       text,
  binding       text,
  item_class    text,
  item_subclass text,
  is_stackable  boolean,
  raw           jsonb,
  fetch_error   text,
  fetched_at    timestamptz not null default now(),
  primary key (game_version, id)
);

create table if not exists realm (
  game_version       text not null,
  region             text not null,
  slug               text not null,
  name               text not null,
  connected_realm_id integer,
  source             text not null,  -- 'blizzard' | 'usuario' | 'demo'
  primary key (game_version, region, slug)
);

-- ---------------------------------------------------------------------------
-- Datos del usuario
-- ---------------------------------------------------------------------------
create table if not exists character_profile (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists scenario (
  id         uuid primary key default gen_random_uuid(),
  recipe_key text not null,
  name       text not null default 'Escenario',
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists crafting_plan (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid references character_profile(id) on delete set null,
  name       text not null,
  data       jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ledger_entry (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid references character_profile(id) on delete set null,
  plan_id           uuid references crafting_plan(id) on delete set null,
  kind              text not null check (kind in ('compra','venta','gasto','deposito_perdido','fabricacion')),
  item_id           integer,
  item_name         text,
  quantity          integer not null check (quantity > 0),
  unit_price_copper bigint not null check (unit_price_copper >= 0),
  occurred_at       timestamptz not null default now(),
  note              text,
  estimate          jsonb,
  voided            boolean not null default false,
  replaces_id       uuid references ledger_entry(id),
  created_at        timestamptz not null default now()
);

create table if not exists app_setting (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['ingestion_run','price_row','catalog_run','profession','skill_tier','recipe',
    'recipe_reagent','item','realm','character_profile','scenario','crafting_plan','ledger_entry','app_setting']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
