#!/bin/sh
# PG-storage-wget-entrypoint.sh

set -e

# Configuration
KEYCLOAK_URL=${KEYCLOAK_URL:-"http://keycloak:8080"}
REALM_NAME=${REALM_NAME:-"your-realm"}
MAX_RETRIES=${MAX_RETRIES:-30}
RETRY_DELAY=${RETRY_DELAY:-5}
STORAGE_URL_SIGNING_KEY=${STORAGE_URL_SIGNING_KEY:-""}
STORAGE_URL_SIGNING_KID=${STORAGE_URL_SIGNING_KID:-"storage-url-signing-key"}

echo "Starting Supabase Storage with JWK integration..."

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

# Function to merge Keycloak JWK with local symmetric key
merge_jwks() {
    local keycloak_jwk="$1"
    local symmetric_key="$2"
    local kid="${3:-storage-url-signing-key}"
    
    # Check if jq is available for JSON manipulation
    if command -v jq >/dev/null 2>&1; then
        # Use jq for proper JSON merging
        echo "$keycloak_jwk" | jq --arg key "$symmetric_key" --arg kid "$kid" '
        {
          "keys": (.keys + [
            {
              "kty": "oct",
              "k": $key,
              "kid": $kid,
              "alg": "HS256"
            }
          ]),
          "urlSigningKey": {
            "kty": "oct",
            "k": $key,
            "kid": $kid,
            "alg": "HS256"
          }
        }'
    else
        # Fallback: manual JSON construction (less robust but works without jq)
        echo "Warning: jq not available, using manual JSON construction"
        
        # Extract the keys array from Keycloak JWK (simple extraction)
        local keycloak_keys=$(echo "$keycloak_jwk" | sed -n 's/.*"keys":\s*\(\[.*\]\).*/\1/p')
        
        # Construct the merged JWK
        cat << EOF
{
  "keys": $(echo "$keycloak_keys" | sed 's/]$/,/')
    {
      "kty": "oct",
      "k": "$symmetric_key",
      "kid": "$kid",
      "alg": "HS256"
    }
  ],
  "urlSigningKey": {
    "kty": "oct",
    "k": "$symmetric_key",
    "kid": "$kid",
    "alg": "HS256"
  }
}
EOF
    fi
}

# Function to fetch JWK from Keycloak and merge with symmetric key
fetch_jwk() {
    local retries=0
    local jwk_url="$KEYCLOAK_URL/realms/$REALM_NAME/protocol/openid-connect/certs"
    
    echo "Fetching JWK from $jwk_url"
    
    # Check if symmetric key is provided
    if [ -z "$STORAGE_URL_SIGNING_KEY" ]; then
        echo "ERROR: STORAGE_URL_SIGNING_KEY environment variable is required"
        return 1
    fi
    
    while [ $retries -lt $MAX_RETRIES ]; do
        # Use wget to fetch JWK from Keycloak
        if KEYCLOAK_JWK=$(wget --quiet --timeout=10 --tries=1 -O - "$jwk_url" 2>/dev/null); then
            # Validate that we got valid JSON
            if echo "$KEYCLOAK_JWK" | grep -q '"keys"'; then
                echo "Successfully fetched JWK from Keycloak"
                
                # Merge Keycloak JWK with symmetric key
                MERGED_JWK=$(merge_jwks "$KEYCLOAK_JWK" "$STORAGE_URL_SIGNING_KEY" "$STORAGE_URL_SIGNING_KID")
                
                if [ $? -eq 0 ] && [ -n "$MERGED_JWK" ]; then
                    echo "Successfully merged JWKs"
                    
                    # Export merged JWK as environment variable
                    export JWT_JWKS="$MERGED_JWK"
                    export JWT_JWKS_URI="$jwk_url"
                    
                    # Save to files for debugging/other processes
                    echo "$KEYCLOAK_JWK" > /tmp/keycloak_jwks.json
                    echo "$MERGED_JWK" > /tmp/merged_jwks.json
                    
                    # Create environment file
                    cat > /tmp/jwk.env << EOF
export JWT_JWKS='$MERGED_JWK'
export JWT_JWKS_URI='$jwk_url'
export JWK_FETCHED_AT='$(date -Iseconds)'
EOF
                    
                    return 0
                else
                    echo "Failed to merge JWKs"
                fi
            else
                echo "Invalid JWK response received from Keycloak"
            fi
        fi
        
        retries=$((retries + 1))
        echo "Failed to fetch JWK (attempt $retries/$MAX_RETRIES). Retrying in $RETRY_DELAY seconds..."
        sleep $RETRY_DELAY
    done
    
    echo "ERROR: Failed to fetch JWK after $MAX_RETRIES attempts"
    return 1
}

# Wait for Keycloak
wait_for_keycloak

# Fetch JWK
if fetch_jwk; then
    echo "JWK fetched successfully, starting Supabase Storage..."
    
    # Print merged JWK info for debugging
    echo "JWK URI: $JWT_JWKS_URI"
    if command -v jq >/dev/null 2>&1; then
        echo "Total JWK Keys count: $(echo "$JWT_JWKS" | jq '.keys | length' 2>/dev/null || echo 'N/A')"
        echo "RSA Keys: $(echo "$JWT_JWKS" | jq '[.keys[] | select(.kty == "RSA")] | length' 2>/dev/null || echo 'N/A')"
        echo "Symmetric Keys: $(echo "$JWT_JWKS" | jq '[.keys[] | select(.kty == "oct")] | length' 2>/dev/null || echo 'N/A')"
    fi
    
    # Start the original Supabase Storage process
    exec "$@"
else
    echo "Failed to fetch JWK, exiting..."
    exit 1
fi