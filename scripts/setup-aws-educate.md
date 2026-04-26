# Configuración de AWS CLI con AWS Educate (macOS)

Guía corta para inyectar credenciales **temporales** de AWS Educate en tu
terminal y dejar AWS CLI listo antes de trabajar con `yapepay-infra`.

> Alineado con `.docs/plan_implementacion_cdk_yapepay.md` (sección 11).

---

## 1. Obtener las credenciales en AWS Educate

1. Inicia sesión en <https://awsacademy.instructure.com> (o el portal de
   AWS Educate de tu institución).
2. Entra al laboratorio / curso correspondiente y abre **AWS Details**.
3. Busca la sección:
   - **Command line or programmatic access**, o
   - **AWS CLI credentials**.
4. Copia el bloque que se ve así:

   ```bash
   export AWS_ACCESS_KEY_ID=ASIA...
   export AWS_SECRET_ACCESS_KEY=...
   export AWS_SESSION_TOKEN=...
   ```

   > Las tres variables son obligatorias. AWS Educate siempre entrega
   > credenciales temporales (`AWS_SESSION_TOKEN` no es opcional).

---

## 2. Pegar las credenciales en Terminal o iTerm2

Abre **Terminal** o **iTerm2** y pega tal cual el bloque copiado:

```bash
export AWS_ACCESS_KEY_ID=ASIA...
export AWS_SECRET_ACCESS_KEY=...
export AWS_SESSION_TOKEN=...
```

> Estas variables sólo viven en la sesión actual del shell. Si abres una
> terminal nueva, deberás volver a exportarlas (o renovarlas).

---

## 3. Configurar región y formato de salida

Para YapePay usamos `us-east-1` como región primaria:

```bash
aws configure set region us-east-1
aws configure set output json
```

---

## 4. Verificar la conexión

```bash
aws sts get-caller-identity
```

Debes ver una respuesta similar a:

```json
{
  "UserId": "AROA...:user1234",
  "Account": "123456789012",
  "Arn": "arn:aws:sts::123456789012:assumed-role/voclabs/user1234"
}
```

Guarda el valor de `Account`: lo necesitarás más adelante para el
`cdk bootstrap` (que **aún no debes ejecutar** en esta fase).

---

## 5. Renovación de credenciales

`AWS_SESSION_TOKEN` **expira** (típicamente cada pocas horas en AWS Educate).
Cuando veas un error tipo:

```text
An error occurred (ExpiredToken) when calling the GetCallerIdentity operation:
The security token included in the request is expired
```

debes:

1. Volver a AWS Educate → **AWS Details**.
2. Copiar el nuevo bloque `export AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_SESSION_TOKEN=...`.
3. Pegarlo nuevamente en la terminal.
4. Validar otra vez con `aws sts get-caller-identity`.

---

## 6. Tip: cargar credenciales rápido

Puedes guardar el bloque que entrega AWS Educate en un archivo local
**no versionado** (por ejemplo `~/.aws-educate.env`) y cargarlo con:

```bash
source ~/.aws-educate.env
aws sts get-caller-identity
```

> Asegúrate de añadirlo a tu `.gitignore` global y **nunca** lo subas al
> repositorio.
