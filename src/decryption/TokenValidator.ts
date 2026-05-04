/**
 * TokenValidator - Validador de token JWE para Lambda de Desencriptación
 * 
 * Valida tokens JWE antes del procesamiento de desencriptación:
 * - Verifica que el token tenga formato compacto JWE (5 partes)
 * - Verifica que los algoritmos sean RSA-OAEP-256 y A256GCM
 * - Decodifica el header JWE para inspeccionar algoritmos
 * 
 * Requisitos validados: 3.2, 3.3, 5.3, 5.4
 */

export interface TokenValidationResult {
  valid: boolean;
  error?: string;
  token?: string;
}

export class TokenValidator {
  /**
   * Valida el formato compacto JWE del token
   * 
   * Un token JWE válido debe tener exactamente 5 partes separadas por puntos:
   * header.encryptedKey.iv.ciphertext.tag
   * 
   * @param token - Token JWE a validar
   * @returns TokenValidationResult con resultado de validación
   */
  validateJWEFormat(token: string): TokenValidationResult {
    // Verificar que el token no esté vacío
    if (!token || token.trim() === '') {
      return {
        valid: false,
        error: 'Validation failed: Token cannot be empty'
      };
    }

    // Verificar que el token tenga exactamente 5 partes
    const parts = token.split('.');
    if (parts.length !== 5) {
      return {
        valid: false,
        error: `Validation failed: JWE token must have exactly 5 parts, found ${parts.length}`
      };
    }

    // Verificar que ninguna parte esté vacía (excepto potencialmente el IV en algunos casos)
    // Para JWE compacto, todas las partes deben estar presentes
    if (parts.some(part => part === '')) {
      return {
        valid: false,
        error: 'Validation failed: JWE token parts cannot be empty'
      };
    }

    return {
      valid: true,
      token
    };
  }

  /**
   * Valida que el token use los algoritmos esperados
   * 
   * Decodifica el header JWE (primera parte del token) y verifica:
   * - alg: "RSA-OAEP-256"
   * - enc: "A256GCM"
   * 
   * @param token - Token JWE a validar
   * @returns true si los algoritmos son correctos, false en caso contrario
   */
  validateAlgorithms(token: string): boolean {
    try {
      // Extraer el header (primera parte del token)
      const parts = token.split('.');
      if (parts.length !== 5 || !parts[0]) {
        return false;
      }

      const headerBase64 = parts[0];
      
      // Decodificar el header desde base64url
      const headerJson = this.base64UrlDecode(headerBase64);
      const header = JSON.parse(headerJson);

      // Verificar algoritmos
      return header.alg === 'RSA-OAEP-256' && header.enc === 'A256GCM';
    } catch (error) {
      // Si hay error al decodificar o parsear, los algoritmos no son válidos
      return false;
    }
  }

  /**
   * Decodifica una cadena base64url a string UTF-8
   * 
   * Base64url es una variante de base64 que usa caracteres seguros para URLs:
   * - Reemplaza '+' con '-'
   * - Reemplaza '/' con '_'
   * - Omite el padding '='
   * 
   * @param base64url - Cadena en formato base64url
   * @returns String decodificado
   */
  private base64UrlDecode(base64url: string): string {
    // Convertir base64url a base64 estándar
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    
    // Agregar padding si es necesario
    const padding = base64.length % 4;
    if (padding > 0) {
      base64 += '='.repeat(4 - padding);
    }

    // Decodificar desde base64
    const buffer = Buffer.from(base64, 'base64');
    return buffer.toString('utf8');
  }
}
