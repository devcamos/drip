## Summary
<!-- What changed and why. Keep it short. -->

## Issue
Closes #<issue>
<!-- Required. One GitHub issue per PR so merge auto-closes it. Do not use this PR for a second issue. -->

## Type
<!-- Pick one and apply the matching repository label (feature, bug or planned-fix, hotfix, revert; chore may use documentation or dependencies). -->
- [ ] feature
- [ ] fix
- [ ] hotfix
- [ ] revert
- [ ] chore

### What changed?
<!-- Summarize the changes in bullet points, focusing on behavior rather than file lists. -->
-

### Why this approach?
<!-- Why was this solution chosen over alternative approaches? Any technical trade-offs made? -->

---

## Reviewer Guidance
<!-- Help the reviewer parse your diff quickly. -->
- **Start reading at:** `src/path/to/core_file.ts`
- **Key area to scrutinize:**
- **Noise / Mechanical changes to ignore:** (e.g., auto-generated files, renames)

---

## Testing
<!-- Show that this works and won't break production. -->
- [ ] **Automated Tests:** Added / Updated unit or integration tests.
- [ ] **Manual Testing:** Tested locally or in staging environment.

### Screenshots / Videos (if applicable)
<!-- Attach before/after screenshots or GIFs for UI/UX changes. -->
| Before | After |
| ------ | ----- |
| _Image_ | _Image_ |

---

## Risk / rollback

### 1. Database & Breaking Changes
- [ ] **No breaking DB migrations** (Schema changes are backward-compatible and safe for zero-downtime deployment).
- [ ] **API Contract:** No breaking changes for mobile/client apps.

### 2. Feature Flags & Configuration
- [ ] **Feature Flag:** Wrapped behind `flag_name` (or N/A).
- [ ] **Environment Variables:** New env vars added to deployment configs.

### 3. Monitoring & Rollback
- **How will we know this is working in prod?** (e.g., dashboard metrics, specific log messages)
- **Rollback Strategy:** (e.g., toggle feature flag OFF / revert PR / standard deployment rollback)
