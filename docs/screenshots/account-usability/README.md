# Account usability

Grouped accounts now scroll with the page, so group headings are not clipped by an inner scroll area. Credit cards offer a provider selector with a custom option; the stock selector contains named examples and keeps custom entries available. Examples are not ranked recommendations or promises of investment performance.

## Screenshots

Captured using synthetic account data in the local browser:

- [Expanded groups, mobile](expanded-390.png)
- [Collapsed groups, mobile](accounts-390.png)
- [Collapsed groups, desktop](accounts-1280.png)
- [Dividend holdings and individual income, mobile](portfolio-390.png)
- [Dividend holdings and individual income, desktop](portfolio-1280.png)

## Verification

The account-wallet browser journeys cover page scrolling, keyboard access, expanding groups and opening account cards. Saved-account browser journeys cover multiple credit cards, edits, encrypted reload and backup restore. Component tests cover the provider selector and preservation of a previously entered custom provider. Dividend tests cover separate holdings, recorded yield, estimated income and exclusion of cash accounts from the dividend summary.

## Next steps

Review the layout on a physical phone. The [feedback inbox](../feedback-inbox/README.md) is tested locally; hosted delivery still needs verification.
