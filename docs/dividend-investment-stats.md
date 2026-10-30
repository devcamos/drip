# Dividend investment details

Add or edit a dividend holding, then enable **Track shares and average price**.
Enter fractional shares, the provider's average purchase price per share in GBP,
and optionally its original USD or EUR price. Current holding value, annual
dividend yield and payment schedule remain manual provider figures.

**Your investment** shows value, estimated capital return (amount/percentage),
shares, average price and dividend yield. The portfolio holding card also shows
shares, average price and yield. Existing holdings can add details later; cash
accounts do not acquire investment fields. Turning tracking off removes these
optional details while retaining value, yield, payments and history.

Estimated cost = shares × average GBP purchase price. Estimated capital return =
current GBP value − estimated cost. Percentage = return ÷ cost ×100, with no
percentage shown for zero cost or an unrepresentable ratio. Cost calculations
use saved precision, and only presentation rounds money to two decimals.
Broker results can differ when its displayed average price has been rounded.
Dividends are recorded income separately; this return is not total return.
Fees are reflected only if already included in the entered average price.

Original currency is display-only: no quote lookup, exchange-rate service,
automatic currency conversion, current-price feed, eligibility rule or balance
mutation is introduced. A portfolio-wide value is not inferred from shares.
Update provider figures manually when shares/cost/value change.

The optional investment object is validated before replacing encrypted local or
restored data. Non-finite, negative, missing/incorrect numeric fields and costs
outside safe monetary precision are rejected. Old records without it remain
valid. Financial fields are explicitly included in the existing encrypted
cloud allowlist; unknown nested fields and local nicknames are excluded. No
server schema, dependency, authentication, service-worker or permission change.

Evidence: new calculation/validation/allowlist/actual encrypted-IDB tests,
component tests and browser journey in `e2e/stock-investment.spec.ts`. That
journey uses a synthetic legacy fixture, actual local encryption/recovery/save/
reload and the real UI, without API mocks. It does not prove hosted login or
physical iOS behavior. Existing account-options assertions now name the Income
predictions region because yield is deliberately also shown in Your investment;
their expected values and backup/recovery assertions are unchanged.

[Running implementation screenshots](screenshots/dividend-investment-stats/README.md).
