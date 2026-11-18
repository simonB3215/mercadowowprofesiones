-- Copia de los hilos oficiales de Blizzard (foros, formato JSON de Discourse) que alimentan «Cambios del juego».
-- Se renueva cuando tiene más de una hora; si el foro no responde se sigue usando la última copia.
create table if not exists forum_topic_cache (
  topic_id bigint primary key,
  title text not null,
  posts jsonb not null,
  fetched_at timestamptz not null default now()
);
