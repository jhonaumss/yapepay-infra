#!/usr/bin/env bash
# ============================================================================
# yapepay-infra · destroy-dev.sh
# ----------------------------------------------------------------------------
# Destruye recursos del ambiente dev. NO se invoca desde CI/CD.
# Requiere confirmación literal del usuario.
# ============================================================================
set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-yapepay}"

ACCOUNT="$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)"
REGION="$(aws configure get region --profile "$AWS_PROFILE" || echo us-east-1)"

cat <<EOF
=============================================================================
 ⚠️  DESTROY de recursos AWS — operación IRREVERSIBLE
=============================================================================
  Profile : $AWS_PROFILE
  Account : $ACCOUNT
  Region  : $REGION
=============================================================================
EOF

read -r -p "Escribe 'destroy yapepay dev' para continuar: " ANSWER
if [ "$ANSWER" != "destroy yapepay dev" ]; then
  echo "Cancelado."
  exit 1
fi

npx cdk destroy --all --profile "$AWS_PROFILE"
