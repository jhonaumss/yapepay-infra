#!/usr/bin/env bash
# ============================================================================
# yapepay-infra · bootstrap.sh
# ----------------------------------------------------------------------------
# Ejecuta `cdk bootstrap` para la cuenta+región objetivo.
#
# IMPORTANTE: el bootstrap YA fue ejecutado en aws://628884045138/us-east-1.
# Este script existe para reproducirlo en otras cuentas/regiones o para
# re-bootstrap controlado. NO se ejecuta automáticamente.
# ============================================================================
set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-yapepay}"
AWS_REGION="${AWS_REGION:-us-east-1}"

ACCOUNT="$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text)"

cat <<EOF
=============================================================================
 cdk bootstrap
=============================================================================
  Profile : $AWS_PROFILE
  Account : $ACCOUNT
  Region  : $AWS_REGION

 Recordatorio: este bootstrap ya fue ejecutado en 628884045138/us-east-1.
 Solo continúa si necesitas bootstrap en una cuenta/región distinta.
=============================================================================
EOF

read -r -p "¿Confirmas ejecutar 'cdk bootstrap'? Escribe 'yes' para continuar: " ANSWER
if [ "$ANSWER" != "yes" ]; then
  echo "Cancelado."
  exit 1
fi

npx cdk bootstrap "aws://${ACCOUNT}/${AWS_REGION}" --profile "$AWS_PROFILE"
