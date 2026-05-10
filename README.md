# yapepay-infra

Infraestructura como código para **YapePay**, implementada con **AWS CDK v2** y **TypeScript**.

Define y despliega toda la infraestructura cloud del ambiente `dev` en `us-east-1`: red, base de datos, autenticación, cómputo (Fargate + Lambda), mensajería, observabilidad y CI/CD.

---

## Ambiente desplegado

| Parámetro | Valor |
|-----------|-------|
| Cuenta AWS | `628884045138` |
| Región | `us-east-1` |
| Ambiente | `dev` |
| ALB (punto de entrada) | `yapepay-dev-alb-717626426.us-east-1.elb.amazonaws.com` |
| Budget mensual | USD 20 (alertas 50 / 80 / 100 %) |

---

## Arquitectura

```
Internet
  │
  ▼
Application Load Balancer  (yapepay-dev-alb)
  ├─ /v1/usuarios*      → ECS Fargate: user-service
  ├─ /v1/billeteras*    → ECS Fargate: wallet-service
  ├─ /v1/recargas*      → ECS Fargate: wallet-service
  ├─ /v1/transacciones* → ECS Fargate: transaction-service
  └─ /v1/qr*            → Lambda: qr-handler (ARM64, Node.js 22)

ECS Fargate (yapepay-dev-cluster):
  user-service · wallet-service · transaction-service
  ↕ VPC pública, credenciales DB desde Secrets Manager

Lambda (VPC pública, VPC Endpoints para API calls sin internet):
  qr-handler           ← ALB target
  notification-handler ← SQS trigger (notificationsQueue)

RDS PostgreSQL (instancia compartida):
  yapepay_users · yapepay_wallets · yapepay_transactions · yapepay_qr

AWS Cognito:
  User Pool → emite JWT para autenticación de usuarios
  App Client → usado por user-service y qr-service

AWS SQS:
  notificationsQueue (Standard) → trigger del notification-handler Lambda
  transactionEventsQueue (FIFO) → reservado

VPC Endpoints (permiten a Lambda en subred pública llamar APIs AWS):
  com.amazonaws.us-east-1.secretsmanager
  com.amazonaws.us-east-1.cognito-idp

ECR: un repositorio por servicio Fargate
  yapepay-dev-user-service
  yapepay-dev-wallet-service
  yapepay-dev-transaction-service
```

---

## Stacks CDK

| Stack | Responsabilidad |
|-------|----------------|
| `YapepayDevNetworkStack` | VPC, subredes públicas (2 AZs), VPC Endpoints para Secrets Manager y Cognito |
| `YapepayDevSecurityStack` | KMS CMK compartida con rotación, alias `alias/yapepay/dev` |
| `YapepayDevStorageStack` | Buckets S3 para documentos KYC y comprobantes PDF |
| `YapepayDevDatabaseStack` | RDS PostgreSQL, secret en Secrets Manager, security group |
| `YapepayDevAuthStack` | Cognito User Pool, App Client, grupos de usuarios |
| `YapepayDevMessagingStack` | SQS notificationsQueue (Standard) + transactionEventsQueue (FIFO) + DLQs |
| `YapepayDevServerlessStack` | Lambda qr-handler (ALB target) + notification-handler (SQS trigger) en VPC |
| `YapepayDevServicesStack` | ECS Cluster, ECR repos, ALB, Fargate services, task definitions, IAM roles |
| `YapepayDevObservabilityStack` | Dashboard y alarmas CloudWatch, SNS topic de alertas |

---

## Recursos principales

### Red
- VPC con 2 subredes públicas (us-east-1a, us-east-1b)
- Sin NAT Gateway (ambiente dev — costo cero)
- VPC Interface Endpoints: Secrets Manager y Cognito (permiten acceso desde Lambda sin IP pública)

### Cómputo
- **ECS Fargate:** cluster `yapepay-dev-cluster`, 3 servicios (256 CPU / 512 MB cada uno), despliegue con `--force-new-deployment` desde CI/CD
- **Lambda qr-handler:** ARM64, 128 MB, timeout 10s, en VPC, con `ACTIVE` X-Ray tracing
- **Lambda notification-handler:** ARM64, 128 MB, timeout 30s, trigger SQS batch 10

### Enrutamiento
- ALB único con listener HTTP 80
- Reglas path-based: prioridades 10 (user) / 20 (wallet) / 30 (transaction) / 40 (qr Lambda)
- Default: 404 JSON para rutas no reconocidas

### Base de datos
- RDS PostgreSQL, instancia compartida, TLS habilitado
- Credenciales en Secrets Manager (`DB_USER` y `DB_PASSWORD`)
- Cada servicio crea su propia base de datos en el arranque (bootstrap migration)

### Autenticación
- Cognito User Pool con grupos de usuarios
- JWT access tokens verificados por `authMiddleware` en cada servicio
- user-service llama a Cognito Admin API para crear usuarios (task role con permisos `AdminCreateUser`, `AdminSetUserPassword`, `AdminAddUserToGroup`)

### Mensajería
- `notificationsQueue` (Standard): recibe eventos `TRANSACTION_COMPLETED` del transaction-service; dispara `notification-handler` Lambda
- `transactionEventsQueue` (FIFO): reservado para uso futuro
- DLQs con retención 14 días para ambas colas

---

## CI/CD

El despliegue es completamente automático al hacer push a `main` en ambos repositorios.

**Pipeline en `yapepay-infra`** (`.github/workflows/ci.yml`):

| Job | Trigger | Pasos |
|-----|---------|-------|
| `build` | PR a main + push a main | checkout → Node 22 → `npm ci` → `tsc` → tests → AWS credentials → `cdk synth` |
| `deploy` | Push a main (tras build exitoso) | checkout → Node 22 → `npm ci` → `tsc` → AWS credentials → `cdk bootstrap` → `cdk deploy --all` |

**Pipeline en `yapepay-services`** (`.github/workflows/cd.yml`):

Construye y despliega cada servicio modificado:
1. Build imagen Docker → push a ECR (`:<sha>` y `:latest`)
2. `ecs update-service --force-new-deployment` (Fargate services)
3. Para qr-service (Lambda): `tsc` → zip → `lambda update-function-code`

**Secretos requeridos en GitHub:**

| Secret | Descripción |
|--------|-------------|
| `AWS_ACCESS_KEY_ID` | Credenciales IAM para CI/CD |
| `AWS_SECRET_ACCESS_KEY` | Credenciales IAM para CI/CD |
| `AWS_ACCOUNT_ID` | ID de cuenta AWS (`628884045138`) |

---

## Requisitos locales

- Node.js 22 LTS
- npm 10+
- AWS CLI v2
- AWS CDK CLI 2.x (`npm install -g aws-cdk`)
- Perfil AWS CLI configurado

---

## Comandos

```bash
npm install          # instalar dependencias
npm run build        # compilar TypeScript
npm test             # ejecutar tests CDK (Jest)
npx cdk synth        # sintetizar CloudFormation (requiere credenciales AWS)
npx cdk diff         # ver cambios pendientes vs. stack desplegado
```

> No ejecutar `cdk deploy` localmente. Todo despliegue va por GitHub CI/CD.

---

## Testing

La suite de tests CDK verifica:
- Presencia de recursos clave en cada stack (VPC, RDS, Cognito, ALB, Lambda, SQS, ECS)
- Configuración correcta de variables de entorno en las task definitions
- Rutas del ALB y prioridades
- Permisos IAM

```bash
npm test
```

---

## Seguridad y costos

- Sin NAT Gateway ni ElastiCache en dev (ahorro de ~$90/mes)
- VPC Endpoints en lugar de NAT para acceso a APIs AWS desde Lambda
- RDS instancia mínima, multi-AZ desactivado en dev
- Lambda: desiredCount 0 para Fargate en deploy inicial (sin imagen en ECR aún)
- Budget USD 20/mes con alertas configuradas
- Secrets Manager para credenciales de DB (nunca en variables de entorno en texto plano)
- KMS CMK con rotación automática

---

## Estructura

```
yapepay-infra/
├── bin/
│   └── yapepay-infra.ts        # entry point CDK app
├── lambda/
│   ├── qr-handler/             # código Lambda QR (zip asset)
│   └── notification-handler/   # código Lambda notificaciones (zip asset)
├── lib/
│   ├── config/
│   │   └── environment.ts      # EnvironmentConfig (dev / prod)
│   ├── constructs/             # constructs reutilizables
│   └── stacks/
│       ├── network-stack.ts
│       ├── security-stack.ts
│       ├── storage-stack.ts
│       ├── database-stack.ts
│       ├── auth-stack.ts
│       ├── messaging-stack.ts
│       ├── serverless-stack.ts
│       ├── services-stack.ts
│       └── observability-stack.ts
├── test/
│   └── yapepay-infra.test.ts
├── .github/
│   └── workflows/
│       └── ci.yml
├── cdk.json
├── package.json
└── tsconfig.json
```
