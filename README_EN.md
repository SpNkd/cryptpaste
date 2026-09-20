# CryptPaste

CryptPaste is a small open-source service for sharing short text notes between
computers. Notes are encrypted in the browser before upload. The backend stores
only an encrypted envelope and technical metadata; passwords, plaintext and
encryption keys never cross the API boundary.

The stack is Web Crypto AES-256-GCM with PBKDF2-HMAC-SHA-256 (600,000
iterations), a vanilla TypeScript/Vite frontend on GitVerse Pages, a Yandex API
Gateway + Cloud Function backend, and YDB Serverless storage. GitHub is a
public source mirror; GitHub Pages is intentionally not used.

See [ARCHITECTURE.md](ARCHITECTURE.md), [THREAT_MODEL.md](THREAT_MODEL.md), and
the Russian [README](README.md) for setup, deployment and limitations.

New notes use compact four-character URL-safe IDs. Legacy sixteen-character
links remain readable. The Pages build also publishes a `404.html` SPA fallback
so direct `/p/{id}` links work on GitVerse Pages.
