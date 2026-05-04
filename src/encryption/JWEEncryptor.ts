/**
 * JWEEncryptor - Motor de encriptación JWE
 * 
 * Implementa encriptación usando JWT-JWE con los algoritmos:
 * - RSA-OAEP-256 para cifrado de clave de contenido
 * - A256GCM para cifrado de contenido
 * 
 * Requisitos validados: 1.1, 1.4, 1.5, 8.1
 */

import * as jose from 'jose';

/**
 * Opciones de configuración para encriptación JWE
 */
export interface EncryptionOptions {
  algorithm: 'RSA-OAEP-256';
  encryption: 'A256GCM';
}

/**
 * Clase JWEEncryptor para encriptar payloads usando JWT-JWE
 */
export class JWEEncryptor {
  private publicKey: jose.JWK;
  private readonly options: EncryptionOptions;

  /**
   * Constructor del JWEEncryptor
   * 
   * @param publicKey - Clave pública en formato JWK
   * @throws Error si la clave no es válida
   */
  constructor(publicKey: jose.JWK) {
    // Validar la clave antes de usarla
    if (!this.validateKey(publicKey)) {
      throw new Error('Invalid public key format: Key must be a valid JWK with required fields');
    }

    // Guardar la clave JWK
    this.publicKey = publicKey;

    // Configurar algoritmos según requisitos 1.4 y 1.5
    this.options = {
      algorithm: 'RSA-OAEP-256',
      encryption: 'A256GCM'
    };
  }

  /**
   * Encripta un payload usando JWT-JWE
   * 
   * Requisito 1.1: Encriptar datos usando JWT-JWE
   * Requisito 1.4: Usar algoritmo RSA-OAEP-256 para cifrado de clave
   * Requisito 1.5: Usar algoritmo A256GCM para cifrado de contenido
   * Requisito 8.1: Generar tokens conformes con RFC 7516
   * 
   * @param payload - Datos a encriptar (cualquier objeto JSON válido)
   * @returns Promise<string> - Token JWE en formato compacto (5 partes separadas por puntos)
   * @throws Error si la encriptación falla
   */
  async encrypt(payload: any): Promise<string> {
    try {
      // Convertir payload a string JSON
      const payloadString = JSON.stringify(payload);

      // Importar la clave JWK
      const key = await jose.importJWK(this.publicKey, this.options.algorithm);

      // Crear el JWE usando CompactEncrypt
      // Requisito 1.4: alg = RSA-OAEP-256
      // Requisito 1.5: enc = A256GCM
      const jwe = await new jose.CompactEncrypt(
        new TextEncoder().encode(payloadString)
      )
        .setProtectedHeader({
          alg: this.options.algorithm,
          enc: this.options.encryption
        })
        .encrypt(key);

      // Retornar token JWE en formato compacto
      // Requisito 8.1: Formato compacto conforme con RFC 7516
      return jwe;
    } catch (error) {
      // Propagar error con mensaje descriptivo
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Valida que una clave JWK tenga el formato correcto
   * 
   * Requisito 2.5: Validar formato de clave pública antes de usarla
   * Requisito 8.3: Usar formato JWK conforme con RFC 7517
   * 
   * @param key - Clave en formato JWK a validar
   * @returns true si la clave es válida, false en caso contrario
   */
  validateKey(key: jose.JWK): boolean {
    // Verificar que la clave existe y es un objeto
    if (!key || typeof key !== 'object') {
      return false;
    }

    // Verificar campos requeridos para clave pública RSA según RFC 7517
    // kty: Key Type, debe ser "RSA"
    if (key.kty !== 'RSA') {
      return false;
    }

    // n: Modulus, requerido para claves RSA
    if (!key.n || typeof key.n !== 'string' || key.n.trim() === '') {
      return false;
    }

    // e: Exponent, requerido para claves RSA
    if (!key.e || typeof key.e !== 'string' || key.e.trim() === '') {
      return false;
    }

    // Validación opcional: verificar que use sea "enc" si está presente
    if (key.use && key.use !== 'enc') {
      return false;
    }

    return true;
  }
}
