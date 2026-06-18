#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
cd "$SCRIPT_DIR"

export LOCAL_HOST="${LOCAL_HOST:-127.0.0.1}"
export LOCAL_PORT="${LOCAL_PORT:-4321}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm was not found. Please install Node.js and npm first."
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "node_modules is missing. Run npm install first."
  exit 1
fi

echo "Starting online-tools for local debugging..."
echo "URL: http://${LOCAL_HOST}:${LOCAL_PORT}/"
echo

npm start
