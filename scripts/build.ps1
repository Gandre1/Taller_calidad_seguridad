# Script de build y empaquetado para funciones Lambda (PowerShell)
# Este script compila TypeScript a JavaScript y empaqueta las dependencias

param(
    [switch]$Clean = $false,
    [switch]$Verbose = $false
)

# Configuración de colores
$ErrorActionPreference = "Stop"

function Write-Log {
    param([string]$Message, [string]$Level = "INFO")
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $color = switch ($Level) {
        "ERROR" { "Red" }
        "SUCCESS" { "Green" }
        "WARNING" { "Yellow" }
        "INFO" { "Blue" }
        default { "White" }
    }
    
    Write-Host "[$timestamp] " -NoNewline -ForegroundColor Blue
    Write-Host $Message -ForegroundColor $color
}

function Write-Error-Log {
    param([string]$Message)
    Write-Log $Message "ERROR"
}

function Write-Success-Log {
    param([string]$Message)
    Write-Log $Message "SUCCESS"
}

function Write-Warning-Log {
    param([string]$Message)
    Write-Log $Message "WARNING"
}

try {
    # Verificar que estamos en el directorio correcto
    if (-not (Test-Path "package.json")) {
        Write-Error-Log "package.json no encontrado. Ejecutar desde el directorio raíz del proyecto."
        exit 1
    }

    # Verificar que Node.js está instalado
    try {
        $nodeVersion = node --version
        Write-Log "Node.js versión: $nodeVersion"
        
        # Verificar versión mínima (18)
        $versionNumber = [int]($nodeVersion -replace 'v(\d+)\..*', '$1')
        if ($versionNumber -lt 18) {
            Write-Error-Log "Node.js versión 18 o superior requerida. Versión actual: $nodeVersion"
            exit 1
        }
    }
    catch {
        Write-Error-Log "Node.js no está instalado o no está en el PATH"
        exit 1
    }

    Write-Log "Iniciando proceso de build..."

    # Limpiar directorios anteriores
    if ($Clean -or (Test-Path "dist") -or (Test-Path "lambda-packages")) {
        Write-Log "Limpiando directorios de build anteriores..."
        if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
        if (Test-Path "lambda-packages") { Remove-Item -Recurse -Force "lambda-packages" }
    }

    # Crear directorios necesarios
    New-Item -ItemType Directory -Force -Path "dist/encryption" | Out-Null
    New-Item -ItemType Directory -Force -Path "dist/decryption" | Out-Null
    New-Item -ItemType Directory -Force -Path "lambda-packages" | Out-Null

    # Instalar dependencias si no existen
    if (-not (Test-Path "node_modules")) {
        Write-Log "Instalando dependencias..."
        npm ci
        if ($LASTEXITCODE -ne 0) {
            Write-Error-Log "Falló la instalación de dependencias"
            exit 1
        }
    }
    else {
        Write-Log "Dependencias ya instaladas"
    }

    # Compilar TypeScript
    Write-Log "Compilando TypeScript..."
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Error-Log "Falló la compilación de TypeScript"
        exit 1
    }

    Write-Success-Log "Compilación de TypeScript completada"

    # Función para crear package de Lambda
    function New-LambdaPackage {
        param(
            [string]$FunctionName,
            [string]$SourceDir
        )
        
        Write-Log "Creando package para función $FunctionName..."
        
        # Crear directorio temporal
        $tempDir = "temp_$FunctionName"
        New-Item -ItemType Directory -Force -Path $tempDir | Out-Null
        
        # Copiar archivos compilados de la función específica
        Copy-Item -Recurse -Path "$SourceDir/*" -Destination $tempDir
        
        # Copiar archivos compartidos compilados
        if (Test-Path "dist/shared") {
            New-Item -ItemType Directory -Force -Path "$tempDir/shared" | Out-Null
            Copy-Item -Recurse -Path "dist/shared/*" -Destination "$tempDir/shared/"
        }
        
        # Crear package.json mínimo para la función
        $packageJson = @{
            name = "lambda-$FunctionName"
            version = "1.0.0"
            main = "index.js"
            dependencies = @{
                "@aws-sdk/client-secrets-manager" = "^3.515.0"
                "jose" = "^5.2.0"
            }
        } | ConvertTo-Json -Depth 3
        
        $packageJson | Out-File -FilePath "$tempDir/package.json" -Encoding UTF8
        
        # Instalar solo dependencias de producción
        Write-Log "Instalando dependencias de producción para $FunctionName..."
        Push-Location $tempDir
        try {
            npm install --production --no-optional
            if ($LASTEXITCODE -ne 0) {
                throw "Falló la instalación de dependencias para $FunctionName"
            }
        }
        finally {
            Pop-Location
        }
        
        # Crear ZIP para Lambda
        Write-Log "Creando archivo ZIP para $FunctionName..."
        $zipPath = "lambda-packages/$FunctionName.zip"
        
        # Usar Compress-Archive (PowerShell 5.0+)
        if (Get-Command Compress-Archive -ErrorAction SilentlyContinue) {
            Get-ChildItem -Path $tempDir -Recurse | 
                Where-Object { $_.Extension -notin @('.map', '.ts') } |
                Compress-Archive -DestinationPath $zipPath -Force
        }
        else {
            # Fallback para versiones anteriores de PowerShell
            Add-Type -AssemblyName System.IO.Compression.FileSystem
            [System.IO.Compression.ZipFile]::CreateFromDirectory($tempDir, $zipPath)
        }
        
        # Copiar también a dist para SAM
        Copy-Item -Recurse -Path "$tempDir/*" -Destination "dist/$FunctionName/" -Force
        
        # Limpiar directorio temporal
        Remove-Item -Recurse -Force $tempDir
        
        Write-Success-Log "Package creado: $zipPath"
    }

    # Crear packages para cada función Lambda
    New-LambdaPackage -FunctionName "encryption" -SourceDir "dist/encryption"
    New-LambdaPackage -FunctionName "decryption" -SourceDir "dist/decryption"

    # Verificar tamaños de los packages
    Write-Log "Verificando tamaños de packages..."
    Get-ChildItem -Path "lambda-packages/*.zip" | ForEach-Object {
        $sizeKB = [math]::Round($_.Length / 1KB, 2)
        $sizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Log "Tamaño de $($_.Name): $sizeMB MB ($sizeKB KB)"
        
        # Verificar que no exceda el límite de Lambda (50MB)
        if ($_.Length -gt 50MB) {
            Write-Warning-Log "Package $($_.Name) excede 50MB. Considerar optimización."
        }
    }

    # Generar checksums
    Write-Log "Generando checksums..."
    Get-ChildItem -Path "lambda-packages/*.zip" | ForEach-Object {
        $hash = Get-FileHash -Path $_.FullName -Algorithm SHA256
        "$($hash.Hash.ToLower())  $($_.Name)" | Out-File -FilePath "$($_.FullName).sha256" -Encoding ASCII
    }

    # Crear archivo de metadatos del build
    $buildInfo = @{
        buildTime = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
        nodeVersion = node --version
        npmVersion = npm --version
        gitCommit = try { git rev-parse HEAD 2>$null } catch { "unknown" }
        gitBranch = try { git branch --show-current 2>$null } catch { "unknown" }
        packages = @{
            encryption = @{
                file = "encryption.zip"
                size = (Get-Item "lambda-packages/encryption.zip").Length
            }
            decryption = @{
                file = "decryption.zip"
                size = (Get-Item "lambda-packages/decryption.zip").Length
            }
        }
    }

    $buildInfo | ConvertTo-Json -Depth 3 | Out-File -FilePath "lambda-packages/build-info.json" -Encoding UTF8

    Write-Success-Log "Build completado exitosamente!"
    Write-Log "Archivos generados:"
    Write-Log "  - dist/: Código compilado para SAM"
    Write-Log "  - lambda-packages/: Archivos ZIP para despliegue directo"
    Write-Log "  - lambda-packages/build-info.json: Metadatos del build"

    # Mostrar resumen
    Write-Host ""
    Write-Log "=== RESUMEN DEL BUILD ===" "INFO"
    Write-Log "Funciones Lambda empaquetadas:" "INFO"
    
    Get-ChildItem -Path "lambda-packages/*.zip" | ForEach-Object {
        $name = $_.BaseName
        $sizeMB = [math]::Round($_.Length / 1MB, 2)
        Write-Log "  - $name`: $sizeMB MB" "INFO"
    }

    Write-Host ""
    Write-Success-Log "¡Build completado! Los packages están listos para despliegue."
}
catch {
    Write-Error-Log "Error durante el build: $($_.Exception.Message)"
    if ($Verbose) {
        Write-Host $_.ScriptStackTrace -ForegroundColor Red
    }
    exit 1
}