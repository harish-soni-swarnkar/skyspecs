-- TMDB owns movie data. We keep a snapshot on the join row for display + stats.

create table users (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table collections (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  name       text not null,
  created_at timestamptz not null default now()
);

create index collections_user_id_idx on collections (user_id);

create table collection_movies (
  id            uuid primary key default gen_random_uuid(),
  collection_id uuid not null references collections (id) on delete cascade,
  tmdb_id       integer not null,

  -- Copied at add time. We don't refresh this automatically.
  title          text not null,
  release_year   integer,
  runtime_minutes integer,
  genres         text[] not null default '{}',
  poster_path    text,
  snapshot_at    timestamptz not null default now(),

  -- Per collection, not global to the movie.
  note   text not null default '',
  tags   text[] not null default '{}',
  rating integer check (rating between 1 and 5),

  added_at timestamptz not null default now(),

  -- A movie appears at most once per collection.
  unique (collection_id, tmdb_id)
);

create index collection_movies_collection_id_idx on collection_movies (collection_id);

-- Seeded user. Queries still filter by user_id.
insert into users (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Default User')
on conflict (id) do nothing;
