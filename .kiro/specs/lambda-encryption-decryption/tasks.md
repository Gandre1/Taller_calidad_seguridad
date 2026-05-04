# Plan de Implementación: Lambda Encryption-Decryption

## Visión General

Este plan implementa dos funciones AWS Lambda independientes en Node.js/TypeScript para encriptación y desencriptación de datos usando JWT-JWE con algoritmos RSA-OAEP-256 y A256GCM. El sistema incluye gestión segura de claves mediante AWS Secrets Manager, validación robusta de entrada, manejo de errores con reintentos, y logging estructurado sin exponer datos sensibles.

## Tareas

- [x] 1. Configurar estructura del proyecto y dependencias
  - Crear estructura de directorios para ambas funciones Lambda
  - Inicializar proyecto Node.js con TypeScript
  - Instalar dependencias: `jose` (JWE), `@aws-sdk/client-secrets-manager`, `@types/aws-lambda`
  - Configurar TypeScript con `tsconfig.json` apropiado para Lambda
  - Configurar Jest y `fast-check` para pruebas
  - _Requisitos: 8.3, 9.1_

- [x] 2. Implementar componentes compartidos
  - [x] 2.1 Crear módulo Logger con sanitización de datos sensibles
    - Implementar clase `Logger` con niveles de log (DEBUG, INFO, WARN, ERROR)
    - Implementar método `sanitize()` para remover payloads, tokens y claves de logs
    - Incluir contexto (requestId, timestamp, functionName) en todos los logs
    - Soportar configuración de nivel de log desde variable de entorno `LOG_LEVEL`
    - _Requisitos: 6.1, 6.2, 6.3, 6.5, 9.4_
  
  - [x] 2.2 Escribir pruebas de propiedad para Logger
    - **Propiedad 6: Sanitización de Logs**
    - **Propiedad 7: Completitud de Logs**
    - **Valida: Requisitos 4.6, 6.1, 6.2, 6.3, 6.5**
  
  - [x] 2.3 Crear módulo ErrorHandler para manejo centralizado de errores
    - Implementar enum `ErrorType` con todos los tipos de error
    - Implementar clase `ErrorHandler` con método `handle()` para mapear errores a respuestas HTTP
    - Implementar métodos helper: `createValidationError()`, `createInternalError()`
    - Asegurar que mensajes de error no expongan detalles internos
    - _Requisitos: 1.7, 3.7, 7.1, 7.2, 7.5_
  
  - [x] 2.4 Escribir pruebas unitarias para ErrorHandler
    - Probar mapeo de cada tipo de error a código HTTP correcto
    - Probar que mensajes de error no contienen información sensible
    - Probar captura de excepciones no manejadas
    - _Requisitos: 7.1, 7.2, 7.5_

- [x] 3. Checkpoint - Verificar componentes compartidos
  - Asegurar que todas las pruebas pasen, preguntar al usuario si surgen dudas.

- [x] 4. Implementar gestión de claves con AWS Secrets Manager
  - [x] 4.1 Crear clase KeyManager con caché y reintentos
    - Implementar cliente de AWS Secrets Manager
    - Implementar caché en memoria usando `Map<string, JsonWebKey>`
    - Implementar método `retryWithBackoff()` con 3 reintentos (100ms, 200ms, 400ms)
    - Implementar métodos `getPublicKey()` y `getPrivateKey()`
    - Implementar validación de formato JWK antes de retornar claves
    - Asegurar que claves privadas nunca se registren en logs
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 9.1, 9.2, 9.3_
  
  - [x] 4.2 Escribir pruebas de propiedad para validación de claves JWK
    - **Propiedad 5: Validación de Claves JWK**
    - **Valida: Requisitos 2.5, 4.5, 8.3**
  
  - [x] 4.3 Escribir pruebas unitarias para KeyManager
    - Probar recuperación exitosa de clave desde Secrets Manager
    - Probar reintentos con backoff exponencial (3 intentos)
    - Probar fallo después de reintentos agotados
    - Probar que caché funciona correctamente
    - Probar validación de formato JWK (claves válidas e inválidas)
    - Probar que claves privadas no se registran en logs
    - _Requisitos: 2.1, 2.2, 2.3, 2.4, 2.5, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 5. Implementar Lambda de Encriptación
  - [x] 5.1 Crear validador de entrada (InputValidator)
    - Implementar método `validatePayload()` para verificar JSON válido
    - Implementar método `checkPayloadSize()` para verificar límite de 6MB
    - Implementar método `checkPayloadContent()` para verificar al menos un campo
    - Retornar errores descriptivos con tipo `ValidationResult`
    - _Requisitos: 1.2, 1.3, 5.1, 5.2_
  
  - [x] 5.2 Escribir pruebas de propiedad para validación de entrada
    - **Propiedad 3: Validación de Entrada**
    - **Valida: Requisitos 1.2, 1.3, 5.1, 5.2, 5.5**
  
  - [x] 5.3 Escribir pruebas unitarias para InputValidator
    - Probar payload vacío retorna error 400
    - Probar payload >6MB retorna error 413
    - Probar JSON inválido retorna error 400
    - Probar payload sin campos retorna error 400
    - Probar payload válido pasa validación
    - _Requisitos: 1.2, 1.3, 5.1, 5.2_
  
  - [x] 5.4 Crear motor de encriptación JWE (JWEEncryptor)
    - Implementar clase `JWEEncryptor` usando librería `jose`
    - Configurar algoritmos: RSA-OAEP-256 para clave, A256GCM para contenido
    - Implementar método `encrypt()` que retorna token JWE en formato compacto
    - Implementar método `validateKey()` para validar clave pública JWK
    - _Requisitos: 1.1, 1.4, 1.5, 8.1_
  
  - [x] 5.5 Escribir pruebas de propiedad para formato JWE
    - **Propiedad 2: Formato y Algoritmos JWE**
    - **Valida: Requisitos 1.4, 1.5, 5.3, 5.4, 8.1**
  
  - [x] 5.6 Implementar handler principal de Lambda de Encriptación
    - Parsear evento de entrada y extraer body
    - Coordinar validación, encriptación y respuesta
    - Manejar errores usando `ErrorHandler`
    - Retornar respuestas HTTP con formato correcto (código, headers, body JSON)
    - Registrar métricas de invocación usando `Logger`
    - _Requisitos: 1.1, 1.6, 1.7, 6.1, 6.3, 8.4_
  
  - [x] 5.7 Escribir pruebas unitarias para handler de encriptación
    - Probar encriptación exitosa retorna 200 con token
    - Probar errores de validación retornan 400
    - Probar errores de encriptación retornan 500
    - Probar que respuestas incluyen header Content-Type: application/json
    - Probar que cada invocación se registra en logs
    - _Requisitos: 1.1, 1.2, 1.3, 1.6, 1.7, 6.1_

- [x] 6. Checkpoint - Verificar Lambda de Encriptación
  - Asegurar que todas las pruebas pasen, preguntar al usuario si surgen dudas.

- [x] 7. Implementar Lambda de Desencriptación
  - [x] 7.1 Crear validador de token JWE (TokenValidator)
    - Implementar método `validateJWEFormat()` para verificar 5 partes separadas por puntos
    - Implementar método `validateAlgorithms()` para verificar alg: RSA-OAEP-256 y enc: A256GCM
    - Decodificar header JWE para inspeccionar algoritmos
    - Retornar errores descriptivos con tipo `TokenValidationResult`
    - _Requisitos: 3.2, 3.3, 5.3, 5.4_
  
  - [x] 7.2 Escribir pruebas de propiedad para validación de token
    - **Propiedad 4: Validación de Token**
    - **Valida: Requisitos 3.2, 3.3, 5.3, 5.4, 5.5**
  
  - [x] 7.3 Escribir pruebas unitarias para TokenValidator
    - Probar token vacío retorna error 400
    - Probar token con formato incorrecto retorna error 400
    - Probar token con algoritmos incorrectos retorna error 400
    - Probar token válido pasa validación
    - _Requisitos: 3.2, 3.3, 5.3, 5.4_
  
  - [x] 7.4 Crear motor de desencriptación JWE (JWEDecryptor)
    - Implementar clase `JWEDecryptor` usando librería `jose`
    - Implementar método `decrypt()` que extrae payload original del token JWE
    - Implementar método `validateKey()` para validar clave privada JWK
    - Manejar errores de desencriptación (token corrupto, clave incorrecta)
    - _Requisitos: 3.1, 3.4, 3.5, 4.5_
  
  - [x] 7.5 Implementar handler principal de Lambda de Desencriptación
    - Parsear evento de entrada y extraer token del body
    - Coordinar validación, desencriptación y respuesta
    - Manejar errores usando `ErrorHandler`
    - Retornar respuestas HTTP con formato correcto (código, headers, body JSON)
    - Registrar métricas de invocación usando `Logger`
    - _Requisitos: 3.1, 3.6, 3.7, 6.1, 6.3, 8.4_
  
  - [x] 7.6 Escribir pruebas unitarias para handler de desencriptación
    - Probar desencriptación exitosa retorna 200 con datos originales
    - Probar token inválido retorna 400
    - Probar token ausente retorna 400
    - Probar errores de desencriptación retornan 500
    - Probar que respuestas incluyen header Content-Type: application/json
    - Probar que cada invocación se registra en logs
    - _Requisitos: 3.1, 3.2, 3.3, 3.6, 3.7, 6.1_

- [x] 8. Checkpoint - Verificar Lambda de Desencriptación
  - Asegurar que todas las pruebas pasen, preguntar al usuario si surgen dudas.

- [x] 9. Implementar pruebas de integración end-to-end
  - [x] 9.1 Escribir prueba de propiedad para round-trip completo
    - **Propiedad 1: Round-trip de Encriptación-Desencriptación**
    - **Valida: Requisitos 3.1, 8.5**
    - Generar payloads aleatorios válidos
    - Encriptar con Lambda de Encriptación
    - Desencriptar con Lambda de Desencriptación
    - Verificar que datos desencriptados son idénticos al payload original
  
  - [x] 9.2 Escribir pruebas de propiedad para manejo de excepciones
    - **Propiedad 8: Manejo de Excepciones**
    - **Valida: Requisitos 1.7, 3.7, 7.2, 7.5**
  
  - [x] 9.3 Escribir pruebas de propiedad para formato de respuesta HTTP
    - **Propiedad 9: Formato de Respuesta HTTP**
    - **Valida: Requisitos 1.6, 3.6, 8.4**
  
  - [x] 9.4 Escribir pruebas de integración con AWS Secrets Manager
    - Configurar LocalStack o mocks para Secrets Manager
    - Probar recuperación de claves pública y privada
    - Probar reintentos cuando Secrets Manager no está disponible
    - Probar fallo de inicialización cuando claves no pueden ser recuperadas
    - _Requisitos: 2.1, 2.2, 2.3, 4.1, 4.2, 4.3_

- [x] 10. Configurar infraestructura y despliegue
  - [x] 10.1 Crear archivos de configuración de Lambda
    - Crear `template.yaml` o `serverless.yml` para definir funciones Lambda
    - Configurar variables de entorno: `KEY_ID`, `LOG_LEVEL`, `AWS_REGION`
    - Configurar permisos IAM para acceso a Secrets Manager
    - Configurar timeout de Lambda (máximo 30 segundos)
    - Configurar memoria de Lambda (512 MB)
    - _Requisitos: 9.1, 9.2, 9.3, 9.4, 9.5, 10.5_
  
  - [x] 10.2 Crear script de build y empaquetado
    - Configurar script para compilar TypeScript a JavaScript
    - Configurar empaquetado de dependencias con `node_modules`
    - Crear archivo ZIP para despliegue en Lambda
    - _Requisitos: 8.3_
  
  - [x] 10.3 Crear documentación de despliegue
    - Documentar proceso de generación de claves RSA
    - Documentar cómo almacenar claves en Secrets Manager
    - Documentar variables de entorno requeridas
    - Documentar proceso de despliegue de funciones Lambda
    - Incluir ejemplos de invocación con payloads de prueba

- [x] 11. Checkpoint final - Verificación completa del sistema
  - Ejecutar suite completa de pruebas (unitarias, propiedades, integración)
  - Verificar cobertura de código ≥85%
  - Verificar que todas las pruebas de propiedad pasan con 100 iteraciones
  - Verificar que tiempo de ejecución de suite <5 minutos
  - Asegurar que todas las pruebas pasen, preguntar al usuario si surgen dudas.

## Notas

- Las tareas marcadas con `*` son opcionales y pueden omitirse para un MVP más rápido
- Cada tarea referencia requisitos específicos para trazabilidad
- Los checkpoints aseguran validación incremental del progreso
- Las pruebas de propiedad validan propiedades universales de corrección
- Las pruebas unitarias validan casos específicos y condiciones de borde
- El sistema usa TypeScript/Node.js con la librería `jose` para JWE
- AWS Secrets Manager gestiona las claves de forma segura
- Logging estructurado sin exponer datos sensibles es crítico para seguridad
