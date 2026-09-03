-- A second user so the app's user switcher has something to switch to out of the box, and the
-- per-user scoping is visible without manually creating one.
insert into users (id, name)
values ('00000000-0000-0000-0000-000000000002', 'Alex')
on conflict (id) do nothing;
