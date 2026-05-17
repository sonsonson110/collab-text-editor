#!/bin/bash
set -e

echo "Running Spring Boot API Hurl Tests..."

# Check if hurl is installed
if ! command -v hurl &> /dev/null; then
    echo "Error: hurl could not be found."
    echo "Please install Hurl: https://hurl.dev/docs/installation.html"
    echo "For Debian/Ubuntu:"
    echo "  VERSION=8.0.0"
    echo "  curl --location --remote-name https://github.com/Orange-OpenSource/hurl/releases/download/\${VERSION}/hurl_\${VERSION}_amd64.deb"
    echo "  sudo apt install ./hurl_\${VERSION}_amd64.deb"
    exit 1
fi

# Define the host variable (default to localhost:8080)
HOST="${API_HOST:-http://localhost:8080}"
echo "Targeting API at: $HOST"

# Generate a random suffix for email addresses to avoid collisions during repeated tests
SUFFIX=$(cat /dev/urandom | tr -dc 'a-z0-9' | fold -w 8 | head -n 1)

# Run the hurl tests
hurl --test \
     --variable host="$HOST" \
     --variable suffix="$SUFFIX" \
     --glob "packages/api-server/hurl/*.hurl"
