# Lambda Encryption/Decryption System

Sistema de encriptación y desencriptación de datos mediante funciones AWS Lambda usando JWT-JWE (JSON Web Encryption).

## 📋 Entregables Completados

### ✅ 1. Repositorio Git
- **URL**: https://github.com/Gandre1/Taller_calidad_seguridad.git
- **Estado**: Código fuente completo con ambas lambdas subido y versionado

### ✅ 2. Specs por Lambda
- **Ubicación**: `.kiro/specs/lambda-encryption-decryption/`
- **Archivos**: `requirements.md`, `design.md`, `tasks.md`
- **Estado**: Especificaciones completas con requerimientos, diseño y tareas

### ✅ 3. Unit Tests con Cobertura
- **Tests ejecutados**: 316 tests (315 pasados, 1 fallido)
- **Cobertura de código**:
  - Statements: 87.88% ✓ (objetivo: 85%)
  - Branches: 85.77% ✓ (objetivo: 85%)
  - Functions: 91.22% ✓ (objetivo: 85%)
  - Lines: 88.02% ✓ (objetivo: 85%)
- **Property-based testing**: Implementado con fast-check

### ✅ 4. Par de Llaves RSA
- **Key ID**: `encryption-key-1778536742629`
- **Tamaño**: 2048 bits
- **Algoritmo**: RSA-OAEP-256 + A256GCM
- **Ubicación**: AWS Secrets Manager (clave pública y privada)
- **Seguridad**: Clave privada NO subida al repositorio público

### ✅ 5. Lambdas Desplegadas en AWS
- **Función de Encriptación**: `jwe-encryption-dev` (ARN: `arn:aws:lambda:us-east-1:839629614593:function:jwe-encryption-dev`)
- **Función de Desencriptación**: `jwe-decryption-dev` (ARN: `arn:aws:lambda:us-east-1:839629614593:function:jwe-decryption-dev`)
- **Runtime**: Node.js 18.x
- **Estado**: Ambas funciones operativas

## Descripción

Este proyecto implementa dos funciones AWS Lambda independientes:

- **Lambda de Encriptación**: Encripta datos sensibles usando JWT-JWE con algoritmos RSA-OAEP-256 y A256GCM
- **Lambda de Desencriptación**: Desencripta tokens JWE previamente generados

## Características

- ✅ Encriptación conforme con RFC 7516 (JWE) y RFC 7517 (JWK)
- ✅ Algoritmos criptográficos robustos: RSA-OAEP-256 + A256GCM
- ✅ Gestión segura de claves mediante AWS Secrets Manager
- ✅ Validación exhaustiva de entradas y tokens
- ✅ Logging estructurado sin exponer datos sensibles
- ✅ Manejo robusto de errores con reintentos y backoff exponencial
- ✅ Property-based testing con fast-check

## Requisitos

- Node.js 18.x o superior
- npm o yarn
- AWS CLI configurado (para despliegue)

## Instalación y Despliegue

### Prerequisitos

- Node.js 18.x o superior
- npm o yarn
- AWS CLI configurado (para despliegue)
- SAM CLI (para despliegue de infraestructura)

### Instalación Local

```bash
# Clonar el repositorio
git clone <repository-url>
cd lambda-encryption-decryption

# Instalar dependencias
npm install

# Compilar TypeScript
npm run build

# Ejecutar pruebas
npm test

# Ejecutar pruebas con cobertura
npm run test:coverage

# Linting
npm run lint
```

### Despliegue en AWS

#### 1. Generar Claves RSA

```bash
# Generar claves en formato JWK
node scripts/generate-keys.js --key-id my-encryption-key

# Subir claves a AWS Secrets Manager (usar comandos generados)
aws secretsmanager create-secret --name my-encryption-key-public --secret-string file://keys/public-key.json
aws secretsmanager create-secret --name my-encryption-key-private --secret-string file://keys/private-key.json
```

#### 2. Desplegar Infraestructura

```bash
# Despliegue en desarrollo
npm run deploy:dev

# Despliegue en staging con confirmación
npm run deploy:staging

# Despliegue en producción con confirmación
npm run deploy:prod

# Despliegue personalizado
./scripts/deploy.sh -e prod -r us-west-2 -k my-encryption-key -b -c
```

#### 3. Verificar Despliegue

```bash
# Probar funciones desplegadas
node examples/test-functions.js --api-url https://your-api-gateway-url.amazonaws.com/dev

# Probar con diferentes payloads
node examples/test-functions.js --api-url <url> --payload sensitive
```

Para instrucciones detalladas de despliegue, ver [DEPLOYMENT.md](./DEPLOYMENT.md).
Para información sobre infraestructura, ver [INFRASTRUCTURE.md](./INFRASTRUCTURE.md).

## Estructura del Proyecto

```
lambda-encryption-decryption/
├── src/
│   ├── encryption/          # Lambda de Encriptación
│   ├── decryption/          # Lambda de Desencriptación
│   └── shared/              # Componentes compartidos (Logger, ErrorHandler, KeyManager)
├── tests/                   # Pruebas unitarias y property-based tests
├── dist/                    # Código compilado (generado)
├── coverage/                # Reportes de cobertura (generado)
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## Configuración

### Variables de Entorno

**Lambda de Encriptación:**
- `KEY_ID`: ID de la clave pública en Secrets Manager (requerido)
- `LOG_LEVEL`: Nivel de logging (DEBUG, INFO, WARN, ERROR) - default: INFO
- `AWS_REGION`: Región de AWS (auto-provista por Lambda)

**Lambda de Desencriptación:**
- `KEY_ID`: ID de la clave privada en Secrets Manager (requerido)
- `LOG_LEVEL`: Nivel de logging (DEBUG, INFO, WARN, ERROR) - default: INFO
- `AWS_REGION`: Región de AWS (auto-provista por Lambda)

## Uso

### Encriptación

**Entrada:**
```json
{
  "body": "{\"userId\":\"12345\",\"email\":\"user@example.com\",\"sensitiveData\":{\"ssn\":\"123-45-6789\"}}"
}
```

**Salida exitosa (200):**
```json
{
  "statusCode": 200,
  "headers": {
    "Content-Type": "application/json"
  },
  "body": "{\"token\":\"eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0...\"}"
}
```

### Desencriptación

**Entrada:**
```json
{
  "body": "{\"token\":\"eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0...\"}"
}
```

**Salida exitosa (200):**
```json
{
  "statusCode": 200,
  "headers": {
    "Content-Type": "application/json"
  },
  "body": "{\"userId\":\"12345\",\"email\":\"user@example.com\",\"sensitiveData\":{\"ssn\":\"123-45-6789\"}}"
}
```

## 📸 Evidencias Visuales

### Tests y Cobertura

#### 1. Ejecución de Tests Unitarios

Resultado de la ejecución de 316 tests con cobertura superior al 85%:

<p align="center">
<img src="capturas/Captura (1).png" alt="Ejecución de Tests" />
</p>

```bash
# Ejecutar todos los tests
npm test
```

#### 2. Reporte de Cobertura de Código

Cobertura detallada por módulo (Statements: 87.88%, Branches: 85.77%, Functions: 91.22%, Lines: 88.02%):

<p align="center">
<img src="capturas/Captura (2).png" alt="Cobertura de Código" />
</p>

```bash
# Generar reporte de cobertura
npm run test:coverage
```

### Infraestructura AWS

#### 3. Funciones Lambda Desplegadas

Funciones `jwe-encryption-dev` y `jwe-decryption-dev` operativas en AWS Lambda:

<p align="center">
<img src="capturas/Captura (3).png" alt="Lambdas" />
</p>


#### 4. Claves RSA en AWS Secrets Manager

Par de claves RSA almacenadas de forma segura en AWS Secrets Manager:

<p align="center">
<img src="capturas/Captura (4).png" alt="Secrets" />
</p>


## 🚀 Demostración de Funcionalidad

### Encriptación y Desencriptación mediante AWS CLI

#### Encriptación - Terminal (AWS CLI)

Comando para encriptar datos sensibles:

```bash
aws lambda invoke \
  --function-name jwe-encryption-dev \
  --payload fileb://encrypt-payload.json \
  encryption-result.json && cat encryption-result.json
```

**Payload de entrada** (`encrypt-payload.json`):
```json
{
  "body": "{\"userId\":\"12345\",\"email\":\"test@example.com\",\"data\":\"sensitive information\"}"
}
```

**Captura de ejecución:**

<p align="center">
<img src="capturas/Captura (5).png" alt="Encriptación via AWS CLI" />
</p>

---

#### Desencriptación - Terminal (AWS CLI)

Comando para desencriptar el token JWE generado:

```bash
aws lambda invoke \
  --function-name jwe-decryption-dev \
  --payload fileb://decrypt-payload.json \
  decryption-result.json && cat decryption-result.json
```

**Payload de entrada** (`decrypt-payload.json`):
```json
{
  "body": "{\"token\":\"eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0...\"}"
}
```

**Captura de ejecución:**

<p align="center">
<img src="capturas/Captura (6).png" alt="Desencriptación via AWS CLI" />
</p>

---

### Encriptación y Desencriptación mediante AWS Console

#### Encriptación - AWS Console

Prueba de la función de encriptación desde la consola de AWS Lambda:

**Evento de prueba:**
```json
{
  "body": "{\"userId\":\"12345\",\"email\":\"test@example.com\",\"data\":\"sensitive information\"}"
}
```

**Captura de ejecución:**

<p align="center">
<img src="capturas/Captura (7).png" alt="Encriptación via AWS Console" />
</p>

<p align="center">
<img src="capturas/Captura (8).png" alt="Encriptación via AWS Console" />
</p>

---

#### Desencriptación - AWS Console

Prueba de la función de desencriptación desde la consola de AWS Lambda:

**Evento de prueba:**
```json
{
  "body": "{\"token\":\"eyJhbGciOiJSU0EtT0FFUC0yNTYiLCJlbmMiOiJBMjU2R0NNIn0...\"}"
}
```

**Captura de ejecución:**

<p align="center">
<img src="capturas/Captura (9).png" alt="Desencriptación via AWS Console" />
</p>

<p align="center">
<img src="capturas/Captura (10).png" alt="Desencriptación via AWS Console" />
</p>

---

### ✅ Verificación del Flujo Completo

El flujo completo demuestra:

1. ✅ **Encriptación exitosa**: Datos sensibles convertidos en token JWE
2. ✅ **Token JWE válido**: Formato conforme con RFC 7516 (5 partes separadas por puntos)
3. ✅ **Desencriptación exitosa**: Token JWE convertido de vuelta a datos originales
4. ✅ **Integridad de datos**: Los datos desencriptados coinciden exactamente con los originales

## Pruebas

El proyecto utiliza un enfoque dual de pruebas:

### Pruebas Unitarias
Verifican casos específicos, condiciones de borde y escenarios de error.

```bash
npm test
```

### Property-Based Testing
Verifican propiedades universales a través de múltiples entradas generadas con `fast-check`.

```bash
npm test -- --testNamePattern="property"
```

### Cobertura de Código
Objetivo: mínimo 85% de cobertura (✅ SUPERADO: 87.88%)

```bash
npm run test:coverage
```

## Seguridad

- ✅ Las claves criptográficas se gestionan mediante AWS Secrets Manager
- ✅ Las claves privadas nunca se registran en logs
- ✅ Los payloads y tokens no se registran en logs
- ✅ Validación exhaustiva de entradas antes del procesamiento
- ✅ Mensajes de error genéricos que no exponen detalles internos
- ✅ Algoritmos criptográficos conformes con estándares de la industria

## Rendimiento

- Encriptación de payloads hasta 1 MB: < 1 segundo
- Desencriptación de tokens: < 1 segundo
- Cold start: < 3 segundos
- Uso de memoria: < 512 MB
- Payload máximo soportado: 6 MB

## Licencia

MIT
