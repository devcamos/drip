# Account analytics dashboard

`analytics-mobile.png` shows the line chart and `analytics-pie-mobile.png` shows the asset-mix chart on the mobile dashboard. Both use a disposable local test account. The dashboard is calculated in the unlocked browser from saved account data; values shown here are test fixtures, not a real user's finances.

Regenerate both with `DRIP_UI_CAPTURE=1 PW_CHROME=/path/to/chromium npx playwright test --project=mobile-chromium e2e/analytics-dashboard.e2e.spec.ts`.
