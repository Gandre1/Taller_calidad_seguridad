/**
 * Lambda de Desencriptación - Handler Principal
 * 
 * Coordina la validación, desencriptación y respuesta para desencriptar tokens JWT-JWE.
 * 
 * Requisitos validados: 3.1, 3.6, 3.7, 6.1, 6.3, 8.4
 */

import { TokenValidator } from './TokenValidator';
import { JWEDecryptor } from './JWEDecryptor';
import { KeyManager, JsonWebKey } from '../shared/keyManager';
import { ErrorHandler } from '../shared/errorHandler';
import { Logger, createLogger } from '../shared/logger';

/**
 * Evento de entrada de Lambda
 */
export interface DecryptionEvent {
  body: string;  // JSON stringificado con { token: string }
  headers?: Record<string, string>;
  requestContext?: {
    requestId: string;
  };
}

/**
 * Respuesta de Lambda
 */
export interface DecryptionResponse {
  statusCode: number;
  headers: {
    'Content-Type': string;
  };
  body: string;  // JSON stringificado con datos desencriptados o { error: string }
}

// Instancias globales para reutilización entre invocaciones (warm starts)
let keyManager: KeyManager | null = null;
let privateKey: JsonWebKey | null = null;
let logger: Logger | null = null;

/**
 * Inicializa componentes globales (se ejecuta una vez por contenedor Lambda)
 * 
 * Requisito 4.1: Recuperar clave privada al inicializar
 * Requisito 9.3: Leer KEY_ID desde variable de entorno
 */
async function initialize(): Promise<void> {
  // Inicializar logger
  logger = createLogger();

  logger.info('Initializing decryption Lambda', {
    requestId: 'init',
    timestamp: new Date().toISOString(),
    functionName: 'initialize'
  });

  // Verificar que KEY_ID esté definido
  // Requisito 9.5: Fallar inicialización si variable requerida no está definida
  const keyId = process.env.KEY_ID;
  if (!keyId) {
    const error = new Error('KEY_ID environment variable is not defined');
    logger.error('Initialization failed', error, {
      requestId: 'init',
      timestamp: new Date().toISOString(),
      functionName: 'initialize'
    });
    throw error;
  }

  try {
    // Inicializar KeyManager
    keyManager = new KeyManager();

    // Recuperar clave privada con reintentos
    // Requisito 4.1, 4.2: Recuperar clave privada con reintentos
    privateKey = await keyManager.getPrivateKey(keyId);

    logger.info('Decryption Lambda initialized successfully', {
      requestId: 'init',
      timestamp: new Date().toISOString(),
      functionName: 'initialize',
      keyId
    });
  } catch (error) {
    // Requisito 4.3: Fallar inicialización si clave no puede ser recuperada
    logger.error('Failed to initialize decryption Lambda', error as Error, {
      requestId: 'init',
      timestamp: new Date().toISOString(),
      functionName: 'initialize'
    });
    throw error;
  }
}

/**
 * Handler principal de Lambda de Desencriptación
 * 
 * Requisito 3.1: Desencriptar token JWE válido y retornar datos originales
 * Requisito 3.6: Retornar respuesta con código 200 y datos desencriptados
 * Requisito 3.7: Manejar errores y retornar código 500 sin exponer detalles
 * Requisito 6.1: Registrar cada invocación con timestamp, request ID y resultado
 * Requisito 6.3: Registrar métricas de rendimiento
 * Requisito 8.4: Retornar respuestas con Content-Type apropiado
 */
export async function handler(event: DecryptionEvent): Promise<DecryptionResponse> {
  const startTime = Date.now();
  const requestId = event.requestContext?.requestId || `req-${Date.now()}`;

  // Inicializar logger si no existe (para casos de prueba)
  if (!logger) {
    logger = createLogger();
  }

  // Requisito 6.1: Registrar invocación con timestamp y request ID
  logger.info('Decryption Lambda invoked', {
    requestId,
    timestamp: new Date().toISOString(),
    functionName: 'handler'
  });

  try {
    // Inicializar componentes si es la primera invocación (cold start)
    if (!keyManager || !privateKey) {
      await initialize();
    }

    // Paso 1: Parsear body y extraer token
    // Requisito 3.3: Validar que se proporcione un token
    let parsedBody: any;
    try {
      parsedBody = JSON.parse(event.body);
    } catch (error) {
      logger.warn('Invalid JSON in request body', {
        requestId,
        timestamp: new Date().toISOString(),
        functionName: 'handler',
        error: 'Body must be valid JSON'
      });

      const validationError = ErrorHandler.createValidationError(
        'Validation failed: Body must be valid JSON'
      );
      return ErrorHandler.handle(validationError, requestId);
    }

    const token = parsedBody.token;

    // Requisito 3.3: Retornar error 400 si no se proporciona token
    if (!token || typeof token !== 'string') {
      logger.warn('Token missing or invalid', {
        requestId,
        timestamp: new Date().toISOString(),
        functionName: 'handler',
        error: 'Token is required'
      });

      const validationError = ErrorHandler.createValidationError(
        'Validation failed: Token is required and must be a string'
      );
      return ErrorHandler.handle(validationError, requestId);
    }

    // Paso 2: Validar formato y algoritmos del token
    // Requisito 3.2: Validar token JWE inválido o corrupto
    // Requisito 5.3: Validar formato compacto JWE (5 partes)
    // Requisito 5.4: Validar algoritmos (RSA-OAEP-256, A256GCM)
    const validator = new TokenValidator();
    
    const formatValidation = validator.validateJWEFormat(token);
    if (!formatValidation.valid) {
      logger.warn('Token format validation failed', {
        requestId,
        timestamp: new Date().toISOString(),
        functionName: 'handler',
        error: formatValidation.error
      });

      const validationError = ErrorHandler.createValidationError(
        formatValidation.error || 'Invalid token format'
      );
      return ErrorHandler.handle(validationError, requestId);
    }

    const algorithmsValid = validator.validateAlgorithms(token);
    if (!algorithmsValid) {
      logger.warn('Token algorithms validation failed', {
        requestId,
        timestamp: new Date().toISOString(),
        functionName: 'handler',
        error: 'Token must use RSA-OAEP-256 and A256GCM algorithms'
      });

      const validationError = ErrorHandler.createValidationError(
        'Validation failed: Token must use RSA-OAEP-256 and A256GCM algorithms'
      );
      return ErrorHandler.handle(validationError, requestId);
    }

    // Paso 3: Desencriptar token
    // Requisito 3.1: Desencriptar token JWE válido y retornar datos originales
    // Requisito 3.4, 3.5: Usar RSA-OAEP-256 y A256GCM
    const decryptor = new JWEDecryptor(privateKey!);
    const decryptedData = await decryptor.decrypt(token);

    // Calcular tiempo de ejecución
    const executionTime = Date.now() - startTime;

    // Requisito 6.3: Registrar métricas de rendimiento
    logger.info('Decryption successful', {
      requestId,
      timestamp: new Date().toISOString(),
      functionName: 'handler',
      executionTime,
      result: 'success'
    });

    // Requisito 3.6: Retornar respuesta con código 200 y datos desencriptados
    // Requisito 8.4: Incluir header Content-Type: application/json
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(decryptedData)
    };

  } catch (error) {
    // Calcular tiempo de ejecución
    const executionTime = Date.now() - startTime;

    // Requisito 6.2: Registrar error con contexto sin exponer datos sensibles
    logger.error('Decryption failed', error as Error, {
      requestId,
      timestamp: new Date().toISOString(),
      functionName: 'handler',
      executionTime,
      result: 'error'
    });

    // Requisito 3.7: Manejar errores y retornar código 500 sin exponer detalles
    // Requisito 7.5: Capturar todas las excepciones no manejadas
    return ErrorHandler.handle(error as Error, requestId);
  }
}
