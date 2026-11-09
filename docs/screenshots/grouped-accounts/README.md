# Grouped accounts

The account list groups cash, investments and debt, with Other for explicitly unclassified products. Each group displays its account count and recorded total; debt is labelled as owed. Groups can be expanded to reveal the existing stacked cards. The money overview continues to show assets, debt and net position separately.

## Screenshots

Synthetic local data, with groups collapsed for comparison:

- [Mobile, 390px](accounts-390.png)
- [Desktop, 1280px](accounts-1280.png)

## Verification

The account-wallet browser journey checks grouping totals, collapse and expand, opening cards, keyboard navigation, scrolling and layout at 320px, 390px and desktop widths. Unit and component tests cover legacy dividend classification, rounding, unclassified accounts and separate debt totals. Screenshots do not show real customer data.

## Next steps

Review the Preview on a phone. Face ID / Touch ID passkey unlock also requires verification on a real compatible device after setting up an unlock passkey in that environment.
