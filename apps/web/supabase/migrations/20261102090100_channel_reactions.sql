-- Emoji reactions on channel posts (2026-11-01). Exactly the shipped message_reactions model: any emoji, one per fan
-- per post, counts kept on the post as a jsonb {emoji: count} by a recompute trigger, broadcast live on the club's
-- news topic. Club is stamped from the parent post; writes limited to the fan's own row and own club.

create table public.channel_post_reactions (
  post_id    uuid not null references public.channel_posts (id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  team_id    text not null default '',                         -- stamped from the post (for RLS + realtime scope)
  emoji      text not null check (char_length(emoji) between 1 and 32),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);
create index channel_post_reactions_user_idx on public.channel_post_reactions (user_id);

-- Stamp team_id (from the post) + user_id + created_at; refuse a reaction on another club's post.
create function public.channel_post_reactions_stamp() returns trigger
language plpgsql security definer set search_path = '' as $$
declare p record;
begin
  select t.team_id into p from public.channel_posts t where t.id = new.post_id;
  if not found then
    raise exception 'no_post' using errcode = '23503';
  end if;
  if p.team_id <> (select public.my_team()) then
    raise exception 'not_your_club' using errcode = '42501';
  end if;
  new.team_id    := p.team_id;
  new.user_id    := (select auth.uid());
  new.created_at := now();
  return new;
end $$;
revoke all on function public.channel_post_reactions_stamp() from public, anon, authenticated;
create trigger channel_post_reactions_stamp before insert or update on public.channel_post_reactions
  for each row execute function public.channel_post_reactions_stamp();

-- Recompute the post's {emoji: count} and broadcast {post_id, reactions} to the club's news topic.
create function public.channel_post_reactions_count() returns trigger
language plpgsql security definer set search_path = '' as $$
declare pid uuid; v_reactions jsonb; tid text;
begin
  pid := coalesce(new.post_id, old.post_id);
  select coalesce(jsonb_object_agg(e.emoji, e.c), '{}'::jsonb) into v_reactions
    from (select emoji, count(*)::int as c from public.channel_post_reactions where post_id = pid group by emoji) e;
  update public.channel_posts t set reactions = v_reactions where t.id = pid returning t.team_id into tid;
  if tid is not null then
    perform realtime.send(
      jsonb_build_object('post_id', pid, 'reactions', v_reactions),
      'REACTION', 'news:' || tid, true);
  end if;
  return null;
end $$;
revoke all on function public.channel_post_reactions_count() from public, anon, authenticated;
create trigger channel_post_reactions_count after insert or update or delete on public.channel_post_reactions
  for each row execute function public.channel_post_reactions_count();

alter table public.channel_post_reactions enable row level security;
create policy channel_post_reactions_read on public.channel_post_reactions for select to authenticated
  using (team_id = (select public.my_team()));
create policy channel_post_reactions_insert on public.channel_post_reactions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy channel_post_reactions_update on public.channel_post_reactions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy channel_post_reactions_delete on public.channel_post_reactions for delete to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.channel_post_reactions from anon, authenticated;
grant select, delete on public.channel_post_reactions to authenticated;
grant insert (post_id, emoji) on public.channel_post_reactions to authenticated;  -- team_id/user_id are stamped
grant update (emoji) on public.channel_post_reactions to authenticated;

-- Realtime authorization: a fan may receive the broadcasts on their own club's news topic (mirrors team_channel_receive).
create policy channel_news_receive on realtime.messages for select to authenticated
  using (realtime.topic() = 'news:' || (select public.my_team()) and realtime.messages.extension = 'broadcast');
