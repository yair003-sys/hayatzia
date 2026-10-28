# ניתוב לפי שפה (locale routing) — תוכנית הגירה

**תאריך:** 2026-10-28 · **בעלים:** יאיר · **סטטוס:** מאושר הכיוון; לפני ביצוע. **הכי מסוכן בפרויקט — ביצוע זהיר בשלבים, CI ירוק בכל צעד, preview + בדיקת-טלפון + מדידת-ביצועים לפני פרודקשן.**

## המטרה והערובה
כתובות לפי שפה — `onefan.app/he/...`, `/en/...` — כל שפה **גרסה סטטית נפרדת** (generateStaticParams על השפות). כך החלפת-שפה עובדת באמת, וה-static shells של Next 16 **נשמרים פר-שפה** — הביצועים לא נפגעים. **ערובת יאיר:** אם הביצועים ייפגעו — עושים הכל כדי שייצאו טובים יותר משהיו (ראו "ביצועים" למטה).

## למה route ולא cookie
cookie בלי prefix מכריח כל עמוד להיות דינמי (קריאת cookie ב-layout) — פוגע בביצועים. route param הוא סטטי → prerender פר-שפה → מהיר.

## מבנה היעד
- `app/[locale]/(app)/...` ו-`app/[locale]/(public)/...` — כל עמודי המשתמש עוברים תחת `[locale]`.
- `app/[locale]/layout.tsx` — ה-`<html lang dir>` לפי `params.locale`, `setRequestLocale(locale)`, ו-`NextIntlClientProvider` (עכשיו סטטי, כי locale הוא param ולא cookie).
- `api/*` ו-`auth/callback` — **נשארים בשורש**, לא תחת locale (אינם עמודים מתורגמים).
- `generateStaticParams` מחזיר את כל השפות → prerender סטטי לכל שפה.
- `not-found` ו-manifest — טיפול לפי מבנה next-intl (not-found תחת [locale], manifest בשורש).

## middleware
הרכבת middleware של next-intl (זיהוי/ניתוב שפה, redirect מ-`/` ל-`/he` או לפי Accept-Language) יחד עם `proxy.ts` הקיים (רענון session של Supabase). סדר: next-intl קודם (קובע locale/redirect), ואז רענון ה-session על התגובה. לאמת שה-matcher לא תופס `api/alerts` ואת ה-assets (כמו היום).

## קישורים ו-typedRoutes
כל `<Link href>` ו-`router.push` צריכים להיות מודעי-שפה (ה-`Link` של next-intl, או prefix ידני). typedRoutes + `[locale]` — לוודא שהטיפוסים עדיין תופסים. זה החלק עם הכי הרבה קבצים — עוברים אזור-אזור.

## שלבים (כל אחד CI ירוק; מיזוג לפרודקשן רק אחרי preview+טלפון+ביצועים)
1. **שלד `[locale]`** — יצירת `app/[locale]/layout.tsx` + generateStaticParams + middleware, והעברת אזור *אחד* קטן (נגיד `(public)`) תחת locale כהוכחה. שאר העץ נשאר זמנית — לוודא שהבנייה ירוקה והניתוב עובד.
2. **העברת `(app)`** על כל תתי-העץ תחת `[locale]`, תיקון קישורים פנימיים.
3. **קישורים חוצי-אפליקציה** (tab-bar, hero, התראות) למודעי-שפה.
4. **החלפת-שפה דינמית** — מתג-השפה כותב prefix/ניווט במקום cookie; הדלקת מתג `i18n`.
5. **ליטוש** — redirect ברירת-מחדל, SEO (`hreflang`), RTL/LTR מלא, בדיקת 375px בכל שפה.

## ביצועים (ערובת יאיר)
- **בסיס לפני:** פלט ה-build הנוכחי (כמה ראוטים static מול dynamic) + בדיקת העומס הקיימת (`docs/load-test-*`).
- **אחרי:** לאמת שכל ראוט שהיה static נשאר static (פר-שפה), בלי עלייה ב-dynamic. אם משהו הפך דינמי — לתקן (setRequestLocale, Suspense) עד שחוזר/משתפר.
- הזדמנות לשיפור: ניקוי קריאות כפולות ב-layout, ו-cache tags איפה שרלוונטי.

## שער (owner's rule)
שינוי מבני של UI → **לא ממוזג לפרודקשן** עד בדיקת preview בגודל טלפון (375px) בכל המסכים, ואישור שהביצועים שווים-או-טובים-יותר.
