# Drip architecture

Drip is a local-first Next.js PWA. Financial data is encrypted in the browser; the backend stores encrypted cloud copies, authentication metadata and user-submitted feedback. This page describes the current implementation, not a proposed live market-price or bank integration.

## C4 level 1: system context

```mermaid
flowchart LR
    User["Person using Drip"] -->|"Records balances, income and repayment plans"| Drip["Drip<br/>Personal finance PWA"]
    Drip -->|"Public currency pair only"| FX["Frankfurter<br/>Reference exchange rates"]
    Drip -->|"Generic reminder via Web Push"| Push["Browser / operating-system push service"]
    Push -->|"Notification, if permitted"| User
```

The user enters balances, yields, share prices and dates. Drip does not retrieve bank balances or live share prices, or make payments. Notifications depend on device support, permission and delivery; they do not confirm that a provider has paid.

## C4 level 2: containers

```mermaid
flowchart LR
    User["Person"] --> UI
    subgraph Browser["Browser / installed PWA · same origin"]
        UI["Next.js / React UI"] --> Domain["Domain and crypto modules"]
        Domain --> IDB[("IndexedDB<br/>encrypted local vault")]
        Worker["Service worker<br/>offline shell and push"] --> UI
    end
    UI -->|"HTTPS authentication"| Auth
    Domain -->|"Encrypted vault envelope over HTTPS"| Cloud
    UI -->|"Opt-in reminder schedule"| Notify
    UI -->|"Explicit feedback message"| Feedback
    UI -->|"Public currency pair"| Exchange
    subgraph Vercel["Vercel · Next.js application"]
        Auth["Better Auth + device routes"]
        Cloud["Cloud vault API"]
        Notify["Notification API + dispatch"]
        Feedback["Authenticated feedback API"]
        Exchange["Exchange-rate API"]
        Cron["Production daily cron"] --> Notify
    end
    Auth --> DB[("Neon Postgres")]
    Cloud --> DB
    Notify --> DB
    Feedback --> DB
    Agent["Authorised triage agent"] -->|"Queries feedback when invoked"| DB
    Notify -->|"Generic Web Push"| Push["Push provider"]
    Push --> Worker
    Exchange --> FX["Frankfurter"]
```

The app origin matters for browser storage, cookies and passkeys. Preview and Production use separate environments and secrets. Cron runs automatically in Production; Preview requires a controlled manual dispatch for testing.

## C4 level 3: components and trust boundaries

```mermaid
flowchart TB
    subgraph Browser["Browser trust boundary"]
        View["Accounts, settings and payments UI<br/>app/"] --> Logic["Account calculations and validation<br/>lib/maths · products · credit-card"]
        View --> Session["Device session and unlock<br/>lib/device-session · password-login · passkey-unlock"]
        Session --> Vault["Local vault and Web Crypto<br/>lib/db · local-vault · crypto"]
        Logic --> Vault
        Vault --> Local[("IndexedDB ciphertext and metadata")]
        Vault --> Sync["Cloud sync<br/>lib/cloud"]
        View --> Schedule["Reminder schedule<br/>lib/payment-reminders"]
        View --> FeedbackUI["Feedback form<br/>app/Feedback"]
        Schedule --> Phone["Phone-reminder client<br/>lib/phone-reminders"]
    end
    subgraph Server["Server trust boundary"]
        Auth["Authentication and device limits<br/>server/auth · device-sessions"]
        API["Authenticated vault route<br/>app/api/cloud"]
        PushAPI["Reminder validation and dispatch<br/>server/notifications/"]
        FeedbackAPI["Feedback validation and inbox<br/>server/feedback/"]
        DB[("Postgres<br/>auth metadata, encrypted vaults,<br/>reminders and submitted feedback")]
        Auth --> DB
        API --> DB
        PushAPI --> DB
        FeedbackAPI --> DB
    end
    Session --> Auth
    Sync --> API
    Phone --> PushAPI
    FeedbackUI --> FeedbackAPI
```

- **Keys and data:** the local vault uses AES-GCM encryption. Usable vault keys are held in page memory while unlocked; the server receives an encrypted cloud envelope, not the financial plaintext or recovery root. Authentication and reminder metadata remain server-side.
- **Sessions and devices:** Better Auth verifies cloud sessions. Drip limits active cloud sessions to four device profiles; local unlock and cloud authentication are separate. See [session policy](session-policy.md) and [device management](device-management.md).
- **Sync:** local data is the working copy. Cloud writes use version checks; conflicts are surfaced rather than merged automatically. A cloud restore contains only data that successfully synced.
- **Reminders:** schedule dates, frequencies and time zone leave the encrypted vault; push endpoints are encrypted at rest. Notifications omit account names and financial values. See [payment notifications](payment-notifications.md).
- **Feedback:** the user deliberately submits a message and chosen area. Feedback is not end-to-end encrypted and is readable by authorised reviewers; no account records are automatically attached. An authorised agent can query it when invoked. See [feedback and agent triage](feedback.md).
- **Compatibility:** encrypted data versions and the IndexedDB schema fence older writers when needed. Review [account workflows](account-workflows.md), migrations and old-to-new upgrade evidence before changing storage or recovery.

## Verification and deployment

Run the relevant tests and the full [regression gate](testing/regression-policy.md) for application changes. Use isolated databases and synthetic accounts for Preview tests. Production migrations and secrets are environment-specific; do not copy Preview data or secrets into Production. The app's live URL and release history are linked from the [README](../README.md).
