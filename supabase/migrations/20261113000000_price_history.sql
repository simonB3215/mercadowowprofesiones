-- Historial diario propio de las casas de subastas que se cargan desde Blizzard.
-- Blizzard solo da la foto actual; cada carga suma una muestra al día (UTC) del objeto.
create table if not exists price_history (
  game_version text not null,
  region text not null,
  realm text not null,
  item_id integer not null,
  day date not null,
  samples integer not null,
  market_value_sum numeric not null,
  min_buyout_min bigint,
  primary key (game_version, region, realm, item_id, day)
);
create index if not exists price_history_day on price_history (game_version, region, realm, day);
alter table price_history enable row level security;
