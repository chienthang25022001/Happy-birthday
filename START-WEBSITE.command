#!/bin/bash
set -e
cd "$(dirname "$0")/happy-birthday-backend"
if [ ! -d node_modules ]; then
  echo "Installing dependencies for the first run..."
  npm install
fi
( sleep 2; open "http://localhost:3000" ) &
npm start
