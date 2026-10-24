@echo off
title TrustVault - Firebase Deployment
echo ========================================================
echo   TrustVault - Cloud Deployment to Firebase
echo   Project: trustvault-pvt (Blaze Plan)
echo ========================================================
echo.
echo Step 1: Building production bundle...
call npm run build
if %errorlevel% neq 0 (
  echo Build failed!
  pause
  exit /b %errorlevel%
)

echo.
echo Step 2: Logging into Firebase CLI...
echo If prompted, please allow access in your browser.
call npx firebase-tools login

echo.
echo Step 3: Deploying Hosting, Firestore Rules, and Storage Rules...
call npx firebase-tools deploy

echo.
echo ========================================================
echo Deployment Complete!
echo Frontend URL: https://trustvault-pvt.web.app
echo Alternative:  https://trustvault-pvt.firebaseapp.com
echo ========================================================
pause
