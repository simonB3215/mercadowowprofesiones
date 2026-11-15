-- Oferta publicada por objeto en las casas cargadas desde Blizzard: unidades en venta y número de publicaciones.
-- Antes solo se usaban para calcular el valor de mercado y se perdían. TSM no las da: quedan en null.
alter table price_row add column if not exists quantity integer;
alter table price_row add column if not exists auctions integer;
-- Historial diario: suma de unidades en venta y en cuántas muestras del día se observó (para la media).
alter table price_history add column if not exists quantity_sum bigint not null default 0;
alter table price_history add column if not exists quantity_samples integer not null default 0;
