@echo off
setlocal
echo ========================================================
echo   THE PLATFORM - PUSH UPDATES TO CLOUD SERVER
echo ========================================================
echo.
git add .
set /p msg="Enter commit message (or press Enter for default): "
if "%msg%"=="" set msg=Update Platform files and features
git commit -m "%msg%"
echo.
echo Pushing updates to remote repository...
git push origin main
echo.
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] Updates pushed to cloud repository!
    echo Your cloud server will automatically rebuild and deploy within 1-2 minutes.
) else (
    echo [ERROR] Push failed. Check your network or GitHub credentials.
)
echo.
pause
