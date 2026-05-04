#!/usr/bin/env node

/**
 * Script de ejemplo para probar las funciones Lambda de encriptación y desencriptación
 * 
 * Uso:
 *   node examples/test-functions.js [opciones]
 * 
 * Opciones:
 *   --api-url <url>       URL base del API Gateway
 *   --function-prefix <prefix> Prefijo de las funciones Lambda (para invocación directa)
 *   --method <method>     Método de invocación: 'api' o 'lambda' (default: api)
 *   --payload <file>      Archivo JSON con payload personalizado
 *   --help               Mostrar ayuda
 */

const https = require('https');
const AWS = require('aws-sdk');
const fs = require('fs');

// Configuración
const lambda = new AWS.Lambda();

// Payloads de ejemplo
const SAMPLE_PAYLOADS = {
    simple: {
        message: "Hello, World!",
        timestamp: new Date().toISOString()
    },
    
    user: {
        userId: "user-12345",
        email: "john.doe@example.com",
        profile: {
            name: "John Doe",
            age: 30,
            preferences: {
                theme: "dark",
                notifications: true
            }
        }
    },
    
    sensitive: {
        personalInfo: {
            ssn: "123-45-6789",
            passport: "A12345678",
            driverLicense: "DL123456789"
        },
        financialInfo: {
            creditCard: "4111111111111111",
            bankAccount: "123456789",
            routingNumber: "021000021"
        }
    },
    
    large: {
        data: Array(1000).fill(0).map((_, i) => ({
            id: i,
            value: `Item ${i}`,
            metadata: {
                created: new Date().toISOString(),
                tags: [`tag-${i}`, `category-${i % 10}`],
                properties: {
                    active: i % 2 === 0,
                    priority: Math.floor(Math.random() * 5) + 1,
                    description: `This is item number ${i} with some additional text to make it larger`
                }
            }
        }))
    }
};

// Función para mostrar ayuda
function showHelp() {
    console.log(`
Test Script para Funciones Lambda de Encriptación/Desencriptación

Uso: node examples/test-functions.js [opciones]

Opciones:
  --api-url <url>           URL base del API Gateway
  --function-prefix <prefix> Prefijo de las funciones Lambda (ej: lambda-encryption-dev)
  --method <method>         Método: 'api' (API Gateway) o 'lambda' (invocación directa)
  --payload <type|file>     Payload: 'simple', 'user', 'sensitive', 'large' o archivo JSON
  --region <region>         Región de AWS (default: us-east-1)
  --help                   Mostrar esta ayuda

Ejemplos:
  # Test usando API Gateway
  node examples/test-functions.js --api-url https://abc123.execute-api.us-east-1.amazonaws.com/dev

  # Test usando invocación directa de Lambda
  node examples/test-functions.js --method lambda --function-prefix lambda-encryption-dev

  # Test con payload personalizado
  node examples/test-functions.js --api-url <url> --payload ./my-payload.json

  # Test con payload de ejemplo específico
  node examples/test-functions.js --api-url <url> --payload sensitive
`);
}

// Parsear argumentos
function parseArgs() {
    const args = process.argv.slice(2);
    const options = {
        apiUrl: null,
        functionPrefix: null,
        method: 'api',
        payload: 'simple',
        region: 'us-east-1',
        help: false
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--api-url':
                options.apiUrl = args[++i];
                break;
            case '--function-prefix':
                options.functionPrefix = args[++i];
                break;
            case '--method':
                options.method = args[++i];
                break;
            case '--payload':
                options.payload = args[++i];
                break;
            case '--region':
                options.region = args[++i];
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
    if (options.method === 'api' && !options.apiUrl) {
        console.error('Error: --api-url es requerido cuando method=api');
        process.exit(1);
    }

    if (options.method === 'lambda' && !options.functionPrefix) {
        console.error('Error: --function-prefix es requerido cuando method=lambda');
        process.exit(1);
    }

    if (!['api', 'lambda'].includes(options.method)) {
        console.error('Error: method debe ser "api" o "lambda"');
        process.exit(1);
    }

    // Configurar región de AWS
    AWS.config.update({ region: options.region });
}

// Obtener payload
function getPayload(payloadOption) {
    // Si es un archivo
    if (payloadOption.endsWith('.json')) {
        if (!fs.existsSync(payloadOption)) {
            console.error(`Error: Archivo no encontrado: ${payloadOption}`);
            process.exit(1);
        }
        return JSON.parse(fs.readFileSync(payloadOption, 'utf8'));
    }

    // Si es un payload de ejemplo
    if (SAMPLE_PAYLOADS[payloadOption]) {
        return SAMPLE_PAYLOADS[payloadOption];
    }

    console.error(`Error: Payload desconocido: ${payloadOption}`);
    console.error('Payloads disponibles:', Object.keys(SAMPLE_PAYLOADS).join(', '));
    process.exit(1);
}

// Hacer petición HTTP
function makeHttpRequest(url, data) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);
        const urlObj = new URL(url);
        
        const options = {
            hostname: urlObj.hostname,
            port: urlObj.port || 443,
            path: urlObj.pathname,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    const response = {
                        statusCode: res.statusCode,
                        headers: res.headers,
                        body: JSON.parse(responseData)
                    };
                    resolve(response);
                } catch (error) {
                    reject(new Error(`Error parsing response: ${error.message}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.write(postData);
        req.end();
    });
}

// Invocar función Lambda directamente
async function invokeLambda(functionName, payload) {
    const params = {
        FunctionName: functionName,
        Payload: JSON.stringify({
            body: JSON.stringify(payload)
        })
    };

    const result = await lambda.invoke(params).promise();
    
    if (result.FunctionError) {
        throw new Error(`Lambda error: ${result.FunctionError}`);
    }

    const response = JSON.parse(result.Payload);
    return {
        statusCode: response.statusCode,
        body: JSON.parse(response.body)
    };
}

// Test de encriptación usando API Gateway
async function testEncryptionAPI(apiUrl, payload) {
    console.log('🔐 Probando encriptación via API Gateway...');
    
    const url = `${apiUrl}/encrypt`;
    const response = await makeHttpRequest(url, payload);
    
    if (response.statusCode !== 200) {
        throw new Error(`Encryption failed: ${response.statusCode} - ${JSON.stringify(response.body)}`);
    }
    
    console.log('✓ Encriptación exitosa');
    return response.body.token;
}

// Test de desencriptación usando API Gateway
async function testDecryptionAPI(apiUrl, token) {
    console.log('🔓 Probando desencriptación via API Gateway...');
    
    const url = `${apiUrl}/decrypt`;
    const response = await makeHttpRequest(url, { token });
    
    if (response.statusCode !== 200) {
        throw new Error(`Decryption failed: ${response.statusCode} - ${JSON.stringify(response.body)}`);
    }
    
    console.log('✓ Desencriptación exitosa');
    return response.body;
}

// Test de encriptación usando Lambda directa
async function testEncryptionLambda(functionPrefix, payload) {
    console.log('🔐 Probando encriptación via Lambda directa...');
    
    const functionName = `${functionPrefix}-encryption-${functionPrefix.split('-').pop()}`;
    const response = await invokeLambda(functionName, payload);
    
    if (response.statusCode !== 200) {
        throw new Error(`Encryption failed: ${response.statusCode} - ${JSON.stringify(response.body)}`);
    }
    
    console.log('✓ Encriptación exitosa');
    return response.body.token;
}

// Test de desencriptación usando Lambda directa
async function testDecryptionLambda(functionPrefix, token) {
    console.log('🔓 Probando desencriptación via Lambda directa...');
    
    const functionName = `${functionPrefix}-decryption-${functionPrefix.split('-').pop()}`;
    const response = await invokeLambda(functionName, { token });
    
    if (response.statusCode !== 200) {
        throw new Error(`Decryption failed: ${response.statusCode} - ${JSON.stringify(response.body)}`);
    }
    
    console.log('✓ Desencriptación exitosa');
    return response.body;
}

// Comparar datos originales con desencriptados
function compareData(original, decrypted) {
    console.log('🔍 Verificando integridad de datos...');
    
    const originalStr = JSON.stringify(original, null, 2);
    const decryptedStr = JSON.stringify(decrypted, null, 2);
    
    if (originalStr === decryptedStr) {
        console.log('✅ Los datos son idénticos - Round-trip exitoso');
        return true;
    } else {
        console.log('❌ Los datos no coinciden');
        console.log('Original:', originalStr.substring(0, 200) + '...');
        console.log('Desencriptado:', decryptedStr.substring(0, 200) + '...');
        return false;
    }
}

// Mostrar estadísticas
function showStats(payload, token, startTime) {
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    const payloadSize = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    const tokenSize = Buffer.byteLength(token, 'utf8');
    
    console.log('\n📊 Estadísticas:');
    console.log(`   Tiempo total: ${duration}ms`);
    console.log(`   Tamaño payload original: ${payloadSize} bytes (${(payloadSize / 1024).toFixed(2)} KB)`);
    console.log(`   Tamaño token encriptado: ${tokenSize} bytes (${(tokenSize / 1024).toFixed(2)} KB)`);
    console.log(`   Overhead de encriptación: ${((tokenSize - payloadSize) / payloadSize * 100).toFixed(2)}%`);
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
        
        const payload = getPayload(options.payload);
        
        console.log('🚀 Iniciando test de funciones Lambda');
        console.log(`   Método: ${options.method}`);
        console.log(`   Payload: ${options.payload}`);
        console.log(`   Región: ${options.region}`);
        
        if (options.method === 'api') {
            console.log(`   API URL: ${options.apiUrl}`);
        } else {
            console.log(`   Function Prefix: ${options.functionPrefix}`);
        }
        
        console.log('\n' + '='.repeat(50));
        
        const startTime = Date.now();
        
        // Test de encriptación
        let token;
        if (options.method === 'api') {
            token = await testEncryptionAPI(options.apiUrl, payload);
        } else {
            token = await testEncryptionLambda(options.functionPrefix, payload);
        }
        
        console.log(`   Token (primeros 100 chars): ${token.substring(0, 100)}...`);
        
        // Test de desencriptación
        let decryptedData;
        if (options.method === 'api') {
            decryptedData = await testDecryptionAPI(options.apiUrl, token);
        } else {
            decryptedData = await testDecryptionLambda(options.functionPrefix, token);
        }
        
        // Verificar integridad
        const isValid = compareData(payload, decryptedData);
        
        // Mostrar estadísticas
        showStats(payload, token, startTime);
        
        console.log('\n' + '='.repeat(50));
        
        if (isValid) {
            console.log('🎉 ¡Test completado exitosamente!');
            console.log('   Las funciones de encriptación y desencriptación funcionan correctamente');
        } else {
            console.log('❌ Test falló - Los datos no coinciden');
            process.exit(1);
        }
        
    } catch (error) {
        console.error('❌ Error durante el test:', error.message);
        
        if (error.code === 'ENOTFOUND') {
            console.error('   Verifica que la URL del API Gateway sea correcta');
        } else if (error.message.includes('ResourceNotFoundException')) {
            console.error('   Verifica que las funciones Lambda existan y el prefijo sea correcto');
        } else if (error.message.includes('AccessDenied')) {
            console.error('   Verifica que tengas permisos para invocar las funciones Lambda');
        }
        
        process.exit(1);
    }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
    main();
}

module.exports = { 
    main, 
    testEncryptionAPI, 
    testDecryptionAPI, 
    testEncryptionLambda, 
    testDecryptionLambda,
    compareData 
};