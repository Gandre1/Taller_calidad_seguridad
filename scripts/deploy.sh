#!/bin/bash

# Script de despliegue para funciones Lambda usando AWS SAM
# Este script despliega la infraestructura completa usando CloudFormation

set -e

# Colores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuración por defecto
DEFAULT_ENVIRONMENT="dev"
DEFAULT_REGION="us-east-1"
DEFAULT_KEY_ID="lambda-encryption-key"
DEFAULT_LOG_LEVEL="INFO"

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

# Función para mostrar ayuda
show_help() {
    cat << EOF
Uso: $0 [OPCIONES]

Script de despliegue para funciones Lambda de encriptación/desencriptación

OPCIONES:
    -e, --environment ENV    Entorno de despliegue (dev|staging|prod) [default: $DEFAULT_ENVIRONMENT]
    -r, --region REGION      Región de AWS [default: $DEFAULT_REGION]
    -k, --key-id KEY_ID      ID de la clave en Secrets Manager [default: $DEFAULT_KEY_ID]
    -l, --log-level LEVEL    Nivel de logging (DEBUG|INFO|WARN|ERROR) [default: $DEFAULT_LOG_LEVEL]
    -s, --stack-name NAME    Nombre del stack de CloudFormation [default: lambda-encryption-{environment}]
    -b, --build              Ejecutar build antes del despliegue
    -g, --guided             Despliegue guiado (primera vez)
    -c, --confirm-changeset  Confirmar changeset antes de aplicar
    -d, --dry-run            Solo mostrar lo que se haría (no ejecutar)
    -h, --help               Mostrar esta ayuda

EJEMPLOS:
    # Despliegue básico en dev
    $0

    # Despliegue en producción con build
    $0 -e prod -b -c

    # Despliegue guiado (primera vez)
    $0 -g

    # Dry run para ver cambios
    $0 -e staging -d

PREREQUISITOS:
    - AWS CLI configurado con credenciales apropiadas
    - SAM CLI instalado
    - Claves RSA almacenadas en AWS Secrets Manager
    - Permisos IAM para crear recursos de CloudFormation, Lambda, API Gateway

EOF
}

# Parsear argumentos
ENVIRONMENT="$DEFAULT_ENVIRONMENT"
REGION="$DEFAULT_REGION"
KEY_ID="$DEFAULT_KEY_ID"
LOG_LEVEL="$DEFAULT_LOG_LEVEL"
STACK_NAME=""
BUILD=false
GUIDED=false
CONFIRM_CHANGESET=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--region)
            REGION="$2"
            shift 2
            ;;
        -k|--key-id)
            KEY_ID="$2"
            shift 2
            ;;
        -l|--log-level)
            LOG_LEVEL="$2"
            shift 2
            ;;
        -s|--stack-name)
            STACK_NAME="$2"
            shift 2
            ;;
        -b|--build)
            BUILD=true
            shift
            ;;
        -g|--guided)
            GUIDED=true
            shift
            ;;
        -c|--confirm-changeset)
            CONFIRM_CHANGESET=true
            shift
            ;;
        -d|--dry-run)
            DRY_RUN=true
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            error "Opción desconocida: $1"
            show_help
            exit 1
            ;;
    esac
done

# Validar argumentos
if [[ ! "$ENVIRONMENT" =~ ^(dev|staging|prod)$ ]]; then
    error "Entorno debe ser: dev, staging, o prod"
    exit 1
fi

if [[ ! "$LOG_LEVEL" =~ ^(DEBUG|INFO|WARN|ERROR)$ ]]; then
    error "Log level debe ser: DEBUG, INFO, WARN, o ERROR"
    exit 1
fi

# Configurar nombre del stack si no se especificó
if [ -z "$STACK_NAME" ]; then
    STACK_NAME="lambda-encryption-$ENVIRONMENT"
fi

log "=== CONFIGURACIÓN DE DESPLIEGUE ==="
log "Entorno: $ENVIRONMENT"
log "Región: $REGION"
log "Stack: $STACK_NAME"
log "Key ID: $KEY_ID"
log "Log Level: $LOG_LEVEL"
log "Build: $BUILD"
log "Guided: $GUIDED"
log "Dry Run: $DRY_RUN"
echo

# Verificar prerequisitos
log "Verificando prerequisitos..."

# Verificar AWS CLI
if ! command -v aws &> /dev/null; then
    error "AWS CLI no está instalado"
    exit 1
fi

# Verificar SAM CLI
if ! command -v sam &> /dev/null; then
    error "SAM CLI no está instalado"
    exit 1
fi

# Verificar credenciales AWS
if ! aws sts get-caller-identity &> /dev/null; then
    error "Credenciales AWS no configuradas o inválidas"
    exit 1
fi

# Verificar que estamos en el directorio correcto
if [ ! -f "template.yaml" ]; then
    error "template.yaml no encontrado. Ejecutar desde el directorio raíz del proyecto."
    exit 1
fi

success "Prerequisitos verificados"

# Ejecutar build si se solicitó
if [ "$BUILD" = true ]; then
    log "Ejecutando build..."
    if [ -f "scripts/build.sh" ]; then
        ./scripts/build.sh
    else
        error "Script de build no encontrado"
        exit 1
    fi
    success "Build completado"
fi

# Verificar que existe el código compilado
if [ ! -d "dist" ]; then
    error "Directorio 'dist' no encontrado. Ejecutar build primero con -b o ./scripts/build.sh"
    exit 1
fi

# Verificar que la clave existe en Secrets Manager
log "Verificando que la clave existe en Secrets Manager..."
if ! aws secretsmanager describe-secret --secret-id "$KEY_ID" --region "$REGION" &> /dev/null; then
    warn "La clave '$KEY_ID' no existe en Secrets Manager en la región $REGION"
    warn "Asegúrate de crear la clave antes del despliegue"
    
    if [ "$DRY_RUN" = false ]; then
        read -p "¿Continuar de todos modos? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log "Despliegue cancelado"
            exit 0
        fi
    fi
fi

# Preparar parámetros SAM
SAM_PARAMS=(
    "--region" "$REGION"
    "--parameter-overrides"
    "Environment=$ENVIRONMENT"
    "KeyId=$KEY_ID"
    "LogLevel=$LOG_LEVEL"
)

if [ "$GUIDED" = true ]; then
    SAM_PARAMS+=("--guided")
fi

if [ "$CONFIRM_CHANGESET" = true ]; then
    SAM_PARAMS+=("--confirm-changeset")
fi

# Mostrar comando que se ejecutará
log "Comando SAM que se ejecutará:"
echo "sam deploy --stack-name $STACK_NAME ${SAM_PARAMS[*]}"
echo

if [ "$DRY_RUN" = true ]; then
    success "Dry run completado. No se ejecutaron cambios."
    exit 0
fi

# Ejecutar despliegue
log "Iniciando despliegue..."

if sam deploy --stack-name "$STACK_NAME" "${SAM_PARAMS[@]}"; then
    success "Despliegue completado exitosamente!"
    
    # Obtener outputs del stack
    log "Obteniendo información del despliegue..."
    
    OUTPUTS=$(aws cloudformation describe-stacks \
        --stack-name "$STACK_NAME" \
        --region "$REGION" \
        --query 'Stacks[0].Outputs' \
        --output table 2>/dev/null || echo "No se pudieron obtener los outputs")
    
    if [ "$OUTPUTS" != "No se pudieron obtener los outputs" ]; then
        echo
        log "=== INFORMACIÓN DEL DESPLIEGUE ==="
        echo "$OUTPUTS"
        
        # Extraer URLs específicas
        API_URL=$(aws cloudformation describe-stacks \
            --stack-name "$STACK_NAME" \
            --region "$REGION" \
            --query 'Stacks[0].Outputs[?OutputKey==`ApiGatewayUrl`].OutputValue' \
            --output text 2>/dev/null)
        
        if [ -n "$API_URL" ] && [ "$API_URL" != "None" ]; then
            echo
            log "=== ENDPOINTS DISPONIBLES ==="
            log "Encriptación: $API_URL/encrypt"
            log "Desencriptación: $API_URL/decrypt"
        fi
    fi
    
    echo
    success "¡Despliegue completado! Las funciones Lambda están listas para usar."
    
else
    error "Falló el despliegue"
    exit 1
fi