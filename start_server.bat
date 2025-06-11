@echo off
echo Starting ETF Portfolio Manager...
echo.
echo Checking if server is already running...
netstat -an | find ":3001" > nul
if %errorlevel% == 0 (
    echo Server is already running on port 3001
    echo Opening browser...
    start http://localhost:3001
) else (
    echo Starting server...
    node server.js
)
pause
