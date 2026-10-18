-- Simple on-device clip editing (owner 2026-10-18): trim (cut start/end), a colour filter and playback speed. All of
-- it is applied on the viewer's phone during playback — no server video processing, no cost. Stored as plain columns
-- on the clip; the fan sends them, and a check keeps the filter and speed to the known values.

alter table public.clips
  add column trim_start real    not null default 0,
  add column trim_end   real,                                   -- null = to the end of the clip
  add column filter      text   not null default 'none',
  add column speed       real   not null default 1;

alter table public.clips add constraint clips_filter_chk
  check (filter in ('none', 'vivid', 'bw', 'warm', 'cold', 'vintage'));
alter table public.clips add constraint clips_speed_chk
  check (speed in (0.5, 1, 1.5, 2));
alter table public.clips add constraint clips_trim_chk
  check (trim_start >= 0 and (trim_end is null or trim_end > trim_start));

grant insert (trim_start, trim_end, filter, speed) on public.clips to authenticated;
