/**
 * JWEDecryptor - Motor de desencriptación JWE
 * 
 * Implementa desencriptación usando JWT-JWE con los algoritmos:
 * - RSA-OAEP-256 para descifrado de clave de contenido
 * - A256GCM para descifrado de contenido
 * 
 * Requisitos validados: 3.1, 3.4, 3.5, 4.5
 */

import * as jose from 'jose';

/**
 * Clase JWEDecryptor para desencriptar tokens JWE
 */
export class JWEDecryptor {
  private privateKey: jose.JWK;

  /**
   * Constructor del JWEDecryptor
   * 
   * @param privateKey - Clave privada en formato JWK
   * @throws Error si la clave no es válida
   */
  constructor(privateKey: jose.JWK) {
    // Validar la clave antes de usarla (Requisito 4.5)
    if (!this.validateKey(privateKey)) {
      throw new Error('Invalid private key format: Key must be a valid JWK with required fields');
    }

    // Guardar la clave JWK
    this.privateKey = privateKey;
  }

  /**
   * Desencripta un token JWE y extrae el payload original
   * 
   * Requisito 3.1: Desencriptar token JWE válido y retornar datos originales
   * Requisito 3.4: Usar algoritmo RSA-OAEP-256 para descifrar clave de contenido
   * Requisito 3.5: Usar algoritmo A256GCM para descifrar contenido
   * 
   * @param token - Token JWE en formato compacto (5 partes separadas por puntos)
   * @returns Promise<any> - Payload original desencriptado
   * @throws Error si la desencriptación falla (token corrupto, clave incorrecta, etc.)
   */
  async decrypt(token: string): Promise<any> {
    try {
      // Importar la clave JWK privada
      // El algoritmo RSA-OAEP-256 se usa automáticamente según el header del token
      const key = await jose.importJWK(this.privateKey, 'RSA-OAEP-256');

      // Desencriptar el token JWE usando compactDecrypt
      // Requisito 3.4: alg = RSA-OAEP-256 (para descifrar la clave de contenido)
      // Requisito 3.5: enc = A256GCM (para descifrar el contenido)
      const { plaintext, protectedHeader } = await jose.compactDecrypt(token, key);

      // Verificar que los algoritmos sean los esperados
      if (protectedHeader.alg !== 'RSA-OAEP-256' || protectedHeader.enc !== 'A256GCM') {
        throw new Error(
          `Unexpected algorithms: alg=${protectedHeader.alg}, enc=${protectedHeader.enc}. ` +
          `Expected: alg=RSA-OAEP-256, enc=A256GCM`
        );
      }

      // Convertir el plaintext (Uint8Array) a string y parsear JSON
      const payloadString = new TextDecoder().decode(plaintext);
      const payload = JSON.parse(payloadString);

      // Requisito 3.1: Retornar datos originales
      return payload;
    } catch (error) {
      // Manejar errores de desencriptación
      // Requisito 3.1: Manejar token corrupto, clave incorrecta, etc.
      if (error instanceof Error) {
        // Proporcionar mensajes de error más específicos según el tipo de error
        if (error.message.includes('JWEDecryptionFailed')) {
          throw new Error('Decryption failed: Token is corrupted or key is incorrect');
        } else if (error.message.includes('JWEInvalid')) {
          throw new Error('Decryption failed: Invalid JWE token format');
        } else if (error.message.includes('Unexpected algorithms')) {
          throw error; // Re-lanzar error de algoritmos incorrectos
        } else if (error.message.includes('Unexpected token')) {
          throw new Error('Decryption failed: Invalid JSON payload');
        } else {
          throw new Error(`Decryption failed: ${error.message}`);
        }
      }
      throw new Error('Decryption failed: Unknown error');
    }
  }

  /**
   * Valida que una clave JWK privada tenga el formato correcto
   * 
   * Requisito 4.5: Validar formato de clave privada antes de usarla
   * 
   * Una clave privada RSA válida debe contener:
   * - kty: "RSA" (Key Type)
   * - n: Modulus (público)
   * - e: Exponent (público)
   * - d: Private Exponent (privado)
   * - p: First Prime Factor (privado)
   * - q: Second Prime Factor (privado)
   * - dp: First Factor CRT Exponent (privado)
   * - dq: Second Factor CRT Exponent (privado)
   * - qi: First CRT Coefficient (privado)
   * 
   * @param key - Clave en formato JWK a validar
   * @returns true si la clave es válida, false en caso contrario
   */
  validateKey(key: jose.JWK): boolean {
    // Verificar que la clave existe y es un objeto
    if (!key || typeof key !== 'object') {
      return false;
    }

    // Verificar que el tipo de clave sea RSA
    if (key.kty !== 'RSA') {
      return false;
    }

    // Verificar campos públicos requeridos
    if (!key.n || typeof key.n !== 'string' || key.n.trim() === '') {
      return false;
    }

    if (!key.e || typeof key.e !== 'string' || key.e.trim() === '') {
      return false;
    }

    // Verificar campos privados requeridos para desencriptación
    // d: Private Exponent (campo crítico para operaciones privadas)
    if (!key.d || typeof key.d !== 'string' || key.d.trim() === '') {
      return false;
    }

    // p y q: Prime factors (requeridos para RSA privado)
    if (!key.p || typeof key.p !== 'string' || key.p.trim() === '') {
      return false;
    }

    if (!key.q || typeof key.q !== 'string' || key.q.trim() === '') {
      return false;
    }

    // dp, dq, qi: CRT parameters (requeridos para operaciones eficientes)
    if (!key.dp || typeof key.dp !== 'string' || key.dp.trim() === '') {
      return false;
    }

    if (!key.dq || typeof key.dq !== 'string' || key.dq.trim() === '') {
      return false;
    }

    if (!key.qi || typeof key.qi !== 'string' || key.qi.trim() === '') {
      return false;
    }

    // Validación opcional: verificar que use sea "enc" si está presente
    if (key.use && key.use !== 'enc') {
      return false;
    }

    return true;
  }
}
