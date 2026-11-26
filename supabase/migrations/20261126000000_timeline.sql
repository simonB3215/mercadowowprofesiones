-- «Línea de tiempo»: comparar WoW Forever con Classic Anniversary por días desde el lanzamiento (D36).
-- Economías, fases, referencias de precio (citas de jugadores en foros), valor del oro en dólares y techos de vendedor.
-- Importes en cobre (10 000 c = 1 o), como el resto de la base. RLS activado sin políticas (D5).

create table if not exists timeline_economy (
  id text primary key,
  name text not null,
  launch_date date,
  source text
);

create table if not exists timeline_phase (
  id serial primary key,
  economy_id text not null references timeline_economy(id) on delete cascade,
  phase text not null,
  milestone text not null,
  start_date date not null,
  confirmed boolean not null default true,
  note text,
  source text,
  unique (economy_id, phase, milestone)
);

create table if not exists timeline_reference (
  id bigserial primary key,
  economy_id text not null references timeline_economy(id) on delete cascade,
  item_id integer not null,
  item_name text,
  observed_on date not null,
  price_copper bigint not null check (price_copper > 0),
  price_min_copper bigint check (price_min_copper > 0),
  price_max_copper bigint check (price_max_copper > 0),
  realm text,
  note text,
  confidence text not null default 'media' check (confidence in ('alta', 'media', 'baja')),
  source_url text not null check (source_url like 'https://%'),
  created_at timestamptz not null default now()
);
create unique index if not exists timeline_reference_seed on timeline_reference (economy_id, item_id, observed_on, coalesce(realm, ''), price_copper);
create index if not exists timeline_reference_item on timeline_reference (item_id);

create table if not exists timeline_gold_value (
  economy_id text not null references timeline_economy(id) on delete cascade,
  day integer not null,
  period text not null,
  market text,
  usd_per_gold numeric not null,
  source text,
  primary key (economy_id, day)
);

create table if not exists timeline_vendor_cap (
  item_id integer primary key,
  item_name text,
  cap_copper bigint not null check (cap_copper > 0),
  vendor text not null,
  source text
);

alter table timeline_economy enable row level security;
alter table timeline_phase enable row level security;
alter table timeline_reference enable row level security;
alter table timeline_gold_value enable row level security;
alter table timeline_vendor_cap enable row level security;

-- Datos iniciales (fuentes en cada fila).
insert into timeline_economy (id, name, launch_date, source) values
  ('anniversary', 'Classic Anniversary', '2024-11-21', 'https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Classic_20th_Anniversary_Edition'),
  ('forever', 'WoW Forever', '2026-11-04', 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('era', 'Classic Era (economía madura, solo contexto)', null, null)
on conflict do nothing;

insert into timeline_phase (economy_id, phase, milestone, start_date, confirmed, note, source) values
  ('anniversary', 'Fase 1', 'Lanzamiento (nivel 1–60)', '2024-11-21', true, 'Sin raids', 'https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Classic_20th_Anniversary_Edition'),
  ('anniversary', 'Fase 1', 'Núcleo de Magma y Onyxia', '2024-12-12', true, 'Primeras raids', 'https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Classic_20th_Anniversary_Edition'),
  ('anniversary', 'Fase 2', 'La Masacre, honor, jefes de mundo', '2025-01-09', true, 'Sin raid nueva', 'https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Classic_20th_Anniversary_Edition'),
  ('anniversary', 'Fase 3', 'Guarida Alanegra (BWL), Feria de la Luna Negra', '2025-03-20', true, 'Raid nueva', 'https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Classic_20th_Anniversary_Edition'),
  ('anniversary', 'Fase 4', 'Zul''Gurub', '2025-05-01', true, 'Fuera del análisis', 'https://warcraft.wiki.gg/wiki/World_of_Warcraft:_Classic_20th_Anniversary_Edition'),
  ('forever', 'Fase 1', 'Lanzamiento (nivel 1–60)', '2026-11-04', true, 'Sin raids, 9 mazmorras nuevas', 'https://www.icy-veins.com/wow-forever/roadmap'),
  ('forever', 'Fase 2', 'Barrow Deeps (10), Hyjal (20), Onyxia (40)', '2026-12-09', true, 'Primeras raids', 'https://www.icy-veins.com/wow-forever/roadmap'),
  ('forever', 'Fase 3', 'Actualización de primavera: 2 raids, 2 mazmorras', '2027-03-20', false, 'Fecha sin confirmar (primavera 2027)', 'https://www.icy-veins.com/wow-forever/roadmap')
on conflict do nothing;

insert into timeline_reference (economy_id, item_id, item_name, observed_on, price_copper, price_min_copper, price_max_copper, realm, note, confidence, source_url) values
  ('anniversary', 12363, 'Cristal Arcano', '2024-12-18', 120000, 120000, 120000, 'US (no indicado)', 'Cita breve de un jugador sobre el precio que dejan los bots; ambigua', 'baja', 'https://us.forums.blizzard.com/en/wow/t/somechanges-arcanite/2030383'),
  ('anniversary', 13510, 'Frasco de los titanes', '2025-01-01', 600000, 600000, 600000, 'Dreamscythe (US)', '«60 g durante casi todo MC», recordado en marzo de 2025; fecha puesta a mitad de MC', 'media', 'https://us.forums.blizzard.com/en/wow/t/why-are-we-not-getting-black-lotus-fixed-on-anniversary/2076152'),
  ('anniversary', 13468, 'Loto negro', '2025-01-19', 2000000, 2000000, 2000000, 'Nightslayer (US, JcJ)', '«Cerca de 200 g»', 'media', 'https://us.forums.blizzard.com/en/wow/t/black-lotus-200g-on-nightslayer/2047364'),
  ('anniversary', 13468, 'Loto negro', '2025-01-19', 200000, 200000, 200000, 'Dreamscythe (US, Normal)', '«Por debajo de 20 g», misma conversación', 'media', 'https://us.forums.blizzard.com/en/wow/t/black-lotus-200g-on-nightslayer/2047364'),
  ('anniversary', 13510, 'Frasco de los titanes', '2025-03-07', 920000, 920000, 920000, 'US (no indicado)', 'Precio visto en la casa ese día', 'media', 'https://us.forums.blizzard.com/en/wow/t/can-we-please-talk-about-anniversarys-economy-what-gives/2072420'),
  ('anniversary', 12363, 'Cristal Arcano', '2025-03-07', 700000, 700000, 700000, 'US (no indicado)', '«70+, rara vez baja a 60 y tantos»', 'media', 'https://us.forums.blizzard.com/en/wow/t/can-we-please-talk-about-anniversarys-economy-what-gives/2072420'),
  ('anniversary', 13452, 'Elixir de la mangosta', '2025-03-07', 40000, 40000, 40000, 'US (no indicado)', 'Una sola publicación a 4 g', 'baja', 'https://us.forums.blizzard.com/en/wow/t/can-we-please-talk-about-anniversarys-economy-what-gives/2072420'),
  ('anniversary', 13468, 'Loto negro', '2025-03-07', 1800000, 1650000, 1950000, 'US (no indicado)', '165 g dos días antes, luego 185–195 g', 'media', 'https://us.forums.blizzard.com/en/wow/t/anniversary-black-lotus-controlled-market/2071528'),
  ('anniversary', 13510, 'Frasco de los titanes', '2025-03-07', 2750000, 2600000, 2900000, 'US (no indicado)', '«260–290 g en la casa»', 'media', 'https://us.forums.blizzard.com/en/wow/t/anniversary-black-lotus-controlled-market/2071528'),
  ('anniversary', 13468, 'Loto negro', '2025-03-14', 700000, 700000, 700000, 'Dreamscythe (US, Normal)', 'Sube antes de BWL', 'media', 'https://us.forums.blizzard.com/en/wow/t/why-are-we-not-getting-black-lotus-fixed-on-anniversary/2076152'),
  ('anniversary', 13510, 'Frasco de los titanes', '2025-03-16', 3750000, 3750000, 3750000, 'US (no indicado)', 'Título del hilo: «375 g»', 'media', 'https://us.forums.blizzard.com/en/wow/t/375g-flask-of-the-titans-outrageous/2077450'),
  ('anniversary', 13468, 'Loto negro', '2025-03-18', 2500000, 2500000, 2500000, 'EU (no indicado)', '«250 g cada uno hoy»', 'media', 'https://eu.forums.blizzard.com/fr/wow/t/lotus-price-on-anniversary-realms/121855'),
  ('anniversary', 13452, 'Elixir de la mangosta', '2025-03-31', 250000, 250000, 250000, 'Dreamscythe (US, Normal)', 'Comparado con 10 g en Era', 'media', 'https://us.forums.blizzard.com/en/wow/t/mongoose-elixir-25g/2085572?page=2'),
  ('anniversary', 12363, 'Cristal Arcano', '2025-09-04', 1000000, 1000000, 1000000, 'Thunderstrike (EU)', '«100 g+»', 'media', 'https://eu.forums.blizzard.com/en/wow/t/arcanite-prices-are-absurd/587417'),
  ('anniversary', 12360, 'Barra de arcanita', '2025-09-04', 1200000, 1200000, 1200000, 'Thunderstrike (EU)', '«Llegando a 120 g»', 'media', 'https://eu.forums.blizzard.com/en/wow/t/arcanite-prices-are-absurd/587417'),
  ('anniversary', 13510, 'Frasco de los titanes', '2025-10-13', 1970000, 1970000, 1970000, 'Maladath (AU)', 'Comparado con 270 g en Era', 'media', 'https://us.forums.blizzard.com/en/wow/t/gold-buying/2183457'),
  ('anniversary', 13452, 'Elixir de la mangosta', '2025-10-13', 100000, 100000, 100000, 'Maladath (AU)', 'Comparado con 15 g en Era', 'media', 'https://us.forums.blizzard.com/en/wow/t/gold-buying/2183457'),
  ('era', 20520, 'Runa oscura', '2026-11-26', 186400, 186400, 199994, 'Atiesh (Classic Era, US, Alianza)', 'Mediana de 30 días; economía de años, no de fase temprana', 'media', 'https://www.wowauctions.net/auctionHouse/classic-era-us/atiesh-era-us/alliance/dark-rune-20520')
on conflict do nothing;

insert into timeline_gold_value (economy_id, day, period, market, usd_per_gold, source) values
  ('anniversary', 1, 'Día 1', null, 9.99, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('anniversary', 3, 'Día 3', null, 2.35, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('anniversary', 7, 'Semana 1 (mediana)', null, 1.25, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('anniversary', 14, 'Semana 2', null, 0.45, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('anniversary', 45, 'Mes 2', null, 0.11, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('anniversary', 75, 'Mes 3', null, 0.069, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('anniversary', 165, 'Mes 6', null, 0.016, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('forever', 1, 'Día 1', 'US JcJ', 7.7, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('forever', 2, 'Día 2', 'US JcJ', 5.29, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('forever', 3, 'Día 3', 'US JcJ', 2.5, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('forever', 4, 'Día 4', 'US JcJ', 2.45, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('forever', 5, 'Día 5', 'US JcJ', 1.82, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('forever', 7, 'Día 7', 'US JcJ', 1.13, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('forever', 9, 'Día 9', 'US JcJ', 1.25, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('forever', 11, 'Día 11', 'US JcJ', 1.08, 'https://www.mmogah.com/news/wow/wow-gold-price-history'),
  ('forever', 13, 'Día 13', 'US JcJ', 0.63, 'https://www.mmogah.com/news/wow/wow-gold-price-history')
on conflict do nothing;

insert into timeline_vendor_cap (item_id, item_name, cap_copper, vendor, source) values
  (13468, 'Loto negro', 500000, 'Mister Graphed (Powderfuse Port, Riverglades)', 'https://www.wowhead.com/forever/news/new-black-market-vendor-caps-prices-on-high-end-reagents-383052'),
  (12363, 'Cristal Arcano', 500000, 'Mister Graphed (Powderfuse Port, Riverglades)', 'https://www.wowhead.com/forever/news/new-black-market-vendor-caps-prices-on-high-end-reagents-383052')
on conflict do nothing;
