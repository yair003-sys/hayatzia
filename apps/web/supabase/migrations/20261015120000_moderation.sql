-- Profanity and hate filter (owner, 2026-10-15: "what endangers onefan"). Enforced in the database, so no client can
-- skip it. Two lists:
--   mask  - curses: only the word itself becomes *** and the message is still sent.
--   block - racism, incitement and threats (the legal risk): the message is not saved at all ('offensive_content').
-- Names (nicknames, group / event / item / song titles, a trip's city) take no curse either: a hit refuses them
-- ('offensive_name'). Mild insults (מפגר, דביל, ...) are allowed on purpose. Private messages are end-to-end encrypted
-- and never seen by the server, so they are out of reach here by design.
-- The match tolerates spacing tricks (ז י ן, ז.י.ן), repeated letters (זייין), כ/ק and ט/ת swaps, common Hebrew
-- prefixes (ה ו ש ל ב) and a few suffixes; it never matches inside a longer word (מזונות, טיזר, כוס קפה stay).

create table private.moderation_terms (
  term    text primary key check (char_length(term) between 2 and 40),
  action  text not null check (action in ('mask', 'block'))
);
alter table private.moderation_terms enable row level security;  -- no policies: only the filter's own functions read it
revoke all on private.moderation_terms from public, anon, authenticated;

insert into private.moderation_terms (term, action) values
  -- curses (masked)
  ('זונה', 'mask'), ('זונות', 'mask'), ('שרמוטה', 'mask'), ('שרמוטות', 'mask'), ('שרמוט', 'mask'),
  ('כוס אמק', 'mask'), ('כוס אמא', 'mask'), ('כוס אמאק', 'mask'), ('כוס אחותך', 'mask'), ('כוס אוחתק', 'mask'),
  ('כוס עמק', 'mask'), ('כוסית', 'mask'), ('כוסיות', 'mask'),
  ('זין', 'mask'), ('זיין', 'mask'), ('תזיין', 'mask'), ('תזדיין', 'mask'), ('תזדיינו', 'mask'), ('מזדיין', 'mask'),
  ('מזדיינים', 'mask'), ('לזיין', 'mask'), ('זיונים', 'mask'),
  ('מניאק', 'mask'), ('מניאקים', 'mask'), ('מניאקית', 'mask'), ('מנייק', 'mask'),
  ('חרא', 'mask'), ('בן כלב', 'mask'), ('בת כלב', 'mask'), ('בני כלבים', 'mask'),
  ('מוצצת', 'mask'), ('תמצוץ', 'mask'), ('חמאר', 'mask'), ('טיז', 'mask'), ('נאצי', 'mask'), ('נאצים', 'mask'),
  ('fuck', 'mask'), ('fucking', 'mask'), ('fucker', 'mask'), ('motherfucker', 'mask'), ('shit', 'mask'),
  ('bitch', 'mask'), ('dick', 'mask'), ('pussy', 'mask'), ('cunt', 'mask'), ('asshole', 'mask'), ('whore', 'mask'),
  ('slut', 'mask'),
  -- racism and incitement (blocked)
  ('מוות לערבים', 'block'), ('מוות ליהודים', 'block'), ('מוות לערבי', 'block'), ('ערבי מסריח', 'block'),
  ('ערבים מסריחים', 'block'), ('יהודי מסריח', 'block'), ('יהודים מסריחים', 'block'), ('ערבוש', 'block'),
  ('ערבושים', 'block'), ('כושי', 'block'), ('כושים', 'block'), ('כושית', 'block'), ('קוקסינל', 'block'),
  ('הומו מסריח', 'block'), ('nigger', 'block'), ('nigga', 'block'),
  ('faggot', 'block'),
  -- threats and violence (blocked)
  ('ארצח אותך', 'block'), ('אני ארצח', 'block'), ('נרצח אותך', 'block'), ('אהרוג אותך', 'block'), ('אני אהרוג', 'block'),
  ('נהרוג אותך', 'block'), ('נדקור', 'block'), ('אדקור', 'block'), ('נשבור לך', 'block'), ('נחכה לך בחוץ', 'block'),
  ('שתחטוף סרטן', 'block'), ('סרטן עליך', 'block'), ('שתמות', 'block'), ('שתמותו', 'block'), ('ימח שמו', 'block'),
  ('ימח שמך', 'block'), ('נשרוף לכם', 'block');

-- One term as a regular expression: each letter may repeat, up to two separators may sit between letters, a space in
-- a phrase may be missing, and the usual look-alike letters count.
create function private.term_pattern(p_term text) returns text
language sql immutable set search_path = '' as $$
  select string_agg(
           case
             when c = ' ' then '[\s._*~-]{0,3}'
             when c in ('כ', 'ק') then '[כק]+'
             when c in ('ט', 'ת') then '[טת]+'
             when c = 'o' then '[o0]+'
             when c = 'a' then '[a@4]+'
             when c = 'i' then '[i1!]+'
             when c = 's' then '[s$5]+'
             when c = 'e' then '[e3]+'
             else c || '+'
           end,
           '[._*~-]{0,2}\s?' order by i)
    from unnest(string_to_array(lower(p_term), null)) with ordinality as t(c, i)
$$;

-- All terms of one list as a single expression, with word edges: an optional prefix, an optional ending, and never
-- a letter or digit right before or after (so the term is never a piece of a longer word).
create function private.list_pattern(p_action text) returns text
language sql stable set search_path = '' as $$
  select '(?<![א-תa-z0-9])([והשלב]{0,2})(?:' || string_agg(private.term_pattern(term), '|' order by char_length(term) desc) || ')'
         || '(?:ים|ות|ית|יות|ה|י|ך|s|es|ed|ing|er|ers)?(?![א-תa-z0-9])'
    from private.moderation_terms where action = p_action
$$;

-- Niqqud, cantillation and invisible characters are removed first, so they cannot hide a word.
create function private.clean_text(p text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(p, '[֑-ׇ​-‏‪-‮⁦-⁩﻿]', '', 'g')
$$;

-- The text with curses masked; raises 'offensive_content' when it holds racism, incitement or a threat.
create function public.moderate_text(p text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  t text;
begin
  if p is null or p = '' then
    return p;
  end if;
  t := private.clean_text(p);
  if t ~* private.list_pattern('block') then
    raise exception 'offensive_content' using errcode = '23514';
  end if;
  return regexp_replace(t, private.list_pattern('mask'), '\1***', 'gi');
end $$;

-- A name may hold no listed word at all.
create function public.moderate_name(p text) returns text
language plpgsql stable security definer set search_path = '' as $$
declare
  t text;
begin
  if p is null or p = '' then
    return p;
  end if;
  t := private.clean_text(p);
  if t ~* private.list_pattern('block') or t ~* private.list_pattern('mask') then
    raise exception 'offensive_name' using errcode = '23514';
  end if;
  return t;
end $$;
revoke all on function private.term_pattern(text) from public, anon, authenticated;
revoke all on function private.list_pattern(text) from public, anon, authenticated;
revoke all on function private.clean_text(text) from public, anon, authenticated;
revoke all on function public.moderate_text(text) from public, anon;
revoke all on function public.moderate_name(text) from public, anon;
grant execute on function public.moderate_text(text) to authenticated, service_role;
grant execute on function public.moderate_name(text) to authenticated, service_role;

-- ---------- the triggers ("zz_" runs them after the tables' own stamping triggers) ----------
create function private.moderate_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  col text;
  kind text;
  val text;
  fixed text;
  r jsonb := to_jsonb(new);
begin
  foreach col in array tg_argv loop
    kind := split_part(col, ':', 2);
    col := split_part(col, ':', 1);
    val := r ->> col;
    if val is null or val = '' then
      continue;
    end if;
    if tg_op = 'UPDATE' and (to_jsonb(old) ->> col) is not distinct from val then
      continue;
    end if;
    fixed := case when kind = 'name' then public.moderate_name(val) else public.moderate_text(val) end;
    if fixed is distinct from val then
      r := jsonb_set(r, array[col], to_jsonb(fixed));
    end if;
  end loop;
  new := jsonb_populate_record(new, r);
  return new;
end $$;
revoke all on function private.moderate_row() from public, anon, authenticated;

create trigger zz_moderate before insert or update on public.profiles
  for each row execute function private.moderate_row('nick:name');
create trigger zz_moderate before insert or update on public.team_messages
  for each row execute function private.moderate_row('body:text');
create trigger zz_moderate before insert or update on public.match_messages
  for each row execute function private.moderate_row('body:text');
create trigger zz_moderate before insert or update on public.clips
  for each row execute function private.moderate_row('caption:text', 'tags:text');
create trigger zz_moderate before insert or update on public.clip_comments
  for each row execute function private.moderate_row('body:text');
create trigger zz_moderate before insert or update on public.team_photos
  for each row execute function private.moderate_row('caption:text');
create trigger zz_moderate before insert or update on public.team_photo_comments
  for each row execute function private.moderate_row('body:text');
create trigger zz_moderate before insert or update on public.player_ratings
  for each row execute function private.moderate_row('review:text');
create trigger zz_moderate before insert or update on public.trips
  for each row execute function private.moderate_row('from_city:name', 'note:text');
create trigger zz_moderate before insert or update on public.fan_events
  for each row execute function private.moderate_row('title:name', 'area:name', 'note:text');
create trigger zz_moderate before insert or update on public.market_items
  for each row execute function private.moderate_row('title:name');
create trigger zz_moderate before insert or update on public.chants
  for each row execute function private.moderate_row('title:name', 'lyrics:text');
create trigger zz_moderate before insert or update on public.dm_groups
  for each row execute function private.moderate_row('name:name');
