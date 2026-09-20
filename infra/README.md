# Infrastructure

`schema.sql` — one-time YDB schema.

`api-gateway.yaml.template` — OpenAPI template for API Gateway. The deploy
script substitutes the function ID and exact frontend origins. It deliberately
does not contain tokens or database credentials.

The YDB serverless database and Cloud Function are kept separate from source
code. Deployment uses the already-authenticated `yc` CLI and asks for explicit
resource names through environment variables.
