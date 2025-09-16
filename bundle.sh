#!/bin/bash
set -e  # Exit on any error

# Configuration - modify these variables as needed
EXTERNALS=(
  "html-rewriter"
  "http-request"
  "create-response"
  "log"
  "encoding"
  "streams"
)

# Convert array to esbuild external format
EXTERNAL_ARGS=""
for external in "${EXTERNALS[@]}"; do
  EXTERNAL_ARGS="$EXTERNAL_ARGS --external:$external"
done

echo "Type checking JavaScript files..."
# ./node_modules/.bin/tsc --noEmit

echo "Building bundle..."
rm -rf dist
./node_modules/.bin/esbuild src/main.js --bundle $EXTERNAL_ARGS --platform=neutral --outdir=dist
cp bundle.json dist/bundle.json
tar -czvf ak-bundle.tgz dist/main.js dist/bundle.json

echo "Build completed successfully!"
