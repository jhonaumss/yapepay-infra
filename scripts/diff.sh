#!/usr/bin/env bash
# ============================================================================
# yapepay-infra · diff.sh
# ----------------------------------------------------------------------------
# Compila TypeScript y muestra el diff entre el stack desplegado y el local.
# ============================================================================
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-yapepay}"

npm run build
npx cdk diff --profile "$AWS_PROFILE"
