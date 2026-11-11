# Dividend-stock reading

## Why

Each holding links to current coverage without storing articles or requiring an API key. Known tickers open Yahoo's company news; other names open a company lookup. Google News searches use the saved holding name.

## Screenshots

- [Mobile](reading-mobile.png)
- [Desktop](reading-desktop.png)

Screenshots use a synthetic holding and were captured from the saved-account journey in Chromium.

## Verification

- Unit tests cover known instruments, custom names, URL encoding and empty names.
- Component tests verify accessible links, external-link protection and that cash accounts do not show stock reading.
- The browser journey opens a saved holding and confirms reading links leave the recorded value unchanged. External publisher content is not tested or included in Drip.

## Next steps

- Review the layout and decide whether links are sufficient or a licensed, attributed in-app headline feed is needed.
