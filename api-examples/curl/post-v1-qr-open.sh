#!/usr/bin/env bash
set -euo pipefail

: "${YAPEPAY_API_BASE_URL:?Set YAPEPAY_API_BASE_URL with the ApiStack HttpApiUrl output. Example: export YAPEPAY_API_BASE_URL=https://abc.execute-api.us-east-1.amazonaws.com}"

curl --fail-with-body --silent --show-error \
  --request POST "${YAPEPAY_API_BASE_URL%/}/v1/qr" \
  --header 'Content-Type: application/json' \
  --data '{}'

printf '\n'
