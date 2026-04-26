#!/usr/bin/env bash
# ============================================================================
# yapepay-infra · check-prerequisites.sh
# ----------------------------------------------------------------------------
# Verifica el entorno local en macOS (Apple Silicon recomendado) para iniciar
# el proyecto AWS CDK + TypeScript de YapePay.
#
# Alineado con: .docs/plan_implementacion_cdk_yapepay.md
#
# Este script NO instala nada automáticamente. Sólo reporta el estado y
# sugiere los comandos de instalación.
# ============================================================================

set -u

# ---------- Colores ---------------------------------------------------------
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

# ---------- Acumuladores ----------------------------------------------------
REQUIRED_OK=()
REQUIRED_MISSING=()
OPTIONAL_OK=()
OPTIONAL_MISSING=()
INSTALL_HINTS=()

add_hint() { INSTALL_HINTS+=("$1"); }

# ---------- 1. Sistema operativo --------------------------------------------
title "1. Sistema operativo"

OS_NAME="$(uname -s)"
if [ "$OS_NAME" != "Darwin" ]; then
  fail "Este script está pensado para macOS. Detectado: $OS_NAME"
  exit 1
fi
ok "macOS detectado"
sw_vers | sed 's/^/      /'

ARCH="$(uname -m)"
if [ "$ARCH" = "arm64" ]; then
  ok "Arquitectura: arm64 (Apple Silicon)"
else
  warn "Arquitectura: $ARCH (no Apple Silicon)"
fi

# ---------- 2. Homebrew -----------------------------------------------------
title "2. Homebrew"

if command -v brew >/dev/null 2>&1; then
  ok "brew $(brew -v | head -1)"
else
  fail "Homebrew no está instalado"
  add_hint 'Instalar Homebrew:
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
fi

# ---------- 3. Helpers ------------------------------------------------------
# check_tool <required|optional> <comando> <comando_version> <hint_instalación>
check_tool() {
  local kind="$1"
  local cmd="$2"
  local version_cmd="$3"
  local hint="$4"

  if command -v "$cmd" >/dev/null 2>&1; then
    local v
    v="$(eval "$version_cmd" 2>&1 | head -1)"
    ok "$cmd → $v"
    if [ "$kind" = "required" ]; then
      REQUIRED_OK+=("$cmd")
    else
      OPTIONAL_OK+=("$cmd")
    fi
  else
    if [ "$kind" = "required" ]; then
      fail "$cmd NO instalado (REQUERIDO)"
      REQUIRED_MISSING+=("$cmd")
    else
      warn "$cmd NO instalado (opcional)"
      OPTIONAL_MISSING+=("$cmd")
    fi
    add_hint "Instalar $cmd:
  $hint"
  fi
}

# ---------- 4. Herramientas requeridas --------------------------------------
title "3. Herramientas requeridas"

check_tool required node "node -v"  "brew install node"
check_tool required npm  "npm -v"   "brew install node   # incluye npm"
check_tool required tsc  "tsc -v"   "npm install -g typescript"
check_tool required aws  "aws --version" "brew install awscli"
check_tool required cdk  "cdk --version" "npm install -g aws-cdk"
check_tool required git  "git --version" "brew install git"
check_tool required code "code --version | head -1" \
  'brew install --cask visual-studio-code
  # o bien, desde VS Code: ⇧⌘P → "Shell Command: Install '\''code'\'' command in PATH"'

# ---------- 5. Herramientas opcionales --------------------------------------
title "4. Herramientas opcionales"

check_tool optional docker "docker --version"        "brew install --cask docker"
check_tool optional jq     "jq --version"            "brew install jq"
check_tool optional tree   "tree --version | head -1" "brew install tree"

# ---------- 6. Credenciales AWS ---------------------------------------------
title "5. Credenciales AWS (aws sts get-caller-identity)"

AWS_STATUS="UNKNOWN"
if command -v aws >/dev/null 2>&1; then
  if AWS_OUT="$(aws sts get-caller-identity 2>&1)"; then
    ok "Credenciales AWS válidas"
    echo "$AWS_OUT" | sed 's/^/      /'
    AWS_REGION_CFG="$(aws configure get region 2>/dev/null || true)"
    if [ -n "${AWS_REGION_CFG:-}" ]; then
      ok "Región configurada: $AWS_REGION_CFG"
    else
      warn "No hay región por defecto. Sugerido: aws configure set region us-east-1"
    fi
    AWS_STATUS="OK"
  else
    fail "AWS CLI no autenticado"
    echo "$AWS_OUT" | sed 's/^/      /'
    info "Configura credenciales temporales de AWS Educate. Ver: scripts/setup-aws-educate.md"
    AWS_STATUS="FAIL"
  fi
else
  fail "AWS CLI no instalado, no se puede validar credenciales"
  AWS_STATUS="FAIL"
fi

# ---------- 7. CDK doctor ---------------------------------------------------
title "6. AWS CDK (cdk doctor)"

CDK_STATUS="UNKNOWN"
if command -v cdk >/dev/null 2>&1; then
  if CDK_OUT="$(cdk doctor 2>&1)"; then
    ok "cdk doctor ejecutado"
    echo "$CDK_OUT" | sed 's/^/      /'
    CDK_STATUS="OK"
  else
    warn "cdk doctor reportó advertencias"
    echo "$CDK_OUT" | sed 's/^/      /'
    CDK_STATUS="WARN"
  fi
else
  fail "cdk no instalado"
  CDK_STATUS="FAIL"
fi

# ---------- 8. Resumen final ------------------------------------------------
title "Resumen"

printf "${C_BOLD}Requeridas OK (%d):${C_RESET} %s\n" \
  "${#REQUIRED_OK[@]}" "${REQUIRED_OK[*]:-(ninguna)}"
printf "${C_BOLD}Requeridas faltantes (%d):${C_RESET} %s\n" \
  "${#REQUIRED_MISSING[@]}" "${REQUIRED_MISSING[*]:-(ninguna)}"
printf "${C_BOLD}Opcionales OK (%d):${C_RESET} %s\n" \
  "${#OPTIONAL_OK[@]}" "${OPTIONAL_OK[*]:-(ninguna)}"
printf "${C_BOLD}Opcionales faltantes (%d):${C_RESET} %s\n" \
  "${#OPTIONAL_MISSING[@]}" "${OPTIONAL_MISSING[*]:-(ninguna)}"
printf "${C_BOLD}Credenciales AWS:${C_RESET} %s\n" "$AWS_STATUS"
printf "${C_BOLD}Estado CDK:${C_RESET} %s\n" "$CDK_STATUS"

if [ "${#INSTALL_HINTS[@]}" -gt 0 ]; then
  title "Comandos sugeridos de instalación"
  for h in "${INSTALL_HINTS[@]}"; do
    printf "• %s\n" "$h"
  done
fi

# ---------- 9. Exit code ----------------------------------------------------
if [ "${#REQUIRED_MISSING[@]}" -gt 0 ] || [ "$AWS_STATUS" = "FAIL" ] || [ "$CDK_STATUS" = "FAIL" ]; then
  printf "\n${C_RED}${C_BOLD}Entorno NO listo para iniciar yapepay-infra.${C_RESET}\n"
  exit 1
fi

printf "\n${C_GREEN}${C_BOLD}Entorno listo para iniciar yapepay-infra.${C_RESET}\n"
exit 0
