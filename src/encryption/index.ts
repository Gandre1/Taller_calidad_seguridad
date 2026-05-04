/**
 * Lambda de Encriptación - Handler Principal
 * 
 * Coordina la validación, encriptación y respuesta para encriptar datos usando JWT-JWE.
 * 
 * Requisitos validados: 1.1, 1.6, 1.7, 6.1, 6.3, 8.4
 */

import { InputValidator } from './InputValidator';
import { JWEEncryptor } from './JWEEncryptor';
import { KeyManager, JsonWebKey } from '../shared/keyManager';
import { ErrorHandler } from '../shared/errorHandler';
import { Logger, createLogger } from '../shared/logger';

/**
 * Evento de entrada de Lambda
 */
export interface EncryptionEvent {
  body: string;  // JSON stringificado del payload
  headers?: Record<string, string>;
  requestContext?: {
    requestId: string;
  };
}

/**
 * Respuesta de Lambda
 */
export interface EncryptionResponse {
  statusCode: number;
  headers: {
    'Content-Type': string;
  };
  body: string;  // JSON stringificado con { token: string } o { error: string }
}

// Instancias globales para reutilización entre invocaciones (warm starts)
let keyManager: KeyManager | null = null;
let publicKey: JsonWebKey | null = null;
let logger: Logger | null = null;

/**
 * Inicializa componentes globales (se ejecuta una vez por contenedor Lambda)
 * 
 * Requisito 2.1: Recuperar clave pública al inicializar
 * Requisito 9.2: Leer KEY_ID desde variable de entorno
 */
async function initialize(): Promise<void> {
  // Inicializar logger
  logger = createLogger();

  logger.info('Initializing encryption Lambda', {
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

    // Recuperar clave pública con reintentos
    // Requisito 2.1, 2.2: Recuperar clave pública con reintentos
    publicKey = await keyManager.getPublicKey(keyId);

    logger.info('Encryption Lambda initialized successfully', {
      requestId: 'init',
      timestamp: new Date().toISOString(),
      functionName: 'initialize',
      keyId
    });
  } catch (error) {
    // Requisito 2.3: Fallar inicialización si clave no puede ser recuperada
    logger.error('Failed to initialize encryption Lambda', error as Error, {
      requestId: 'init',
      timestamp: new Date().toISOString(),
      functionName: 'initialize'
    });
    throw error;
  }
}

/**
 * Handler principal de Lambda de Encriptación
 * 
 * Requisito 1.1: Encriptar datos usando JWT-JWE
 * Requisito 1.6: Retornar respuesta con código 200 y token JWE
 * Requisito 1.7: Manejar errores y retornar código 500 sin exponer detalles
 * Requisito 6.1: Registrar cada invocación con timestamp, request ID y resultado
 * Requisito 6.3: Registrar métricas de rendimiento
 * Requisito 8.4: Retornar respuestas con Content-Type apropiado
 */
export async function handler(event: EncryptionEvent): Promise<EncryptionResponse> {
  const startTime = Date.now();
  const requestId = event.requestContext?.requestId || `req-${Date.now()}`;

  // Inicializar logger si no existe (para casos de prueba)
  if (!logger) {
    logger = createLogger();
  }

  // Requisito 6.1: Registrar invocación con timestamp y request ID
  logger.info('Encryption Lambda invoked', {
    requestId,
    timestamp: new Date().toISOString(),
    functionName: 'handler'
  });

  try {
    // Inicializar componentes si es la primera invocación (cold start)
    if (!keyManager || !publicKey) {
      await initialize();
    }

    // Paso 1: Parsear y validar entrada
    // Requisito 1.2, 1.3: Validar payload
    const validator = new InputValidator();
    const validationResult = validator.validatePayload(event.body);

    if (!validationResult.valid) {
      // Requisito 7.1: Errores de validación retornan 400
      logger.warn('Validation failed', {
        requestId,
        timestamp: new Date().toISOString(),
        functionName: 'handler',
        error: validationResult.error
      });

      const error = ErrorHandler.createValidationError(
        validationResult.error || 'Validation failed'
      );

      // Verificar si es error de tamaño (413)
      if (validationResult.error?.includes('exceeds')) {
        error.statusCode = 413;
      }

      return ErrorHandler.handle(error, requestId);
    }

    // Paso 2: Encriptar payload
    // Requisito 1.1: Encriptar datos usando JWT-JWE
    // Requisito 1.4, 1.5: Usar RSA-OAEP-256 y A256GCM
    const encryptor = new JWEEncryptor(publicKey!);
    const token = await encryptor.encrypt(validationResult.payload);

    // Calcular tiempo de ejecución
    const executionTime = Date.now() - startTime;

    // Requisito 6.3: Registrar métricas de rendimiento
    logger.info('Encryption successful', {
      requestId,
      timestamp: new Date().toISOString(),
      functionName: 'handler',
      executionTime,
      result: 'success'
    });

    // Requisito 1.6: Retornar respuesta con código 200 y token JWE
    // Requisito 8.4: Incluir header Content-Type: application/json
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        token
      })
    };

  } catch (error) {
    // Calcular tiempo de ejecución
    const executionTime = Date.now() - startTime;

    // Requisito 6.2: Registrar error con contexto sin exponer datos sensibles
    logger.error('Encryption failed', error as Error, {
      requestId,
      timestamp: new Date().toISOString(),
      functionName: 'handler',
      executionTime,
      result: 'error'
    });

    // Requisito 1.7: Manejar errores y retornar código 500 sin exponer detalles
    // Requisito 7.5: Capturar todas las excepciones no manejadas
    return ErrorHandler.handle(error as Error, requestId);
  }
}
