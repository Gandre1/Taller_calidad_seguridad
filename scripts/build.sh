#!/bin/bash

# Script de build y empaquetado para funciones Lambda
# Este script compila TypeScript a JavaScript y empaqueta las dependencias

set -e  # Salir si cualquier comando falla

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Función para logging
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

warn() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Verificar que estamos en el directorio correcto
if [ ! -f "package.json" ]; then
    error "package.json no encontrado. Ejecutar desde el directorio raíz del proyecto."
    exit 1
fi

# Verificar que Node.js está instalado
if ! command -v node &> /dev/null; then
    error "Node.js no está instalado"
    exit 1
fi

# Verificar versión de Node.js (mínimo 18)
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    error "Node.js versión 18 o superior requerida. Versión actual: $(node -v)"
    exit 1
fi

log "Iniciando proceso de build..."

# Limpiar directorios anteriores
log "Limpiando directorios de build anteriores..."
rm -rf dist/
rm -rf lambda-packages/

# Crear directorios necesarios
mkdir -p dist/encryption
mkdir -p dist/decryption
mkdir -p lambda-packages

# Instalar dependencias si no existen
if [ ! -d "node_modules" ]; then
    log "Instalando dependencias..."
    npm ci
else
    log "Dependencias ya instaladas"
fi

# Compilar TypeScript
log "Compilando TypeScript..."
npm run build

if [ $? -ne 0 ]; then
    error "Falló la compilación de TypeScript"
    exit 1
fi

success "Compilación de TypeScript completada"

# Función para crear package de Lambda
create_lambda_package() {
    local function_name=$1
    local source_dir=$2
    
    log "Creando package para función $function_name..."
    
    # Crear directorio temporal
    local temp_dir="temp_$function_name"
    mkdir -p "$temp_dir"
    
    # Copiar archivos compilados de la función específica
    cp -r "$source_dir"/* "$temp_dir/"
    
    # Copiar archivos compartidos compilados
    if [ -d "dist/shared" ]; then
        mkdir -p "$temp_dir/shared"
        cp -r dist/shared/* "$temp_dir/shared/"
    fi
    
    # Crear package.json mínimo para la función
    cat > "$temp_dir/package.json" << EOF
{
  "name": "lambda-$function_name",
  "version": "1.0.0",
  "main": "index.js",
  "dependencies": {
    "@aws-sdk/client-secrets-manager": "^3.515.0",
    "jose": "^5.2.0"
  }
}
EOF
    
    # Instalar solo dependencias de producción
    log "Instalando dependencias de producción para $function_name..."
    cd "$temp_dir"
    npm install --production --no-optional
    
    # Volver al directorio raíz
    cd ..
    
    # Crear ZIP para Lambda
    log "Creando archivo ZIP para $function_name..."
    cd "$temp_dir"
    
    # Intentar usar zip, si no está disponible usar tar
    if command -v zip &> /dev/null; then
        zip -r "../lambda-packages/$function_name.zip" . -x "*.map" "*.ts"
    else
        warn "zip no está disponible, usando tar como alternativa"
        tar -czf "../lambda-packages/$function_name.tar.gz" --exclude="*.map" --exclude="*.ts" .
        # Crear un enlace simbólico con extensión .zip para compatibilidad
        cd ..
        ln -sf "$function_name.tar.gz" "lambda-packages/$function_name.zip"
        cd "$temp_dir"
    fi
    
    cd ..
    
    # Copiar también a dist para SAM
    cp -r "$temp_dir"/* "dist/$function_name/"
    
    # Limpiar directorio temporal
    rm -rf "$temp_dir"
    
    success "Package creado: lambda-packages/$function_name.zip"
}

# Crear packages para cada función Lambda
create_lambda_package "encryption" "dist/encryption"
create_lambda_package "decryption" "dist/decryption"

# Verificar tamaños de los packages
log "Verificando tamaños de packages..."
for package in lambda-packages/*.{zip,tar.gz}; do
    # Verificar que el archivo existe (evitar expansión de glob fallida)
    if [ -f "$package" ]; then
        size=$(du -h "$package" | cut -f1)
        log "Tamaño de $(basename "$package"): $size"
        
        # Verificar que no exceda el límite de Lambda (50MB)
        size_bytes=$(stat -c%s "$package" 2>/dev/null || stat -f%z "$package" 2>/dev/null)
        if [ "$size_bytes" -gt 52428800 ]; then  # 50MB en bytes
            warn "Package $(basename "$package") excede 50MB. Considerar optimización."
        fi
    fi
done

# Generar checksums
log "Generando checksums..."
cd lambda-packages
for package in *.{zip,tar.gz}; do
    # Verificar que el archivo existe
    if [ -f "$package" ]; then
        sha256sum "$package" > "$package.sha256"
    fi
done
cd ..

# Crear archivo de metadatos del build
cat > lambda-packages/build-info.json << EOF
{
  "buildTime": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "nodeVersion": "$(node -v)",
  "npmVersion": "$(npm -v)",
  "gitCommit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "gitBranch": "$(git branch --show-current 2>/dev/null || echo 'unknown')",
  "packages": {
    "encryption": {
      "file": "encryption.zip",
      "size": "$(stat -c%s lambda-packages/encryption.zip 2>/dev/null || stat -f%z lambda-packages/encryption.zip 2>/dev/null)"
    },
    "decryption": {
      "file": "decryption.zip", 
      "size": "$(stat -c%s lambda-packages/decryption.zip 2>/dev/null || stat -f%z lambda-packages/decryption.zip 2>/dev/null)"
    }
  }
}
EOF

success "Build completado exitosamente!"
log "Archivos generados:"
log "  - dist/: Código compilado para SAM"
log "  - lambda-packages/: Archivos ZIP para despliegue directo"
log "  - lambda-packages/build-info.json: Metadatos del build"

# Mostrar resumen
echo
log "=== RESUMEN DEL BUILD ==="
log "Funciones Lambda empaquetadas:"
for package in lambda-packages/*.{zip,tar.gz}; do
    if [ -f "$package" ]; then
        name=$(basename "$package" | sed 's/\.\(zip\|tar\.gz\)$//')
        size=$(du -h "$package" | cut -f1)
        log "  - $name: $size"
    fi
done

echo
success "¡Build completado! Los packages están listos para despliegue."