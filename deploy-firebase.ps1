# TrustVault 1-Click PowerShell Firebase Deployment Script
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  TrustVault - Cloud Deployment to Firebase" -ForegroundColor Cyan
Write-Host "  Project: trustvault-pvt (Blaze Plan)" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

$rootDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $rootDir

Write-Host "Step 1: Building production bundle..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed! Please check errors above." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Step 2: Authenticating with Firebase CLI..." -ForegroundColor Yellow
Write-Host "If your browser opens, sign in with your Google account." -ForegroundColor Gray
npx firebase-tools login

Write-Host ""
Write-Host "Step 3: Deploying Frontend Hosting, Firestore Rules, and Storage Rules..." -ForegroundColor Yellow
npx firebase-tools deploy

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================================" -ForegroundColor Green
    Write-Host "  Deployment Successful!" -ForegroundColor Green
    Write-Host "  Live URL:        https://trustvault-pvt.web.app" -ForegroundColor Green
    Write-Host "  Firebase Domain: https://trustvault-pvt.firebaseapp.com" -ForegroundColor Green
    Write-Host "========================================================" -ForegroundColor Green
} else {
    Write-Host "Deployment encountered an issue. See log above." -ForegroundColor Red
}
