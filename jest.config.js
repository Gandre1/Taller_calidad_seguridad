/** @type {import('jest').Config} */
module.exports = {
  // Preset para TypeScript
  preset: 'ts-jest',
  
  // Entorno de ejecución
  testEnvironment: 'node',
  
  // Directorios de pruebas
  roots: ['<rootDir>/tests', '<rootDir>/src'],
  
  // Patrones de archivos de prueba
  testMatch: [
    '**/__tests__/**/*.ts',
    '**/?(*.)+(spec|test).ts'
  ],
  
  // Transformación de archivos TypeScript
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        // Configuración específica para pruebas
        esModuleInterop: true,
        allowSyntheticDefaultImports: true
      }
    }]
  },
  
  // Cobertura de código
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.example.ts'
  ],
  
  // Umbrales de cobertura (según diseño: mínimo 85%)
  coverageThreshold: {
    global: {
      branches: 85,
      functions: 85,
      lines: 85,
      statements: 85
    }
  },
  
  // Reportes de cobertura
  coverageReporters: ['text', 'lcov', 'html'],
  
  // Directorio de salida de cobertura
  coverageDirectory: 'coverage',
  
  // Timeout para pruebas (importante para property-based tests)
  testTimeout: 10000,
  
  // Configuración de módulos
  moduleFileExtensions: ['ts', 'js', 'json'],
  
  // Path mapping (si se necesita en el futuro)
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@shared/(.*)$': '<rootDir>/src/shared/$1',
    '^@encryption/(.*)$': '<rootDir>/src/encryption/$1',
    '^@decryption/(.*)$': '<rootDir>/src/decryption/$1'
  },
  
  // Configuración de reportes
  verbose: true,
  
  // Limpiar mocks automáticamente entre pruebas
  clearMocks: true,
  
  // Restaurar mocks automáticamente entre pruebas
  restoreMocks: true
};
