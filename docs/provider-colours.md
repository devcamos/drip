# Provider colours and logos

Decision for [#3](https://github.com/devcamos/drip/issues/3), 16 Nov 2026.

- **No provider logos.** Drip shows provider names as plain text only. Logos need each provider's written permission, and we don't have it.
- **No provider brand colours.** The old defaults were approximations of brand colours (Zopa, MoneyFarm, Moneybox, Chip, Plum, Trading 212, Vanguard, Marcus, Lloyds Bank, Premium Bonds). Brand guidelines generally limit use of their colours and trade dress to approved partners, and a card in a provider's colours can suggest an endorsement or official integration. Rather than seek permission from each provider, every default now comes from Drip's own neutral palette (`ACCOUNT_COLOURS` in `lib/account-colour.ts`).
- **Users choose.** Each account and credit card can use any palette colour or a custom colour. "Use default colour" goes back to the provider's neutral default.
- **Existing accounts keep their saved colour.** Nothing is rewritten in stored data. Users can switch to a palette colour at any time.
- **Accessibility.** Every palette and default colour keeps card text at 4.5:1 or better at both ends of the gradient (tested in `tests/account-options.test.tsx`).

If a provider later grants permission to use its marks, record the permission here before adding any brand asset.
