# Account analytics dashboard

`analytics-mobile.png` shows the income line chart, `analytics-pie-mobile.png` shows the asset-mix pie, and `analytics-debt-mobile.png` shows debt separately by account. These use a disposable local test account. Dashboard charts are calculated in the unlocked browser from saved account data; values shown here are fixtures, not a real user's finances.

Regenerate all three with `DRIP_UI_CAPTURE=1 PW_CHROME=/path/to/chromium npx playwright test --project=mobile-chromium e2e/analytics-dashboard.e2e.spec.ts`.
