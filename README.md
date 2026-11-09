# Drip

Drip is a local-first personal finance tracker and installable PWA. It brings savings, investments and credit-card debt together, with recorded income, reminders and projections. No real name, email or phone number is required.

**Live app:** [drip-one-xi.vercel.app](https://drip-one-xi.vercel.app/) · **Changes:** [GitHub Releases](https://github.com/devcamos/drip/releases)

## What you can do

- Group cash, investments and debt; update balances and choose account colours.
- Record interest, dividends and bonuses separately from balances. View dividend holdings, payment dates and estimated future income.
- Record credit-card APR, minimum and planned payments. Reminders do not make payments or change the amount owed.
- View trends and projections. Figures are estimates, not financial advice or confirmed provider payments.
- Install Drip on a supported phone or desktop and opt in to payment reminders. iPhone push notifications require the Home Screen app and notification permission.

Balances and rates are entered by the user. Drip does not connect to banks, execute trades or fetch live share prices. Where supported, manually entered share prices can be converted using Frankfurter reference exchange rates; the result is an estimate.

## Getting started

Use Node **24.22.1** as pinned in [`.nvmrc`](.nvmrc):

```sh
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To use cloud-backed signup, login and recovery locally, copy `.env.example` to ignored `.env.local` and configure a **dedicated non-production** database, auth secret and stable local origin. Apply the schema to that environment with `node --env-file=.env.local scripts/migrate.mjs` before use. Phone reminders need their own configuration and additive migration; see [payment notifications](docs/payment-notifications.md).

```sh
npm run typecheck
npm test
npm run build
npm run start
```

For the full regression gate, including browser journeys and a disposable local Postgres database, see the [regression standard](docs/testing/regression-policy.md). Never point test databases at Production. CI also runs a dependency audit.

## Security and recovery

Financial records are encrypted in the browser before local storage or cloud sync. A gamertag and password provide sign-in; cloud sessions are limited to four devices and expire after seven days. Sign-out locks the local vault and retains its encrypted data. A fresh page needs a password, a configured unlock passkey or a recovery code to unlock it.

Save the original recovery codes somewhere safe. If the password, recovery codes and all configured devices are lost, Drip cannot decrypt or reset the account for you. A cloud copy contains the latest successfully synced data; unsynced changes remain on their original device. Sync conflicts require review rather than silently overwriting another device.

Passkey unlock can use Face ID, Touch ID or a device lock on compatible browsers and password managers supporting WebAuthn PRF. Set it up in Settings on each browser after signing in; Preview and Production are separate origins. Phone reminders use generic lock-screen text, not account names or amounts.

For the architecture and trust boundaries, see [Architecture](docs/architecture.md). For session expiry and limitations, see [Session policy](docs/session-policy.md). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).

## Developer guide

- [Architecture and C4 diagrams](docs/architecture.md)
- [Encrypted sync, account workflows and compatibility](docs/account-workflows.md)
- [Device management](docs/device-management.md) and [guided recovery](docs/guided-recovery.md)
- [Payment calendar](docs/payment-calendar.md) and [phone notifications](docs/payment-notifications.md)
- [Exchange rates](docs/exchange-rates.md) and [investment statistics](docs/dividend-investment-stats.md)
- [Regression policy and test layers](docs/testing/regression-policy.md)
- [UI screenshots](docs/screenshots/)

## Licence

Proprietary. Copyright devcamos, all rights reserved. See [LICENSE](LICENSE); third-party dependencies retain their own licences.
