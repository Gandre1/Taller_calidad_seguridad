/**
 * InputValidator - Validador de entrada para Lambda de Encriptación
 * 
 * Valida payloads de entrada antes del procesamiento de encriptación:
 * - Verifica que el body sea JSON válido
 * - Verifica que el tamaño no exceda 6MB
 * - Verifica que el payload contenga al menos un campo con datos
 * 
 * Requisitos validados: 1.2, 1.3, 5.1, 5.2
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
  payload?: any;
}

export class InputValidator {
  private static readonly MAX_PAYLOAD_SIZE = 6 * 1024 * 1024; // 6MB en bytes (6291456)

  /**
   * Valida el payload completo: formato JSON, tamaño y contenido
   * 
   * @param body - String del body a validar
   * @returns ValidationResult con resultado de validación
   */
  validatePayload(body: string): ValidationResult {
    // Verificar que el body no esté vacío
    if (!body || body.trim() === '') {
      return {
        valid: false,
        error: 'Validation failed: Payload cannot be empty'
      };
    }

    // Verificar tamaño del payload
    if (!this.checkPayloadSize(body)) {
      return {
        valid: false,
        error: 'Validation failed: Payload size exceeds 6MB limit'
      };
    }

    // Intentar parsear JSON
    let payload: any;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      return {
        valid: false,
        error: 'Validation failed: Payload must be a valid JSON object'
      };
    }

    // Verificar que el payload contenga al menos un campo
    if (!this.checkPayloadContent(payload)) {
      return {
        valid: false,
        error: 'Validation failed: Payload must contain at least one field with data'
      };
    }

    return {
      valid: true,
      payload
    };
  }

  /**
   * Verifica que el tamaño del payload no exceda 6MB
   * 
   * @param body - String del body a verificar
   * @returns true si el tamaño es válido, false si excede el límite
   */
  checkPayloadSize(body: string): boolean {
    // Calcular tamaño en bytes usando Buffer
    const sizeInBytes = Buffer.byteLength(body, 'utf8');
    return sizeInBytes <= InputValidator.MAX_PAYLOAD_SIZE;
  }

  /**
   * Verifica que el payload contenga al menos un campo con datos
   * 
   * @param payload - Objeto parseado a verificar
   * @returns true si contiene al menos un campo, false si está vacío
   */
  checkPayloadContent(payload: any): boolean {
    // Verificar que sea un objeto
    if (typeof payload !== 'object' || payload === null) {
      return false;
    }

    // Verificar que no sea un array vacío
    if (Array.isArray(payload) && payload.length === 0) {
      return false;
    }

    // Verificar que tenga al menos una propiedad
    const keys = Object.keys(payload);
    return keys.length > 0;
  }
}
