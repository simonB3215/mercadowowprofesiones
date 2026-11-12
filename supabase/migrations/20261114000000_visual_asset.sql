-- Capa central de recursos visuales (iconos de WoW Forever).
-- Cada fila relaciona un identificador real (objeto o profesión) con su icono verificado.
create table if not exists visual_asset (
  game_version text not null,
  kind text not null check (kind in ('item', 'profession')),
  id integer not null,
  source text not null check (source in ('wowhead', 'blizzard', 'ninguno')),
  icon_name text,              -- nombre del icono en Wowhead (p. ej. inv_fabric_linen_01)
  ref_id integer,              -- id consultado (para profesiones: el hechizo de Wowhead)
  url text,                    -- icono principal (56 px)
  fallback_url text,           -- icono oficial de Blizzard para el mismo id, si existe
  page_url text,               -- ficha de referencia en Wowhead
  error text,
  checked_at timestamptz not null default now(),
  primary key (game_version, kind, id)
);
alter table visual_asset enable row level security;
