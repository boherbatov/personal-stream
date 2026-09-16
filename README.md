# Personal Stream

אפליקציית ווב אישית לצפייה בקובצי וידאו שהמשתמש מעביר לבוט Telegram.

## מה עובד

- קליטת סרטונים ומסמכי וידאו שהועברו לבוט דרך `getUpdates`.
- ספרייה, חיפוש, משך הסרט ונגן וידאו.
- הזרמה דרך השרת עם תמיכה ב-HTTP Range כשהשרת של Telegram תומך בכך.
- ממשק עברי, RTL ורספונסיבי.
- session פרטי באמצעות cookie מסוג HttpOnly ו-SameSite.
- אין חיבור ל-Google Drive.

## הרצה

```bash
TELEGRAM_BOT_TOKEN='stored-outside-source-control' \
APP_ACCESS_KEY='choose-a-private-access-key' \
npm start
```

פותחים `http://localhost:3000`, שולחים או מעבירים סרטון לבוט, ונכנסים לספרייה.

## משתני סביבה

- `TELEGRAM_BOT_TOKEN` - חובה. סוד של הבוט; לעולם אין לשמור אותו ב-GitHub.
- `TELEGRAM_BOT_API_BASE` - אופציונלי. ברירת המחדל: `https://api.telegram.org`.
- `APP_ACCESS_KEY` - מומלץ בפריסה. מגן על הספרייה בקוד גישה פרטי. אם אינו מוגדר, הכניסה פתוחה.
- `PORT` - ברירת מחדל 3000.
- `NODE_ENV=production` - מוסיף `Secure` ל-session cookie; דורש HTTPS.

## מגבלת קבצים של Telegram

לפי [התיעוד הרשמי](https://core.telegram.org/bots/faq), שרת Bot API הציבורי מוריד קבצים עד 20MB בלבד. לסרטים וקבצים גדולים צריך להריץ [Telegram Bot API מקומי](https://core.telegram.org/bots/api#using-a-local-bot-api-server), שמאפשר הורדה ללא מגבלת גודל, ולהגדיר את כתובתו ב-`TELEGRAM_BOT_API_BASE`.

האינדקס וה-sessions נשמרים בזיכרון בגרסה הראשונה. בפריסה קבועה מומלץ להוסיף מסד נתונים, אחסון sessions משותף ו-HTTPS.

## פרטיות

המאגר אינו כולל tokens, סיסמאות, כתובות קבצים פרטיות או מדיה. יש לנהל את כל הסודות דרך מנהל הסודות של סביבת הפריסה.
