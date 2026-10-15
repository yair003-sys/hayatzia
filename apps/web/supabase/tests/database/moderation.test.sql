-- Profanity and hate filter (20261015120000_moderation): curses masked, racism / threats refused, names clean,
-- no false hits inside ordinary words, tricks (spacing, repeats, niqqud, look-alikes) still caught.
begin;
select plan(26);

-- ---------- masking ----------
select is(public.moderate_text('השופט בן זונה איזה פנדל'), 'השופט בן *** איזה פנדל', 'a curse is masked, the rest stays');
select is(public.moderate_text('הזונה הזאת'), 'ה*** הזאת', 'a Hebrew prefix letter stays, the word is masked');
select is(public.moderate_text('ז י ן עליך'), '*** עליך', 'spaced letters are caught');
select is(public.moderate_text('זיייייין'), '***', 'repeated letters are caught');
select is(public.moderate_text('ז.ו.נ.ה'), '***', 'dotted letters are caught');
select is(public.moderate_text('זוֹנָה'), '***', 'niqqud cannot hide a word');
select is(public.moderate_text('קוס אמק'), '***', 'look-alike letters (ק/כ) are caught');
select is(public.moderate_text('כוסאמק שלו'), '*** שלו', 'a phrase written as one word is caught');
select is(public.moderate_text('What the FuCk'), 'What the ***', 'English curses, any case');
select is(public.moderate_text('sh1t happens'), '*** happens', 'English look-alike digits');
select is(public.moderate_text('מניאקים'), '***', 'a plural ending is caught');

-- ---------- no false hits ----------
select is(public.moderate_text('בוא נשתה כוס קפה לפני המשחק'), 'בוא נשתה כוס קפה לפני המשחק', 'a cup of coffee is fine');
select is(public.moderate_text('הוא משלם מזונות'), 'הוא משלם מזונות', 'a word inside a longer word is fine');
select is(public.moderate_text('ראיתם את הטיזר?'), 'ראיתם את הטיזר?', 'teaser is fine');
select is(public.moderate_text('השופט מפגר ודביל'), 'השופט מפגר ודביל', 'mild insults are allowed (owner)');
select is(public.moderate_text('אני אאזין לשידור'), 'אני אאזין לשידור', 'listening is fine');
select is(public.moderate_text('תחת השופט הזה הפסדנו'), 'תחת השופט הזה הפסדנו', 'תחת (under) is fine');

-- ---------- refused ----------
select throws_ok($$ select public.moderate_text('מוות לערבים') $$, '23514', 'offensive_content', 'racism is refused');
select throws_ok($$ select public.moderate_text('מ ו ו ת  ל ע ר ב י ם') $$, '23514', 'offensive_content', 'spaced racism is refused');
select throws_ok($$ select public.moderate_text('אני ארצח אותך אחרי המשחק') $$, '23514', 'offensive_content', 'a threat is refused');
select throws_ok($$ select public.moderate_name('זונה_גדולה') $$, '23514', 'offensive_name', 'a name with a curse is refused');
select is(public.moderate_name('צהוב_לנצח'), 'צהוב_לנצח', 'a clean name passes');

-- ---------- in the tables ----------
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-0000-0000-000000000b71', 'authenticated', 'authenticated', 'b71@test.local');
insert into public.profiles (user_id, nick, team_id) values ('00000000-0000-0000-0000-000000000b71', 'מודרציה', 'mta');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000b71","role":"authenticated"}', true);
set local role authenticated;
insert into public.team_messages (body) values ('השופט בן זונה');
select is((select body::text from public.team_messages where user_id = auth.uid()), 'השופט בן ***', 'the team chat stores the masked text');
select throws_ok($$ insert into public.team_messages (body) values ('ערבי מסריח') $$, '23514', 'offensive_content',
  'racism never reaches the team chat');
select throws_ok($$ update public.profiles set nick = 'שרמוטה' where user_id = auth.uid() $$, '23514', 'offensive_name',
  'a nickname with a curse is refused');
reset role;
select ok(not has_function_privilege('anon', 'public.moderate_text(text)', 'execute'), 'the filter is closed to anon');

select * from finish();
rollback;
