#!/usr/bin/env bash
# ============================================================================
# yapepay-infra · synth.sh
# ----------------------------------------------------------------------------
# Compila TypeScript y ejecuta `cdk synth`. No despliega nada.
# ============================================================================
set -euo pipefail

export AWS_PROFILE="${AWS_PROFILE:-yapepay}"

npm run build
npx cdk synth --profile "$AWS_PROFILE"
