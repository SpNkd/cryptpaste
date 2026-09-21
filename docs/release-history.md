# Release history

Entries are added only after a deployment has been independently checked.
Never put credentials, raw request bodies, plaintext or private database URLs
in this file.

```text
## 2026-09-21 07:54Z — remove dead privacy footer link

- Source commit: e9a36999f5b0c0feea1cb3d51015f257ce69918e
- GitHub workflow: not used; GitHub remains the source mirror
- GitVerse workflow: https://gitverse.ru/spnkd/cryptpaste/cicd/1602020 — success
- Backend function version: unchanged ACTIVE production version
- Static URLs: https://spnkd.gitverse.site/cryptpaste/ — HTTP 200
- API health: pass
- CORS preflight: pass for `https://spnkd.gitverse.site` and `http://localhost:5173`
- Smoke flow: direct `/p/{id}` route returned the SPA and the published bundle no longer contains the dead privacy link
- Rollback target: previous Pages artifact and source commit 77a1779
- Notes: footer now contains only the static local-encryption notice

## 2026-09-21 07:44Z — hide delete controls without token

- Source commit: e0a63828924178664bba4f72167747f3f9f5f3da
- GitHub workflow: not used; GitHub remains the source mirror
- GitVerse workflow: https://gitverse.ru/spnkd/cryptpaste/cicd/1601916 — success
- Backend function version: unchanged ACTIVE production version
- Static URLs: https://spnkd.gitverse.site/cryptpaste/ — HTTP 200
- API health: pass
- CORS preflight: pass for `https://spnkd.gitverse.site` and `http://localhost:5173`
- Smoke flow: direct `/p/{id}` route returned the SPA, delete controls were initially hidden, and API read/delete behavior remained covered by tests
- Rollback target: previous Pages artifact and source commit 63698bc
- Notes: delete buttons appear only after an owner or read-delete token is available

## 2026-09-20 17:06Z — remove broken theme toggle

- Source commit: 39823c5c36071795d70add40ebffe5219501bc48
- GitHub repository: https://github.com/SpNkd/cryptpaste / pushed
- GitVerse repository: https://gitverse.ru/spnkd/cryptpaste / Pages run #1597637 succeeded
- Static URL: https://spnkd.gitverse.site/cryptpaste/ / HTTP 200
- UI check: theme button absent from the published JavaScript bundle
- Regression checks: direct `/p/{id}` route still returns the SPA fallback
- Rollback target: previous Pages artifact and source commit ff595a6
- Notes: color scheme now follows the operating system automatically

## 2026-09-20 16:50Z — compact links and SPA fallback

- Source commit: 390172ee9267aad035d91b0eb58f4727fe926114
- GitHub repository: https://github.com/SpNkd/cryptpaste / pushed
- GitVerse repository: https://gitverse.ru/spnkd/cryptpaste / Pages run #1597548 succeeded
- Backend function version: ACTIVE production version with compact-ID API validation
- Static URL: https://spnkd.gitverse.site/cryptpaste/ / HTTP 200
- Direct routes: old and new `/p/{id}` paths / HTTP 200 via `404.html` SPA fallback
- API smoke flow: new four-character ID, read, owner delete, and legacy-ID read passed
- Rollback target: previous ACTIVE Yandex Cloud Function version and source commit 7f5be04
- Notes: four-character IDs are convenience identifiers, not a security boundary

## 2026-09-20 13:41Z — initial production release

- Source commit: 3af2849a5c93a018d94290211977fe5ab303707e
- GitHub repository: https://github.com/SpNkd/cryptpaste / pushed
- GitVerse repository: https://gitverse.ru/spnkd/cryptpaste / Pages run #1596416 succeeded
- Backend function version: ACTIVE production version deployed through Yandex Cloud
- Static URL: https://spnkd.gitverse.site/cryptpaste/ / HTTP 200
- API health: pass
- CORS preflight: configured for the production Pages origin and localhost development origin
- Smoke flow: create, read, wrong-token rejection, owner delete, and delete-after-read passed
- Rollback target: previous ACTIVE Yandex Cloud Function version and source commit f9cea16
- Notes: delete-after-read is best effort; weak passwords remain vulnerable to offline brute force

## YYYY-MM-DD HH:MMZ — release name

- Source commit: full SHA
- GitHub repository: URL / push result
- GitVerse repository: URL / Pages result
- Backend function version: version ID / ACTIVE
- Static URL: URL / HTTP status
- API health: pass/fail
- CORS preflight: pass/fail per origin
- Smoke flow: non-sensitive summary
- Rollback target: commit/version
- Notes: known limitation
```
