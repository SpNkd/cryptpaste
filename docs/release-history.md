# Release history

Entries are added only after a deployment has been independently checked.
Never put credentials, raw request bodies, plaintext or private database URLs
in this file.

```text
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
