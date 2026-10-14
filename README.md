# experiment-claude-code

## Creatine Tracker

A small installable web app (PWA) in [`creatine-tracker/`](creatine-tracker/) to track daily creatine.

- **One-tap logging** – "I took my creatine" button (tap again to undo).
- **Streaks** – current streak, longest streak and this month's adherence %.
- **Calendar** – monthly view; taken days in green, missed days in red. Tap a past day to backfill.
- **Reminders** – browser notification at your chosen time if you haven't logged yet,
  plus a one-tap recurring calendar event (`.ics` or Google Calendar) for a reminder that always reaches your phone.
- **Offline & private** – data stays in your browser (`localStorage`); export/import a JSON backup.

### Run locally

```bash
cd creatine-tracker
python3 -m http.server 8000
# open http://localhost:8000
```

### Put it on your phone

1. Merge to `main`, then in the repo go to **Settings → Pages → Source: GitHub Actions**.
   The `Deploy Creatine Tracker to GitHub Pages` workflow publishes it to
   `https://<your-username>.github.io/experiment-claude-code/`.
2. Open that URL on your phone and choose **Add to Home Screen** (iOS: Share menu in Safari;
   Android: Chrome menu → Install app).
3. Open the app, tap **Enable notifications**, and also tap **Google Calendar** / **Add to calendar**
   for a guaranteed daily reminder.

> iOS only allows web notifications for apps added to the Home Screen (iOS 16.4+).
