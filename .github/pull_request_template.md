## 📌 Context & Motivation
<!-- Link the Jira ticket / GitHub issue and briefly explain the business or technical motivation. -->
- **Issue / Ticket:** # [Link]
- **Type of Change:** 🐛 Bug Fix | ✨ Feature | 🧹 Refactor | ⚡ Performance | 🛡️ Security

### What changed?
<!-- Summarize the changes at a high level (behavioral changes, not just file lists). -->

### Why this approach?
<!-- Why was this solution chosen over alternative approaches? Any technical trade-offs made? -->

---

## 🔍 Reviewer Guidance
<!-- Help the reviewer parse your diff quickly. -->
- **Start reading at:** `src/path/to/core_file.ts`
- **Key area to scrutinize:**
- **Noise / Mechanical changes to ignore:** (e.g., auto-generated files, renames)

---

## 🧪 Verification & Proof
<!-- Show that this works and won't break production. -->
- [ ] **Automated Tests:** Added / Updated unit or integration tests.
- [ ] **Manual Testing:** Tested locally or in staging environment.

### Screenshots / Videos (if applicable)
<!-- Attach before/after screenshots or GIFs for UI/UX changes. -->
| Before | After |
| ------ | ----- |
| _Image_ | _Image_ |

---

## 🚀 Live App & Production Safety

### 1. Database & Breaking Changes
- [ ] **No breaking DB migrations** (Schema changes are backward-compatible and safe for zero-downtime deployment).
- [ ] **API Contract:** No breaking changes for mobile/client apps.

### 2. Feature Flags & Configuration
- [ ] **Feature Flag:** Wrapped behind `flag_name` (or N/A).
- [ ] **Environment Variables:** New env vars added to deployment configs.

### 3. Monitoring & Rollback
- **How will we know this is working in prod?** (e.g., dashboard metrics, specific log messages)
- **Rollback Strategy:** (e.g., toggle feature flag OFF / revert PR / standard deployment rollback)
