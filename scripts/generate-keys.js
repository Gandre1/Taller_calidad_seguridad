#!/usr/bin/env node

/**
 * Script para generar claves RSA en formato JWK para las funciones Lambda
 * de encriptación y desencriptación.
 * 
 * Uso:
 *   node scripts/generate-keys.js [opciones]
 * 
 * Opciones:
 *   --key-id <id>     ID personalizado para las claves (default: auto-generado)
 *   --output-dir <dir> Directorio de salida (default: ./keys)
 *   --key-size <size>  Tamaño de la clave en bits (default: 2048)
 *   --help            Mostrar ayuda
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { exportJWK } = require('jose');

// Configuración por defecto
const DEFAULT_KEY_SIZE = 2048;
const DEFAULT_OUTPUT_DIR = './keys';

// Función para mostrar ayuda
function showHelp() {
    console.log(`
Generador de Claves RSA para Lambda Encryption/Decryption

Uso: node scripts/generate-keys.js [opciones]

Opciones:
  --key-id <id>        ID personalizado para las claves (default: auto-generado)
  --output-dir <dir>   Directorio de salida (default: ${DEFAULT_OUTPUT_DIR})
  --key-size <size>    Tamaño de la clave en bits (default: ${DEFAULT_KEY_SIZE})
  --help              Mostrar esta ayuda

Ejemplos:
  # Generar claves con configuración por defecto
  node scripts/generate-keys.js

  # Generar claves con ID personalizado
  node scripts/generate-keys.js --key-id my-encryption-key-2024

  # Generar claves de 4096 bits en directorio personalizado
  node scripts/generate-keys.js --key-size 4096 --output-dir ./production-keys

El script genera:
  - public-key.json: Clave pública JWK para función de encriptación
  - private-key.json: Clave privada JWK para función de desencriptación
  - key-info.json: Metadatos de las claves generadas
  - aws-commands.txt: Comandos para subir las claves a Secrets Manager
`);
}

// Parsear argumentos de línea de comandos
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        keyId: null,
        outputDir: DEFAULT_OUTPUT_DIR,
        keySize: DEFAULT_KEY_SIZE,
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--key-id':
                options.keyId = args[++i];
                break;
            case '--output-dir':
                options.outputDir = args[++i];
                break;
            case '--key-size':
                options.keySize = parseInt(args[++i]);
                break;
            case '--help':
                options.help = true;
                break;
            default:
                console.error(`Opción desconocida: ${args[i]}`);
                process.exit(1);
        }
    }

    return options;
}

// Validar opciones
function validateOptions(options) {
    if (options.keySize < 2048) {
        console.error('Error: El tamaño mínimo de clave es 2048 bits');
        process.exit(1);
    }

    if (options.keySize > 4096) {
        console.warn('Advertencia: Claves mayores a 4096 bits pueden afectar el rendimiento');
    }

    if (!options.keyId) {
        options.keyId = `encryption-key-${Date.now()}`;
    }

    // Validar que el keyId sea válido para AWS Secrets Manager
    if (!/^[a-zA-Z0-9/_+=.@-]+$/.test(options.keyId)) {
        console.error('Error: Key ID contiene caracteres inválidos. Use solo: a-z, A-Z, 0-9, /_+=.@-');
        process.exit(1);
    }
}

// Crear directorio de salida
function ensureOutputDirectory(outputDir) {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
        console.log(`✓ Directorio creado: ${outputDir}`);
    }
}

// Generar par de claves RSA
async function generateKeyPair(keySize) {
    console.log(`🔑 Generando par de claves RSA de ${keySize} bits...`);
    
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
        modulusLength: keySize,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem'
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem'
        }
    });

    return { publicKey, privateKey };
}

// Convertir claves a formato JWK
async function convertToJWK(publicKey, privateKey, keyId) {
    console.log('🔄 Convirtiendo claves a formato JWK...');
    
    // Convertir a objetos de clave
    const publicKeyObject = crypto.createPublicKey(publicKey);
    const privateKeyObject = crypto.createPrivateKey(privateKey);

    // Exportar a JWK
    const publicJWK = await exportJWK(publicKeyObject);
    const privateJWK = await exportJWK(privateKeyObject);

    // Agregar metadatos requeridos
    publicJWK.kty = 'RSA';
    publicJWK.use = 'enc';
    publicJWK.kid = keyId;
    publicJWK.alg = 'RSA-OAEP-256';

    privateJWK.kty = 'RSA';
    privateJWK.use = 'enc';
    privateJWK.kid = keyId;
    privateJWK.alg = 'RSA-OAEP-256';

    return { publicJWK, privateJWK };
}

// Guardar claves en archivos
function saveKeys(publicJWK, privateJWK, outputDir, keyId) {
    console.log('💾 Guardando claves...');
    
    const publicKeyPath = path.join(outputDir, 'public-key.json');
    const privateKeyPath = path.join(outputDir, 'private-key.json');
    
    // Guardar clave pública
    fs.writeFileSync(publicKeyPath, JSON.stringify(publicJWK, null, 2));
    console.log(`✓ Clave pública guardada: ${publicKeyPath}`);
    
    // Guardar clave privada
    fs.writeFileSync(privateKeyPath, JSON.stringify(privateJWK, null, 2));
    console.log(`✓ Clave privada guardada: ${privateKeyPath}`);

    return { publicKeyPath, privateKeyPath };
}

// Crear archivo de metadatos
function createKeyInfo(keyId, keySize, outputDir, publicKeyPath, privateKeyPath) {
    const keyInfo = {
        keyId: keyId,
        keySize: keySize,
        algorithm: 'RSA-OAEP-256',
        encryption: 'A256GCM',
        generatedAt: new Date().toISOString(),
        files: {
            publicKey: path.basename(publicKeyPath),
            privateKey: path.basename(privateKeyPath)
        },
        usage: {
            publicKey: 'Usar en función Lambda de encriptación',
            privateKey: 'Usar en función Lambda de desencriptación'
        },
        secretsManager: {
            publicKeySecretName: `${keyId}-public`,
            privateKeySecretName: `${keyId}-private`
        }
    };

    const keyInfoPath = path.join(outputDir, 'key-info.json');
    fs.writeFileSync(keyInfoPath, JSON.stringify(keyInfo, null, 2));
    console.log(`✓ Información de claves guardada: ${keyInfoPath}`);

    return keyInfo;
}

// Generar comandos AWS CLI
function generateAWSCommands(keyInfo, outputDir) {
    const commands = `# Comandos para subir las claves a AWS Secrets Manager
# Ejecutar estos comandos después de generar las claves

# 1. Crear secret para clave pública
aws secretsmanager create-secret \\
    --name "${keyInfo.secretsManager.publicKeySecretName}" \\
    --description "Clave pública RSA para encriptación Lambda (${keyInfo.keyId})" \\
    --secret-string file://${path.join(outputDir, keyInfo.files.publicKey)} \\
    --region us-east-1

# 2. Crear secret para clave privada
aws secretsmanager create-secret \\
    --name "${keyInfo.secretsManager.privateKeySecretName}" \\
    --description "Clave privada RSA para desencriptación Lambda (${keyInfo.keyId})" \\
    --secret-string file://${path.join(outputDir, keyInfo.files.privateKey)} \\
    --region us-east-1

# 3. Verificar que los secrets fueron creados
aws secretsmanager list-secrets \\
    --query 'SecretList[?contains(Name, \`${keyInfo.keyId}\`)].{Name:Name,Description:Description}' \\
    --output table

# 4. (Opcional) Configurar rotación automática para la clave privada
aws secretsmanager rotate-secret \\
    --secret-id "${keyInfo.secretsManager.privateKeySecretName}" \\
    --rotation-rules AutomaticallyAfterDays=90

# Variables de entorno para las funciones Lambda:
# KEY_ID=${keyInfo.keyId}
# AWS_REGION=us-east-1

# Nota: Asegúrate de que las funciones Lambda tengan permisos para acceder a estos secrets
`;

    const commandsPath = path.join(outputDir, 'aws-commands.txt');
    fs.writeFileSync(commandsPath, commands);
    console.log(`✓ Comandos AWS generados: ${commandsPath}`);
}

// Mostrar resumen
function showSummary(keyInfo, outputDir) {
    console.log('\n🎉 ¡Claves generadas exitosamente!');
    console.log('\n📋 Resumen:');
    console.log(`   Key ID: ${keyInfo.keyId}`);
    console.log(`   Tamaño: ${keyInfo.keySize} bits`);
    console.log(`   Algoritmo: ${keyInfo.algorithm}`);
    console.log(`   Directorio: ${outputDir}`);
    
    console.log('\n📁 Archivos generados:');
    console.log(`   • ${keyInfo.files.publicKey} - Clave pública (para encriptación)`);
    console.log(`   • ${keyInfo.files.privateKey} - Clave privada (para desencriptación)`);
    console.log(`   • key-info.json - Metadatos de las claves`);
    console.log(`   • aws-commands.txt - Comandos para subir a Secrets Manager`);

    console.log('\n🚀 Próximos pasos:');
    console.log('   1. Revisar los archivos generados');
    console.log('   2. Ejecutar los comandos en aws-commands.txt');
    console.log('   3. Configurar KEY_ID en las variables de entorno');
    console.log('   4. Desplegar las funciones Lambda');

    console.log('\n⚠️  Importante:');
    console.log('   • Mantén la clave privada segura y no la compartas');
    console.log('   • Haz backup de las claves en un lugar seguro');
    console.log('   • Considera usar rotación automática en producción');
}

// Función principal
async function main() {
    try {
        const options = parseArgs();

        if (options.help) {
            showHelp();
            return;
        }

        validateOptions(options);
        ensureOutputDirectory(options.outputDir);

        // Generar claves
        const { publicKey, privateKey } = await generateKeyPair(options.keySize);
        const { publicJWK, privateJWK } = await convertToJWK(publicKey, privateKey, options.keyId);
        
        // Guardar archivos
        const { publicKeyPath, privateKeyPath } = saveKeys(publicJWK, privateJWK, options.outputDir, options.keyId);
        const keyInfo = createKeyInfo(options.keyId, options.keySize, options.outputDir, publicKeyPath, privateKeyPath);
        
        // Generar comandos AWS
        generateAWSCommands(keyInfo, options.outputDir);
        
        // Mostrar resumen
        showSummary(keyInfo, options.outputDir);

    } catch (error) {
        console.error('❌ Error:', error.message);
        process.exit(1);
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main();
}

module.exports = { main, generateKeyPair, convertToJWK };