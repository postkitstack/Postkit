#!/bin/sh
# postgrest-jwk-entrypoint.sh

set -e

# Configuration
KEYCLOAK_URL=${KEYCLOAK_URL:-"http://keycloak:8080"}
REALM_NAME=${REALM_NAME:-"application"}
MAX_RETRIES=${MAX_RETRIES:-30}
RETRY_DELAY=${RETRY_DELAY:-5}

echo "Starting PostgREST with JWK integration..."

# Function to check if Keycloak is ready
wait_for_keycloak() {
    echo "Waiting for Keycloak to be available..."
    local retries=0
    
    while [ $retries -lt $MAX_RETRIES ]; do
        if wget --quiet --tries=1 --timeout=5 --spider "$KEYCLOAK_URL/realms/master" 2>/dev/null; then
            echo "Keycloak is ready"
            return 0
        else
            retries=$((retries + 1))
            echo "Keycloak not ready (attempt $retries/$MAX_RETRIES), waiting..."
            sleep $RETRY_DELAY
        fi
    done
    
    echo "ERROR: Keycloak not available after $MAX_RETRIES attempts"
    return 1
}

# Function to extract RSA public key from Keycloak JWK
extract_rsa_key() {
    local keycloak_jwk="$1"
    
    # Check if jq is available for JSON manipulation
    if command -v jq >/dev/null 2>&1; then
        # Use jq to extract the first RSA key
        echo "$keycloak_jwk" | jq -r '.keys[] | select(.kty == "RSA") | select(.use == "sig" or .use == null) | {kid, kty, alg, use, key_ops, n, e}'
    else
        # Fallback: manual extraction (less robust)
        echo "Warning: jq not available, using manual JSON extraction"
        
        # Extract RSA key components manually (basic implementation)
        local kid=$(echo "$keycloak_jwk" | sed -n 's/.*"kid":\s*"\([^"]*\)".*/\1/p' | head -1)
        local n=$(echo "$keycloak_jwk" | sed -n 's/.*"n":\s*"\([^"]*\)".*/\1/p' | head -1)
        local e=$(echo "$keycloak_jwk" | sed -n 's/.*"e":\s*"\([^"]*\)".*/\1/p' | head -1)
        
        cat << EOF
{
  "kid": "$kid",
  "kty": "RSA",
  "alg": "RS256",
  "use": "sig",
  "key_ops": ["verify"],
  "n": "$n",
  "e": "$e"
}
EOF
    fi
}

# Function to fetch JWK from Keycloak and configure PostgREST
fetch_and_configure_jwk() {
    local retries=0
    local jwk_url="$KEYCLOAK_URL/realms/$REALM_NAME/protocol/openid-connect/certs"
    
    echo "Fetching JWK from $jwk_url"
    
    while [ $retries -lt $MAX_RETRIES ]; do
        # Use wget to fetch JWK from Keycloak
        if KEYCLOAK_JWK=$(wget --quiet --timeout=10 --tries=1 -O - "$jwk_url" 2>/dev/null); then
            # Validate that we got valid JSON
            if echo "$KEYCLOAK_JWK" | grep -q '"keys"'; then
                echo "Successfully fetched JWK from Keycloak"
                
                # Extract RSA public key for PostgREST
                RSA_KEY=$(extract_rsa_key "$KEYCLOAK_JWK")
                
                if [ $? -eq 0 ] && [ -n "$RSA_KEY" ]; then
                    echo "Successfully extracted RSA key for PostgREST"
                    
                    # Export RSA key as PostgREST JWT secret
                    export PGRST_JWT_SECRET="$RSA_KEY"
                    
                    # Save to files for debugging/other processes
                    echo "$KEYCLOAK_JWK" > /tmp/keycloak_jwks.json
                    echo "$RSA_KEY" > /tmp/postgrest_rsa_key.json
                    
                    # Create environment file
                    cat > /tmp/postgrest_jwk.env << EOF
export PGRST_JWT_SECRET='$RSA_KEY'
export JWT_JWKS_URI='$jwk_url'
export JWK_FETCHED_AT='$(date -Iseconds)'
EOF
                    
                    return 0
                else
                    echo "Failed to extract RSA key from JWK"
                fi
            else
                echo "Invalid JWK response received from Keycloak"
            fi
        fi
        
        retries=$((retries + 1))
        echo "Failed to fetch JWK (attempt $retries/$MAX_RETRIES). Retrying in $RETRY_DELAY seconds..."
        sleep $RETRY_DELAY
    done
    
    echo "ERROR: Failed to fetch and configure JWK after $MAX_RETRIES attempts"
    return 1
}

# Wait for Keycloak
wait_for_keycloak

# Fetch JWK and configure PostgREST
if fetch_and_configure_jwk; then
    echo "JWK configured successfully, starting PostgREST..."
    
    # Print RSA key info for debugging
    echo "JWK URI: $jwk_url"
    if command -v jq >/dev/null 2>&1; then
        echo "RSA Key ID: $(echo "$PGRST_JWT_SECRET" | jq -r '.kid' 2>/dev/null || echo 'N/A')"
        echo "RSA Algorithm: $(echo "$PGRST_JWT_SECRET" | jq -r '.alg' 2>/dev/null || echo 'N/A')"
    fi
    
    # Start the PostgREST process
    exec "$@"
else
    echo "Failed to configure JWK, exiting..."
    exit 1
fi