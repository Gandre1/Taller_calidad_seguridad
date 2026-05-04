# Lambda Encryption/Decryption System

Sistema de encriptación y desencriptación de datos mediante funciones AWS Lambda usando JWT-JWE (JSON Web Encryption).

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
Objetivo: mínimo 85% de cobertura

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
