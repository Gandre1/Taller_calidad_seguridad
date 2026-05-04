# Guía de Despliegue - Sistema de Encriptación/Desencriptación Lambda

Esta guía describe el proceso completo para desplegar las funciones Lambda de encriptación y desencriptación en AWS.

## Tabla de Contenidos

1. [Prerequisitos](#prerequisitos)
2. [Generación de Claves RSA](#generación-de-claves-rsa)
3. [Configuración de AWS Secrets Manager](#configuración-de-aws-secrets-manager)
4. [Variables de Entorno](#variables-de-entorno)
5. [Proceso de Despliegue](#proceso-de-despliegue)
6. [Verificación del Despliegue](#verificación-del-despliegue)
7. [Ejemplos de Invocación](#ejemplos-de-invocación)
8. [Troubleshooting](#troubleshooting)

## Prerequisitos

### Software Requerido

- **Node.js 18+**: Runtime para compilar y ejecutar el código
- **AWS CLI**: Para interactuar con servicios AWS
- **SAM CLI**: Para desplegar funciones Lambda usando CloudFormation
- **OpenSSL**: Para generar claves RSA (opcional, se puede usar AWS KMS)

### Instalación de Herramientas

```bash
# Node.js (usando nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 18
nvm use 18

# AWS CLI
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install

# SAM CLI
pip install aws-sam-cli
# O usando Homebrew en macOS:
# brew install aws-sam-cli
```

### Configuración de AWS

```bash
# Configurar credenciales AWS
aws configure

# Verificar configuración
aws sts get-caller-identity
```

### Permisos IAM Requeridos

El usuario/rol debe tener los siguientes permisos:

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "cloudformation:*",
                "lambda:*",
                "apigateway:*",
                "iam:CreateRole",
                "iam:DeleteRole",
                "iam:GetRole",
                "iam:PassRole",
                "iam:AttachRolePolicy",
                "iam:DetachRolePolicy",
                "iam:PutRolePolicy",
                "iam:DeleteRolePolicy",
                "logs:CreateLogGroup",
                "logs:DeleteLogGroup",
                "logs:PutRetentionPolicy",
                "secretsmanager:GetSecretValue",
                "secretsmanager:CreateSecret",
                "secretsmanager:UpdateSecret"
            ],
            "Resource": "*"
        }
    ]
}
```

## Generación de Claves RSA

### Opción 1: Usando OpenSSL (Recomendado para desarrollo)

```bash
# Generar clave privada RSA de 2048 bits
openssl genrsa -out private_key.pem 2048

# Extraer clave pública
openssl rsa -in private_key.pem -pubout -out public_key.pem

# Convertir claves a formato JWK
# Usar herramienta online o script personalizado
```

### Opción 2: Usando Node.js (Programático)

```javascript
// generate-keys.js
const crypto = require('crypto');
const fs = require('fs');
const { exportJWK } = require('jose');

async function generateKeyPair() {
    // Generar par de claves RSA
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });

    // Convertir a formato JWK
    const publicJWK = await exportJWK(crypto.createPublicKey(publicKey));
    const privateJWK = await exportJWK(crypto.createPrivateKey(privateKey));

    // Agregar metadatos
    const keyId = `encryption-key-${Date.now()}`;
    
    publicJWK.kty = 'RSA';
    publicJWK.use = 'enc';
    publicJWK.kid = keyId;
    
    privateJWK.kty = 'RSA';
    privateJWK.use = 'enc';
    privateJWK.kid = keyId;

    // Guardar claves
    fs.writeFileSync('public-key.json', JSON.stringify(publicJWK, null, 2));
    fs.writeFileSync('private-key.json', JSON.stringify(privateJWK, null, 2));

    console.log('Claves generadas:');
    console.log('- public-key.json (para función de encriptación)');
    console.log('- private-key.json (para función de desencriptación)');
    console.log(`Key ID: ${keyId}`);
}

generateKeyPair().catch(console.error);
```

```bash
# Ejecutar el script
node generate-keys.js
```

### Opción 3: Usando AWS KMS (Recomendado para producción)

```bash
# Crear clave KMS para generar claves RSA
aws kms create-key \
    --description "RSA key for Lambda encryption/decryption" \
    --key-usage ENCRYPT_DECRYPT \
    --key-spec RSA_2048

# Obtener el KeyId de la respuesta y usarlo para generar claves
```

## Configuración de AWS Secrets Manager

### Almacenar Clave Pública

```bash
# Crear secret para clave pública
aws secretsmanager create-secret \
    --name "lambda-encryption-key-public" \
    --description "Clave pública RSA para encriptación Lambda" \
    --secret-string file://public-key.json \
    --region us-east-1
```

### Almacenar Clave Privada

```bash
# Crear secret para clave privada
aws secretsmanager create-secret \
    --name "lambda-encryption-key-private" \
    --description "Clave privada RSA para desencriptación Lambda" \
    --secret-string file://private-key.json \
    --region us-east-1
```

### Configuración con Rotación Automática (Opcional)

```bash
# Configurar rotación automática cada 30 días
aws secretsmanager rotate-secret \
    --secret-id "lambda-encryption-key-private" \
    --rotation-rules AutomaticallyAfterDays=30
```

### Verificar Secrets

```bash
# Listar secrets
aws secretsmanager list-secrets \
    --query 'SecretList[?contains(Name, `lambda-encryption-key`)].{Name:Name,Description:Description}'

# Verificar contenido (solo para testing)
aws secretsmanager get-secret-value \
    --secret-id "lambda-encryption-key-public" \
    --query 'SecretString' \
    --output text | jq .
```

## Variables de Entorno

### Variables Requeridas

| Variable | Descripción | Ejemplo | Función |
|----------|-------------|---------|---------|
| `KEY_ID` | ID base del secret en Secrets Manager | `lambda-encryption-key` | Ambas |
| `AWS_REGION` | Región de AWS | `us-east-1` | Ambas |

### Variables Opcionales

| Variable | Descripción | Default | Función |
|----------|-------------|---------|---------|
| `LOG_LEVEL` | Nivel de logging | `INFO` | Ambas |
| `SECRETS_MANAGER_ENDPOINT` | Endpoint personalizado | AWS default | Ambas |
| `MAX_PAYLOAD_SIZE` | Tamaño máximo del payload | `6291456` (6MB) | Encriptación |
| `KEY_CACHE_TTL` | TTL del caché de claves | `3600000` (1 hora) | Ambas |

### Configuración en template.yaml

Las variables se configuran automáticamente en el template SAM:

```yaml
Environment:
  Variables:
    LOG_LEVEL: !Ref LogLevel
    AWS_REGION: !Ref AWS::Region
    KEY_ID: !Ref KeyId
```

## Proceso de Despliegue

### 1. Preparación del Código

```bash
# Clonar repositorio
git clone <repository-url>
cd lambda-encryption-decryption

# Instalar dependencias
npm install

# Ejecutar tests
npm test

# Verificar linting
npm run lint
```

### 2. Build del Proyecto

```bash
# Opción 1: Build básico (solo compilación)
npm run build

# Opción 2: Build completo para Lambda (recomendado)
npm run build:lambda

# En Windows:
npm run build:lambda:win
```

El build genera:
- `dist/`: Código compilado para SAM
- `lambda-packages/`: Archivos ZIP para despliegue directo

### 3. Despliegue usando Scripts

#### Despliegue en Desarrollo

```bash
# Despliegue básico en dev
npm run deploy:dev

# O usando el script directamente
./scripts/deploy.sh -e dev -b
```

#### Despliegue en Staging

```bash
# Despliegue en staging con confirmación
npm run deploy:staging

# O usando el script directamente
./scripts/deploy.sh -e staging -b -c
```

#### Despliegue en Producción

```bash
# Despliegue en producción con confirmación
npm run deploy:prod

# O usando el script directamente
./scripts/deploy.sh -e prod -b -c
```

#### Despliegue Guiado (Primera vez)

```bash
# Despliegue interactivo
./scripts/deploy.sh -g

# Con parámetros específicos
./scripts/deploy.sh -e prod -k my-encryption-key -r us-west-2 -g
```

### 4. Despliegue Manual con SAM

```bash
# Build con SAM
sam build

# Despliegue guiado (primera vez)
sam deploy --guided

# Despliegue con parámetros
sam deploy \
    --stack-name lambda-encryption-prod \
    --parameter-overrides \
        Environment=prod \
        KeyId=lambda-encryption-key \
        LogLevel=INFO \
    --region us-east-1 \
    --confirm-changeset
```

### 5. Opciones Avanzadas de Despliegue

#### Dry Run (Ver cambios sin aplicar)

```bash
./scripts/deploy.sh -e staging -d
```

#### Despliegue con Stack Personalizado

```bash
./scripts/deploy.sh -e prod -s my-custom-stack-name -b -c
```

#### Despliegue en Región Específica

```bash
./scripts/deploy.sh -e prod -r eu-west-1 -k eu-encryption-key -b
```

## Verificación del Despliegue

### 1. Verificar Stack de CloudFormation

```bash
# Listar stacks
aws cloudformation list-stacks \
    --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE

# Describir stack específico
aws cloudformation describe-stacks \
    --stack-name lambda-encryption-dev
```

### 2. Verificar Funciones Lambda

```bash
# Listar funciones
aws lambda list-functions \
    --query 'Functions[?contains(FunctionName, `encryption`)].{Name:FunctionName,Runtime:Runtime,Status:State}'

# Verificar configuración de función específica
aws lambda get-function-configuration \
    --function-name lambda-encryption-dev-encryption-dev
```

### 3. Verificar API Gateway

```bash
# Listar APIs
aws apigateway get-rest-apis \
    --query 'items[?contains(name, `encryption`)].{Name:name,Id:id}'

# Obtener URL del API
aws cloudformation describe-stacks \
    --stack-name lambda-encryption-dev \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
    --output text
```

### 4. Test de Conectividad

```bash
# Test básico de conectividad
API_URL=$(aws cloudformation describe-stacks \
    --stack-name lambda-encryption-dev \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
    --output text)

curl -X POST "$API_URL/encrypt" \
    -H "Content-Type: application/json" \
    -d '{"test": "data"}'
```

## Ejemplos de Invocación

### 1. Encriptación

#### Usando curl

```bash
# Definir URL del API
API_URL="https://your-api-id.execute-api.us-east-1.amazonaws.com/dev"

# Encriptar datos
curl -X POST "$API_URL/encrypt" \
    -H "Content-Type: application/json" \
    -d '{
        "userId": "12345",
        "email": "user@example.com",
        "sensitiveData": {
            "ssn": "123-45-6789",
            "creditCard": "4111111111111111"
        }
    }'
```

#### Respuesta Esperada

```json
{
    "token": "eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0.OKOawDo13gRp2ojaHV7LFpZcgV7T6DVZKTyKOMTYUmKoTCVJRgckCL9kiMT03JGe...48V1_ALb6US04U3b.5eym8TW_c8SuK0ltJ3rpYIzOeDQz7TALvtu6UG9oMo4vpzs9tX_EFShS8iB7j6ji...XFBoagS79uuU5H9xc8YjXGUZX0iM8"
}
```

### 2. Desencriptación

#### Usando curl

```bash
# Desencriptar token (usar token del ejemplo anterior)
curl -X POST "$API_URL/decrypt" \
    -H "Content-Type: application/json" \
    -d '{
        "token": "eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0.OKOawDo13gRp2ojaHV7LFpZcgV7T6DVZKTyKOMTYUmKoTCVJRgckCL9kiMT03JGe...48V1_ALb6US04U3b.5eym8TW_c8SuK0ltJ3rpYIzOeDQz7TALvtu6UG9oMo4vpzs9tX_EFShS8iB7j6ji...XFBoagS79uuU5H9xc8YjXGUZX0iM8"
    }'
```

#### Respuesta Esperada

```json
{
    "userId": "12345",
    "email": "user@example.com",
    "sensitiveData": {
        "ssn": "123-45-6789",
        "creditCard": "4111111111111111"
    }
}
```

### 3. Usando AWS CLI

#### Invocación Directa de Lambda

```bash
# Encriptación
aws lambda invoke \
    --function-name lambda-encryption-dev-encryption-dev \
    --payload '{
        "body": "{\"userId\":\"12345\",\"email\":\"user@example.com\"}"
    }' \
    response.json

# Ver respuesta
cat response.json
```

### 4. Usando SDK de AWS (Node.js)

```javascript
const AWS = require('aws-sdk');
const lambda = new AWS.Lambda({ region: 'us-east-1' });

async function testEncryption() {
    const payload = {
        userId: '12345',
        email: 'user@example.com',
        sensitiveData: {
            ssn: '123-45-6789'
        }
    };

    // Encriptar
    const encryptResult = await lambda.invoke({
        FunctionName: 'lambda-encryption-dev-encryption-dev',
        Payload: JSON.stringify({
            body: JSON.stringify(payload)
        })
    }).promise();

    const encryptResponse = JSON.parse(encryptResult.Payload);
    const token = JSON.parse(encryptResponse.body).token;

    console.log('Token encriptado:', token);

    // Desencriptar
    const decryptResult = await lambda.invoke({
        FunctionName: 'lambda-encryption-dev-decryption-dev',
        Payload: JSON.stringify({
            body: JSON.stringify({ token })
        })
    }).promise();

    const decryptResponse = JSON.parse(decryptResult.Payload);
    const decryptedData = JSON.parse(decryptResponse.body);

    console.log('Datos desencriptados:', decryptedData);
}

testEncryption().catch(console.error);
```

### 5. Payloads de Prueba

#### Payload Mínimo

```json
{
    "test": "data"
}
```

#### Payload Complejo

```json
{
    "user": {
        "id": "user-123",
        "profile": {
            "name": "John Doe",
            "email": "john@example.com",
            "preferences": {
                "theme": "dark",
                "notifications": true
            }
        }
    },
    "transaction": {
        "id": "txn-456",
        "amount": 100.50,
        "currency": "USD",
        "timestamp": "2024-01-15T10:30:00Z"
    },
    "metadata": {
        "source": "mobile-app",
        "version": "1.2.3",
        "sessionId": "sess-789"
    }
}
```

#### Payload con Datos Sensibles

```json
{
    "personalInfo": {
        "ssn": "123-45-6789",
        "passport": "A12345678",
        "driverLicense": "DL123456789"
    },
    "financialInfo": {
        "creditCard": "4111111111111111",
        "bankAccount": "123456789",
        "routingNumber": "021000021"
    },
    "healthInfo": {
        "patientId": "P123456",
        "diagnosis": "Confidential medical information",
        "medications": ["Med1", "Med2"]
    }
}
```

## Troubleshooting

### Errores Comunes

#### 1. Error: "Secret not found"

```
Error: Secrets Manager can't find the specified secret
```

**Solución:**
```bash
# Verificar que el secret existe
aws secretsmanager describe-secret --secret-id lambda-encryption-key

# Crear el secret si no existe
aws secretsmanager create-secret \
    --name lambda-encryption-key \
    --secret-string file://key.json
```

#### 2. Error: "Access Denied"

```
Error: User is not authorized to perform: secretsmanager:GetSecretValue
```

**Solución:**
- Verificar permisos IAM del rol de Lambda
- Asegurar que el rol tiene acceso al secret específico

#### 3. Error: "Function timeout"

```
Error: Task timed out after 30.00 seconds
```

**Solución:**
- Verificar conectividad a Secrets Manager
- Aumentar timeout en template.yaml si es necesario
- Revisar logs de CloudWatch para más detalles

#### 4. Error: "Payload too large"

```
Error: Request entity too large
```

**Solución:**
- Verificar que el payload no excede 6MB
- Para API Gateway, el límite es 10MB
- Para invocación directa de Lambda, el límite es 6MB

### Debugging

#### 1. Revisar Logs de CloudWatch

```bash
# Obtener logs recientes
aws logs describe-log-groups \
    --log-group-name-prefix "/aws/lambda/lambda-encryption"

# Ver logs específicos
aws logs get-log-events \
    --log-group-name "/aws/lambda/lambda-encryption-dev-encryption-dev" \
    --log-stream-name "2024/01/15/[\$LATEST]abc123"
```

#### 2. Habilitar Logging Detallado

```bash
# Redesplegar con LOG_LEVEL=DEBUG
./scripts/deploy.sh -e dev -l DEBUG -b
```

#### 3. Test Local con SAM

```bash
# Iniciar API local
sam local start-api

# Test en localhost
curl -X POST "http://127.0.0.1:3000/encrypt" \
    -H "Content-Type: application/json" \
    -d '{"test": "data"}'
```

#### 4. Validar Configuración

```bash
# Verificar variables de entorno
aws lambda get-function-configuration \
    --function-name lambda-encryption-dev-encryption-dev \
    --query 'Environment.Variables'

# Verificar permisos IAM
aws lambda get-policy \
    --function-name lambda-encryption-dev-encryption-dev
```

### Monitoreo y Alertas

#### 1. Métricas de CloudWatch

- **Invocations**: Número de invocaciones
- **Duration**: Tiempo de ejecución
- **Errors**: Número de errores
- **Throttles**: Invocaciones limitadas

#### 2. Configurar Alarmas

```bash
# Alarma por errores
aws cloudwatch put-metric-alarm \
    --alarm-name "Lambda-Encryption-Errors" \
    --alarm-description "Alarma por errores en función de encriptación" \
    --metric-name Errors \
    --namespace AWS/Lambda \
    --statistic Sum \
    --period 300 \
    --threshold 5 \
    --comparison-operator GreaterThanThreshold \
    --dimensions Name=FunctionName,Value=lambda-encryption-dev-encryption-dev
```

#### 3. Dashboard de CloudWatch

Crear dashboard para monitorear:
- Latencia de respuesta
- Tasa de errores
- Uso de memoria
- Duración de ejecución

### Rollback

#### 1. Rollback Automático

```bash
# SAM maneja rollback automático en caso de fallo
# No se requiere acción manual
```

#### 2. Rollback Manual

```bash
# Listar versiones del stack
aws cloudformation list-stack-resources \
    --stack-name lambda-encryption-dev

# Rollback a versión anterior
aws cloudformation cancel-update-stack \
    --stack-name lambda-encryption-dev
```

#### 3. Rollback de Código

```bash
# Revertir a commit anterior
git revert HEAD

# Redesplegar
./scripts/deploy.sh -e dev -b
```

---

## Contacto y Soporte

Para problemas o preguntas sobre el despliegue:

1. Revisar logs de CloudWatch
2. Consultar esta documentación
3. Verificar configuración de AWS
4. Contactar al equipo de desarrollo

---

**Nota**: Esta documentación asume familiaridad básica con AWS y herramientas de línea de comandos. Para usuarios nuevos en AWS, se recomienda completar los tutoriales básicos de Lambda y CloudFormation antes de proceder con el despliegue.