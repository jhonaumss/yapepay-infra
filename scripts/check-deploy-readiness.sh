#!/usr/bin/env bash
# ============================================================================
# yapepay-infra · check-deploy-readiness.sh
# ----------------------------------------------------------------------------
# Verifica prerrequisitos operativos antes de cualquier `cdk deploy`.
#
# Este script es de solo lectura:
#   - NO crea Budgets.
#   - NO modifica MFA.
#   - NO cambia credenciales AWS.
# ============================================================================
set -euo pipefail

AWS_PROFILE="${AWS_PROFILE:-yapepay}"
EXPECTED_ACCOUNT_ID="${YAPEPAY_AWS_ACCOUNT_ID:-628884045138}"
BUDGET_NAME="${YAPEPAY_BUDGET_NAME:-yapepay-dev-monthly-budget}"

if [ -t 1 ]; then
  C_RESET="\033[0m"
  C_RED="\033[31m"
  C_GREEN="\033[32m"
  C_YELLOW="\033[33m"
  C_BLUE="\033[34m"
  C_BOLD="\033[1m"
else
  C_RESET=""; C_RED=""; C_GREEN=""; C_YELLOW=""; C_BLUE=""; C_BOLD=""
fi

ok()    { printf "${C_GREEN}[ OK ]${C_RESET} %s\n" "$*"; }
warn()  { printf "${C_YELLOW}[WARN]${C_RESET} %s\n" "$*"; }
fail()  { printf "${C_RED}[FAIL]${C_RESET} %s\n" "$*"; }
info()  { printf "${C_BLUE}[INFO]${C_RESET} %s\n" "$*"; }
title() { printf "\n${C_BOLD}== %s ==${C_RESET}\n" "$*"; }

READINESS_STATUS=0

title "1. Identidad AWS"

if ! ACCOUNT_ID="$(aws sts get-caller-identity \
  --profile "$AWS_PROFILE" \
  --query Account \
  --output text 2>/dev/null)"; then
  fail "No se pudo consultar AWS STS con el perfil '$AWS_PROFILE'."
  info "Configura o renueva credenciales antes de validar readiness."
  exit 1
fi

if [ "$ACCOUNT_ID" = "$EXPECTED_ACCOUNT_ID" ]; then
  ok "Cuenta esperada: $ACCOUNT_ID"
else
  fail "Cuenta inesperada: $ACCOUNT_ID; esperado: $EXPECTED_ACCOUNT_ID"
  READINESS_STATUS=1
fi

title "2. MFA de cuenta root"

if ROOT_MFA_ENABLED="$(aws iam get-account-summary \
  --profile "$AWS_PROFILE" \
  --query 'SummaryMap.AccountMFAEnabled' \
  --output text 2>/dev/null)"; then
  if [ "$ROOT_MFA_ENABLED" = "1" ]; then
    ok "MFA root activo según IAM AccountSummary."
  else
    fail "MFA root NO aparece activo."
    info "Actívalo manualmente: AWS Console > Security credentials > Root user > Multi-factor authentication."
    READINESS_STATUS=1
  fi
else
  warn "No se pudo consultar AccountMFAEnabled. Verifica permisos IAM."
  READINESS_STATUS=1
fi

title "3. Budget mensual"

if BUDGET_INFO="$(aws budgets describe-budget \
  --profile "$AWS_PROFILE" \
  --account-id "$ACCOUNT_ID" \
  --budget-name "$BUDGET_NAME" \
  --query 'Budget.[BudgetName,BudgetLimit.Amount,BudgetLimit.Unit,TimeUnit,BudgetType]' \
  --output text 2>/dev/null)"; then
  ok "Budget encontrado: $BUDGET_NAME"
  printf "      %s\n" "$BUDGET_INFO"

  if NOTIFICATIONS="$(aws budgets describe-notifications-for-budget \
    --profile "$AWS_PROFILE" \
    --account-id "$ACCOUNT_ID" \
    --budget-name "$BUDGET_NAME" \
    --query 'Notifications[].Threshold' \
    --output text 2>/dev/null)"; then
    if [ -n "$NOTIFICATIONS" ]; then
      ok "Budget tiene notificaciones configuradas: $NOTIFICATIONS"
    else
      fail "Budget existe, pero no se detectaron notificaciones."
      READINESS_STATUS=1
    fi
  else
    warn "No se pudieron consultar notificaciones del Budget."
    READINESS_STATUS=1
  fi
else
  fail "No se encontró el Budget '$BUDGET_NAME'."
  info "Créalo manualmente en Billing > Budgets con monto sugerido USD 20 y alertas 50/80/100%."
  info "Puedes usar otro nombre exportando YAPEPAY_BUDGET_NAME antes de ejecutar este script."
  READINESS_STATUS=1
fi

title "Resultado"

if [ "$READINESS_STATUS" -eq 0 ]; then
  ok "Prerrequisitos de deploy listos. Aún revisa 'cdk diff' antes de desplegar."
else
  fail "Prerrequisitos de deploy incompletos. No ejecutes 'cdk deploy'."
fi

exit "$READINESS_STATUS"
