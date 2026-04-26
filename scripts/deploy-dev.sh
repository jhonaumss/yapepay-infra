#!/usr/bin/env bash
# ============================================================================
# yapepay-infra · deploy-dev.sh
# ----------------------------------------------------------------------------
# Despliegue MANUAL al ambiente dev. NO se invoca desde CI/CD.
#
# Pre-requisitos OBLIGATORIOS antes de ejecutar:
#   1. Budget de billing configurado en AWS (ej. USD 20/mes con alertas).
#   2. MFA activado en la cuenta root.
#   3. Revisión de `cdk diff` realizada y aprobada.
#
# Este script asume que los pre-requisitos están listos y pide confirmación
# explícita antes de invocar `cdk deploy --all`.
# ============================================================================
set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-yapepay}"

ACCOUNT="$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)"
REGION="$(aws configure get region --profile "$AWS_PROFILE" || echo us-east-1)"

cat <<EOF
=============================================================================
 ⚠️  DEPLOY a AWS — esto crea recursos REALES y puede generar COSTOS
=============================================================================
  Profile : $AWS_PROFILE
  Account : $ACCOUNT
  Region  : $REGION

 Antes de continuar confirma que:
   [ ] Budget de billing configurado en AWS Billing Console.
   [ ] MFA activado en la cuenta root.
   [ ] Ejecutaste 'cdk diff' y revisaste los cambios.
=============================================================================
EOF

read -r -p "Escribe 'deploy yapepay dev' para continuar: " ANSWER
if [ "$ANSWER" != "deploy yapepay dev" ]; then
  echo "Cancelado."
  exit 1
fi

npm run build
npx cdk deploy --all --profile "$AWS_PROFILE"
