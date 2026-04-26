# yapepay-infra

Infraestructura como código para el MVP de **YapePay**, implementada con
**AWS CDK v2** y **TypeScript**.

El repositorio define la base cloud inicial para generación de QR, mensajería
asíncrona, almacenamiento seguro, observabilidad y validación HTTP manual. El
ambiente objetivo actual es `dev` en `us-east-1`.

## Estado

Versión MVP lista para primer deploy controlado.

- Cuenta AWS objetivo: `628884045138`
- Región: `us-east-1`
- Perfil AWS CLI: `yapepay`
- Bootstrap CDK: ya ejecutado previamente
- MFA root: verificado
- Budget mensual: `yapepay-dev-monthly-budget`, USD 20, alertas 50/80/100
- Deploy automático: no configurado

Antes de desplegar, revisar siempre el diff y ejecutar el script de readiness.

## Arquitectura MVP

| Stack | Estado | Responsabilidad |
|---|---:|---|
| `YapepayDevSecurityStack` | Listo | KMS CMK compartida con rotación y alias `alias/yapepay/dev`. |
| `YapepayDevStorageStack` | Listo | Buckets S3 para documentos KYC y comprobantes PDF. |
| `YapepayDevMessagingStack` | Listo | Colas SQS para eventos de transacción, notificaciones y DLQs. |
| `YapepayDevServerlessStack` | Listo | Lambdas Node.js 22 para QR y notificaciones. |
| `YapepayDevApiStack` | Listo | HTTP API v2 con `POST /v1/qr`. |
| `YapepayDevObservabilityStack` | Listo | Dashboard, alarmas CloudWatch y SNS topic de alarmas. |

Stacks posteriores como `Network`, `Database`, `Cache`, `Services`, `Auth`,
`Edge`, `Audit` y `Pipeline` existen como base de proyecto, pero no se
instancian en esta versión MVP.

## Recursos principales

- S3:
  - Bucket KYC.
  - Bucket de comprobantes PDF.
  - Bloqueo público total, versioning, SSE-KMS, bucket keys y `enforceSSL`.
- SQS:
  - Cola FIFO de eventos de transacción.
  - Cola Standard de notificaciones.
  - DLQs dedicadas.
  - Cifrado SSE-KMS y políticas que fuerzan transporte seguro.
- Lambda:
  - `qr-handler`.
  - `notification-handler`.
  - Runtime Node.js 22, arquitectura ARM64 y logs con retención acotada en dev.
- API Gateway:
  - HTTP API v2.
  - Ruta `POST /v1/qr`.
  - CORS y throttling básicos para dev.
- Observabilidad:
  - Dashboard CloudWatch.
  - Alarmas de API, Lambdas y DLQs.
  - SNS topic sin suscriptores por defecto.

## Requisitos

- Node.js 22 LTS o superior.
- npm 10 o superior.
- AWS CLI v2.
- AWS CDK CLI 2.1119.
- Perfil AWS CLI `yapepay`.
- Git.

Verificación local:

```bash
chmod +x scripts/*.sh
./scripts/check-prerequisites.sh
```

## Instalación

```bash
npm install
npm run build
npm test
```

## Comandos de trabajo

```bash
npm run build                      # compila TypeScript
npm test                           # ejecuta Jest
./scripts/check-prerequisites.sh   # verifica herramientas locales
./scripts/check-deploy-readiness.sh # verifica cuenta, MFA root y Budget
./scripts/synth.sh                 # build + cdk synth
./scripts/diff.sh                  # build + cdk diff
```

## Deploy controlado

No hay deploy automático. El primer despliegue debe ser manual y revisado.

Flujo recomendado:

```bash
export AWS_PROFILE=yapepay

./scripts/check-deploy-readiness.sh
./scripts/diff.sh
./scripts/deploy-dev.sh
```

`deploy-dev.sh` pide una confirmación literal antes de ejecutar
`cdk deploy --all`. No ejecutar deploy si el readiness falla o si el diff no
fue revisado.

Para destruir el ambiente dev, usar solamente con intención explícita:

```bash
./scripts/destroy-dev.sh
```

## Validación HTTP

Después del deploy, obtener el output `HttpApiUrl`:

```bash
export YAPEPAY_API_BASE_URL="$(
  aws cloudformation describe-stacks \
    --stack-name YapepayDevApiStack \
    --query "Stacks[0].Outputs[?OutputKey=='HttpApiUrl'].OutputValue | [0]" \
    --output text \
    --profile yapepay
)"
```

Probar con `curl`:

```bash
./api-examples/curl/post-v1-qr-valid.sh
./api-examples/curl/post-v1-qr-open.sh
./api-examples/curl/post-v1-qr-invalid.sh
```

También se incluye una colección Postman:

```text
api-examples/postman/yapepay-mvp.postman_collection.json
```

Al importarla, actualizar la variable `baseUrl` con el valor de `HttpApiUrl`.

## Estructura

```text
yapepay-infra/
├── api-examples/
│   ├── curl/
│   └── postman/
├── bin/
│   └── yapepay-infra.ts
├── lambda/
│   ├── notification-handler/
│   └── qr-handler/
├── lib/
│   ├── config/
│   ├── constructs/
│   └── stacks/
├── scripts/
├── test/
├── cdk.json
├── package.json
├── tsconfig.json
└── README.md
```

## Testing

La suite actual cubre:

- Assertions CDK de los stacks MVP.
- Contrato local de handlers Lambda.
- Contrato HTTP local para `POST /v1/qr`.

Ejecutar:

```bash
npm test
```

## Seguridad y costos

- No versionar credenciales, archivos `.env`, claves CSV ni secretos.
- `.docs/` es documentación local-only y no se versiona.
- `cdk.out` no se versiona.
- KMS CMK compartida con rotación habilitada.
- S3 bloquea acceso público y fuerza SSL.
- SQS fuerza SSL y usa SSE-KMS.
- Logs y retenciones están acotados para dev.
- Budget mensual configurado antes del primer deploy.
- No se usan NAT Gateways, RDS, Redis, ECS, WAF ni CloudFront en esta versión.

## Documentación local

La documentación extendida, bitácoras y checklist viven en `.docs/` y quedan
fuera de Git por diseño.

Archivos locales principales:

- `.docs/plan_implementacion_cdk_yapepay.md`
- `.docs/reviewer/checklist_avance_vs_plan.md`
- `.docs/architecture.md`
- `.docs/deployment.md`
- `.docs/cost-control.md`

## Próximo paso

Ejecutar un deploy controlado del MVP cuando se apruebe explícitamente el diff.
Después del deploy, validar `POST /v1/qr` con los scripts `curl` y la colección
Postman incluida.
