@echo off
echo ========================================
echo   Deploy OCR Project to Firebase (V2)
echo   Safe Deployment - No impact on V1
echo ========================================
echo.

echo [1/6] Checking Firebase authentication...
firebase projects:list >nul 2>&1
if %errorlevel% neq 0 (
    echo WARNING: Not logged in to Firebase
    echo Please run: firebase login
    pause
    exit /b 1
)
echo OK: Firebase authentication verified

echo.
echo [2/6] Setting Firebase project...
firebase use ocr-system-c3bea
if %errorlevel% neq 0 (
    echo ERROR: Failed to set Firebase project
    pause
    exit /b 1
)
echo OK: Project set to ocr-system-c3bea

echo.
echo [3/6] Building frontend...
call npm run build
if %errorlevel% neq 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)
echo OK: Frontend build completed

echo.
echo [4/6] Installing Functions dependencies...
cd functions
call npm install
if %errorlevel% neq 0 (
    echo ERROR: Failed to install Functions dependencies
    cd ..
    pause
    exit /b 1
)
cd ..
echo OK: Functions dependencies installed

echo.
echo [5/6] Deploying to Firebase (V2 only)...
echo    - Deploying hosting: v2 target (v2-ocr-system-c3bea)
echo    - Deploying functions: ocrImageV2, ocrImageLegacyV2
echo    - NOT deploying: v1 hosting, ocrImage (V1 - protected, deployed separately)
echo.
firebase deploy --only "hosting:v2,functions:ocrImageV2,functions:ocrImageLegacyV2"
if %errorlevel% neq 0 (
    echo ERROR: Deploy failed
    pause
    exit /b 1
)

echo.
echo [6/6] Deployment verification...
echo OK: Deployment completed successfully

echo.
echo ========================================
echo   Deploy Complete!
echo ========================================
echo.
echo Your apps are available at:
echo   V2: https://v2-ocr-system-c3bea.web.app
echo   V1: (deployed separately - not affected)
echo.
echo Function URLs (V2 Project):
echo   V2 (main):      https://us-central1-ocr-system-c3bea.cloudfunctions.net/ocrImageV2
echo   Legacy V2:      https://us-central1-ocr-system-c3bea.cloudfunctions.net/ocrImageLegacyV2
echo.
echo Note: 
echo   - V1 hosting and function (ocrImage) are deployed separately and not affected
echo   - Both V1 and V2 use the same Firestore database and Auth
echo.
pause