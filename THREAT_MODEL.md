# Threat model

## Что защищаем

CryptPaste снижает последствия следующих событий:

- утечка содержимого YDB;
- просмотр stored payload администратором backend;
- чтение encrypted blobs через backup или перехват между API Gateway и YDB;
- случайная публикация короткой ссылки без пароля.

Backend видит ID, размер, TTL, salt, IV и ciphertext, но это не даёт ему
возможности штатно получить plaintext без пароля.

Новые ID короткие (4 символа, 24 бита) по UX-требованию. Их нельзя считать
секретом: rate limit, TTL и client-side encryption остаются обязательными, а
конфиденциальность обеспечивается паролем и AES-GCM, не непредсказуемостью ID.

## Что не защищаем

- слабый или повторно используемый пароль: ciphertext можно атаковать offline;
- malware, keylogger или вредоносное browser extension;
- XSS или скомпрометированный GitVerse Pages/frontend deployment;
- пользователя, который добровольно передал пароль;
- screenshot, clipboard history, browser crash dump или memory inspection;
- race condition в `delete-after-read`: две вкладки могут получить ciphertext
  до удаления и обе расшифровать его.

## Почему KDF важен

Пароль обычно не является равномерным 256-bit ключом. PBKDF2 с уникальным
случайным salt делает каждую заметку независимой и намеренно удорожает
проверку каждой догадки offline. Salt не секретен и хранится рядом с
ciphertext. 600 000 итераций выбраны как переносимый Web Crypto baseline;
при обновлении envelope значение должно версионироваться и проверяться на
совместимость с мобильными браузерами. Argon2id был бы сильнее против
GPU/ASIC, но браузерный Web Crypto его не предоставляет; WASM-вариант должен
появиться как отдельная, тщательно проверенная версия envelope.

## Trust model frontend

Текущий JavaScript — часть доверенной вычислительной базы. HTTPS, CSP,
отсутствие внешних scripts и минимальный bundle уменьшают поверхность атаки,
но не решают проблему владельца публикации, который может заменить asset.
Для высокорисковых секретов используйте локально проверенный/зафиксированный
frontend или отдельный audited client.

## Deletion and TTL

Owner deletion uses a browser-generated token; the backend stores only its
SHA-256 hash, and the token is not in the public read URL. `delete-after-read`
uses a server-issued read-delete token returned with the encrypted envelope and
sent only after successful local decryption. This authenticates a deletion
request, not a cryptographic proof that a human read the note. A concurrent
reader may already have the ciphertext. Expiry is enforced on every read/delete
and records are lazily removed; it is not a promise about backup retention.
