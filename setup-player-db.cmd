@echo off
setlocal

echo GM War Room - Player DB Setup
echo.

set /p DATABASE_URL=Paste your PUBLIC Railway DATABASE_URL here: 

if "%DATABASE_URL%"=="" (
  echo ERROR: DATABASE_URL cannot be blank.
  exit /b 1
)

echo DATABASE_URL=%DATABASE_URL%> .env

echo.
echo Saved DATABASE_URL to .env
echo.

echo Applying migrations...
npx tsx --require dotenv/config scripts/applyMigrations.ts
if errorlevel 1 exit /b 1

echo.
echo Validating database...
npx tsx --require dotenv/config scripts/validatePlayerStatsIngestion.ts --season=2024
if errorlevel 1 exit /b 1

echo.
echo Fetching ESPN player data for 2024...
npx tsx --require dotenv/config scripts/fetchEspnWeeklyPlayerStats.ts --season=2024 --skip-existing
if errorlevel 1 exit /b 1

echo.
echo Dry-run ingest for 2024...
npx tsx --require dotenv/config scripts/runIngestionPipeline.ts --season=2024 --dry-run
if errorlevel 1 exit /b 1

echo.
echo Running real ingest for 2024...
npx tsx --require dotenv/config scripts/runIngestionPipeline.ts --season=2024
if errorlevel 1 exit /b 1

echo.
echo Final validation...
npx tsx --require dotenv/config scripts/validatePlayerStatsIngestion.ts --season=2024

echo.
echo DONE.
pause