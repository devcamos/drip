# Account analytics dashboard

`analytics-mobile.png` shows the mobile dashboard with a disposable local test account. The dashboard is calculated in the unlocked browser from saved account data; values shown here are test fixtures, not a real user's finances.

Regenerate it with `DRIP_UI_CAPTURE=1 PW_CHROME=/path/to/chromium npx playwright test e2e/analytics-dashboard.e2e.spec.ts`.
