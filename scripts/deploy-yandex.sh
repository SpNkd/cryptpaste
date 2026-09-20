#!/usr/bin/env bash
set -euo pipefail

# Deploy CryptPaste to Yandex Cloud without printing secrets or user data.
# Required: YC_FOLDER_ID, YDB_NAME, FUNCTION_NAME, FUNCTION_SERVICE_ACCOUNT_NAME,
# GATEWAY_SERVICE_ACCOUNT_NAME, API_GATEWAY_NAME, FRONTEND_ORIGINS
# (comma-separated exact origins). The Cloud Functions source-path upload is
# managed by Yandex; no user bucket or package secret is required.

required=(YC_FOLDER_ID YDB_NAME FUNCTION_NAME FUNCTION_SERVICE_ACCOUNT_NAME GATEWAY_SERVICE_ACCOUNT_NAME API_GATEWAY_NAME FRONTEND_ORIGINS)
for name in "${required[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required environment variable: $name" >&2
    exit 2
  fi
done

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/cryptpaste-deploy.XXXXXX")"
trap 'rm -rf "$tmp_dir"' EXIT

echo "[1/8] Building frontend and backend"
npm --prefix "$root_dir" run build

ensure_service_account() {
  local name="$1"
  local existing
  existing="$(yc iam service-account get --name "$name" --folder-id "$YC_FOLDER_ID" --format json 2>/dev/null || true)"
  if [[ -n "$existing" ]]; then
    jq -r '.id' <<<"$existing"
    return
  fi
  yc iam service-account create --name "$name" --folder-id "$YC_FOLDER_ID" --description "CryptPaste runtime account" >/dev/null
  yc iam service-account get --name "$name" --folder-id "$YC_FOLDER_ID" --format json | jq -r '.id'
}

echo "[2/8] Ensuring least-privilege service accounts"
function_sa_id="$(ensure_service_account "$FUNCTION_SERVICE_ACCOUNT_NAME")"
gateway_sa_id="$(ensure_service_account "$GATEWAY_SERVICE_ACCOUNT_NAME")"
yc resource-manager folder add-access-binding "$YC_FOLDER_ID" --role ydb.editor --service-account-id "$function_sa_id" >/dev/null || true

echo "[3/8] Ensuring YDB Serverless database"
db_json="$(yc ydb database get --name "$YDB_NAME" --folder-id "$YC_FOLDER_ID" --format json 2>/dev/null || true)"
if [[ -z "$db_json" ]]; then
  yc ydb database create "$YDB_NAME" --folder-id "$YC_FOLDER_ID" --serverless \
    --sls-enable-throttling-rcu --sls-throttling-rcu 10 --sls-storage-size 10GB --deletion-protection >/dev/null
  for _ in {1..30}; do
    db_json="$(yc ydb database get --name "$YDB_NAME" --folder-id "$YC_FOLDER_ID" --format json 2>/dev/null || true)"
    [[ "$(jq -r '.status // empty' <<<"$db_json")" == "RUNNING" ]] && break
    sleep 2
  done
fi
db_endpoint="$(jq -r '.endpoint // empty' <<<"$db_json")"
if [[ -z "$db_endpoint" ]]; then
  echo "Could not resolve YDB endpoint" >&2
  exit 1
fi
db_path="${db_endpoint#*database=}"
export YDB_CONNECTION_STRING="$db_endpoint"
export YDB_TABLE_PATH="pastes"
if [[ -n "${YDB_ACCESS_TOKEN_CREDENTIALS:-}" ]]; then
  unset YDB_METADATA_CREDENTIALS
else
  export YDB_METADATA_CREDENTIALS=1
fi

echo "[4/8] Applying YDB schema"
node "$root_dir/scripts/init-ydb.mjs"

echo "[5/8] Ensuring Cloud Function"
function_json="$(yc serverless function get --name "$FUNCTION_NAME" --folder-id "$YC_FOLDER_ID" --format json 2>/dev/null || true)"
if [[ -z "$function_json" ]]; then
  yc serverless function create "$FUNCTION_NAME" --folder-id "$YC_FOLDER_ID" --description "CryptPaste encrypted note API" >/dev/null
  function_json="$(yc serverless function get --name "$FUNCTION_NAME" --folder-id "$YC_FOLDER_ID" --format json)"
fi
function_id="$(jq -r '.id' <<<"$function_json")"

echo "[6/8] Publishing immutable function version"
yc serverless function version create --function-id "$function_id" \
  --runtime nodejs22 --entrypoint src/index.handler --memory 256MB --execution-timeout 10s \
  --service-account-id "$function_sa_id" --source-path "$root_dir/backend/dist" \
  --environment "STORAGE=ydb,YDB_CONNECTION_STRING=$YDB_CONNECTION_STRING,YDB_TABLE_PATH=$YDB_TABLE_PATH,YDB_METADATA_CREDENTIALS=1,ALLOWED_ORIGINS=${FRONTEND_ORIGINS//,/;},NODE_ENV=production" \
  --tags production >/dev/null
yc serverless function add-access-binding --id "$function_id" --role functions.functionInvoker --service-account-id "$gateway_sa_id" >/dev/null

echo "[7/8] Applying API Gateway specification"
origins_yaml="$(sed 's/,/, /g' <<<"$FRONTEND_ORIGINS")"
sed -e "s|__FUNCTION_ID__|$function_id|g" \
    -e "s|__GATEWAY_SERVICE_ACCOUNT_ID__|$gateway_sa_id|g" \
    -e "s|__ALLOWED_ORIGINS__|$origins_yaml|g" \
    "$root_dir/infra/api-gateway.yaml.template" > "$tmp_dir/api-gateway.yaml"
gateway_json="$(yc serverless api-gateway get --name "$API_GATEWAY_NAME" --folder-id "$YC_FOLDER_ID" --format json 2>/dev/null || true)"
if [[ -z "$gateway_json" ]]; then
  yc serverless api-gateway create "$API_GATEWAY_NAME" --folder-id "$YC_FOLDER_ID" --description "CryptPaste API Gateway" --spec "$tmp_dir/api-gateway.yaml" >/dev/null
else
  gateway_id="$(jq -r '.id' <<<"$gateway_json")"
  yc serverless api-gateway update --id "$gateway_id" --spec "$tmp_dir/api-gateway.yaml" >/dev/null
fi

echo "[8/8] Verifying public API"
gateway_json="$(yc serverless api-gateway get --name "$API_GATEWAY_NAME" --folder-id "$YC_FOLDER_ID" --format json)"
api_url="$(jq -r '.domain // .default_domain // empty' <<<"$gateway_json")"
if [[ -z "$api_url" ]]; then
  echo "Gateway created; resolve its public domain with: yc serverless api-gateway get --name $API_GATEWAY_NAME" >&2
  exit 1
fi
[[ "$api_url" == https://* ]] || api_url="https://$api_url"
curl --fail --silent --show-error --max-time 15 "$api_url/health" >/dev/null
echo "Yandex deployment completed. API health: pass"
echo "API base URL: $api_url"
echo "Function ID: $function_id"
echo "YDB table path: $YDB_TABLE_PATH"
