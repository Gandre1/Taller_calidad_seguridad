// Configuración de variables de entorno para pruebas

// Configurar variables de entorno por defecto para pruebas
process.env.KEY_ID = process.env.KEY_ID || 'encryption-key-1778536742629';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'INFO';
process.env.AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Mock de AWS SDK para pruebas
jest.mock('@aws-sdk/client-secrets-manager', () => {
  return {
    SecretsManagerClient: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({
        SecretString: JSON.stringify({
          kty: 'RSA',
          n: 'test-n-value',
          e: 'AQAB',
          alg: 'RSA-OAEP-256',
          use: 'enc'
        })
      })
    })),
    GetSecretValueCommand: jest.fn()
  };
});