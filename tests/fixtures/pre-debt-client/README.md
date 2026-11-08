# Pre-debt compatibility fixture

These modules are the exact transitive local-module closure of Drip's DB,
cloud and backup clients at `2a014946eb296acbe71bc0ff696b48e2fee05a3c`.
Only the two leading provenance comments are added. Relative imports intentionally
remain inside this frozen directory, including the old types, product validator,
storage version, crypto format reader and cloud allowlist.

Do not modernize these modules or substitute the current DB. The tests need a
real prior client that can hold its own in-memory local keys before the new
client upgrades storage. `SOURCE.json` records original-byte hashes and paths.
External authentication/HTTP is isolated in tests; IndexedDB and Web Crypto are
real fixture implementations, not mocked primary persistence.
