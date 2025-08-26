# Storage Service Configuration Guide


## Service Source Url - [Url](https://github.com/supabase/storage) 

## Overview


This document provides a comprehensive guide for configuring the storage service in your application stack. The service handles file uploads, image transformations, and provides both REST API access and S3-compatible endpoints.



## Table of Contents

1. [Environment Configuration](#environment-configuration)
2. [Authentication Setup](#authentication-setup)
3. [Database Configuration](#database-configuration)
4. [Keycloak Configuration](#keycloak-configuration)
5. [JWT Token Management](#jwt-token-management)
6. [Storage Backend Setup](#storage-backend-setup)
7. [Security Considerations](#security-considerations)

## Environment Configuration

### Core Server Settings

```env
# Basic server configuration
SERVER_HOST=0.0.0.0
SERVER_PORT=5000
SERVER_ADMIN_PORT=5001
SERVER_KEEP_ALIVE_TIMEOUT=61
SERVER_HEADERS_TIMEOUT=65
SERVER_REGION=local
CORS_ALLOWED_ORIGINS=*

# Request handling
REQUEST_URL_LENGTH_LIMIT=7500
REQUEST_TRACE_HEADER=trace-id
REQUEST_ETAG_HEADERS=if-none-match
RESPONSE_S_MAXAGE=0
```

### Database Configuration

```env
DATABASE_URL=postgres://username:password@host:port/database?sslmode=disable
DATABASE_CONNECTION_TIMEOUT=3000
DATABASE_MAX_CONNECTIONS=20
DATABASE_FREE_POOL_AFTER_INACTIVITY=60000
DATABASE_SEARCH_PATH=storage,public
```

### Upload Settings

```env
# File upload limits
UPLOAD_FILE_SIZE_LIMIT=524288000          # 500MB general limit
UPLOAD_FILE_SIZE_LIMIT_STANDARD=52428800  # 50MB standard limit
UPLOAD_SIGNED_URL_EXPIRATION_TIME=60      # 1 minute expiration

# TUS resumable upload protocol
TUS_URL_PATH=/upload/resumable
TUS_URL_EXPIRY_MS=3600000                 # 1 hour
TUS_PART_SIZE=50                          # MB
```

## Authentication Setup

### JWT Configuration Structure

The service requires a complex JWT configuration supporting multiple key types:

```env
# Main JWT configuration with multiple keys
JWT_JWKS='{
  "keys": [
    {
      "kid": "main-rsa-key",
      "kty": "RSA", 
      "alg": "RS256",
      "use": "sig",
      "n": "your-rsa-modulus-here",
      "e": "AQAB"
    },
    {
      "kty": "oct",
      "k": "your-base64-symmetric-key",
      "kid": "storage-url-signing-key",
      "alg": "HS256"
    }
  ],
  "urlSigningKey": {
    "kty": "oct",
    "k": "your-base64-symmetric-key", 
    "kid": "storage-url-signing-key",
    "alg": "HS256"
  }
}'

# PostgREST specific JWT settings
PGRST_JWT_SECRET='{"kid": "main-rsa-key","alg":"RS256","e":"AQAB","key_ops":["verify"],"kty":"RSA","n":"your-rsa-modulus-here"}'
PGRST_JWT_AUD=account
PGRST_JWT_ROLE_CLAIM_KEY=.role
```

### Key Generation

Generate the required keys using these commands:

```bash
# Generate RSA key pair
openssl genrsa -out private_key.pem 2048
openssl rsa -in private_key.pem -pubout -out public_key.pem

# Generate symmetric key for URL signing (base64 encoded)
openssl rand -base64 32
```

## Keycloak Configuration

### Step 1: Create Realm Roles

1. Navigate to your Keycloak admin console
2. Go to **Realm Settings** > **Roles** > **Realm Roles**
3. Create the following roles:

#### Anonymous Role (`anon`)
```
Role Name: anon
Description: Anonymous access role for public operations
Composite: false
```

#### Service Role (`service_role`)  
```
Role Name: service_role
Description: Service account role with administrative privileges
Composite: false
```

### Step 2: Create Keycloak Clients

#### Anonymous Client
1. Go to **Clients** > **Create Client**
2. Configure the client:
   ```
   Client ID: storage-anon-client
   Client Type: OpenID Connect
   Client authentication: OFF (public client)
   ```
3. In **Settings** tab:
   ```
   Access Type: public
   Standard Flow Enabled: true
   Direct Access Grants Enabled: true
   ```
4. In **Roles** tab, assign the `anon` role

#### Service Client
1. Go to **Clients** > **Create Client**  
2. Configure the client:
   ```
   Client ID: storage-service-client
   Client Type: OpenID Connect
   Client authentication: ON (confidential client)
   ```
3. In **Settings** tab:
   ```
   Access Type: confidential
   Service Accounts Enabled: true
   ```
4. In **Service Account Roles** tab, assign the `service_role` role

### Step 3: Generate Long-lived Tokens

#### For Anonymous Access
```bash
# Get anonymous token (shorter-lived, for public operations)
curl -X POST \
  'https://your-keycloak-domain/realms/your-realm/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'client_id=storage-anon-client' \
  -d 'grant_type=client_credentials'
```

#### For Service Account
```bash
# Get service account token (configure for long lifespan)
curl -X POST \
  'https://your-keycloak-domain/realms/your-realm/protocol/openid-connect/token' \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d 'client_id=storage-service-client' \
  -d 'client_secret=your-client-secret' \
  -d 'grant_type=client_credentials'
```

#### Configure Token Lifespan
1. Go to **Realm Settings** > **Tokens**
2. Set appropriate lifespans:
   ```
   Access Token Lifespan: 1 hour (for anon)
   Client Session Max Lifespan: 24 hours (for service)
   ```

Update your environment with the generated tokens:
```env
ANON_KEY=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
SERVICE_KEY=eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Database Configuration

### Step 1: Create Database Roles

Connect to your PostgreSQL database and create the required roles:

```sql
-- Create anonymous role with limited permissions
CREATE ROLE anon;
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon;

-- Create service role with administrative privileges  
CREATE ROLE service_role;
GRANT ALL PRIVILEGES ON DATABASE your_database TO service_role;
GRANT ALL PRIVILEGES ON SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;

-- Create authenticated user role
CREATE ROLE app_user;
GRANT USAGE ON SCHEMA public TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;
```

### Step 2: Configure Role Settings

```env
DB_INSTALL_ROLES=false
DB_ANON_ROLE=anon
DB_SERVICE_ROLE=service_role  
DB_AUTHENTICATED_ROLE=app_user
DB_SUPER_USER=postgres
DB_ALLOW_MIGRATION_REFRESH=true
```

## Storage Backend Setup

### S3 Configuration (Recommended)

```env
STORAGE_BACKEND=s3
STORAGE_S3_BUCKET=your-bucket-name
STORAGE_S3_MAX_SOCKETS=200
STORAGE_S3_ENDPOINT=https://your-s3-endpoint.com
STORAGE_S3_FORCE_PATH_STYLE=true
STORAGE_S3_REGION=us-east-1

# S3 Credentials
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# S3 Protocol for direct access
S3_PROTOCOL_ACCESS_KEY_ID=your-protocol-key
S3_PROTOCOL_ACCESS_KEY_SECRET=your-protocol-secret
```

### File System Backend (Alternative)

```env
STORAGE_BACKEND=file
STORAGE_FILE_BACKEND_PATH=./data
STORAGE_FILE_ETAG_ALGORITHM=md5
```

## Image Transformation

Configure image processing capabilities:

```env
IMAGE_TRANSFORMATION_ENABLED=true
IMAGE_TRANSFORMATION_LIMIT_MIN_SIZE=0
IMAGE_TRANSFORMATION_LIMIT_MAX_SIZE=2000

# ImgProxy settings
IMGPROXY_URL=http://localhost:50020
IMGPROXY_REQUEST_TIMEOUT=15
IMGPROXY_HTTP_MAX_SOCKETS=500

# Rate limiting
RATE_LIMITER_ENABLED=false
RATE_LIMITER_DRIVER=redis
RATE_LIMITER_REDIS_URL=localhost:6379
RATE_LIMITER_RENDER_PATH_MAX_REQ_SEC=5
```

## Multi-Tenancy (Optional)

Enable multi-tenant support if needed:

```env
MULTI_TENANT=true
DATABASE_MULTITENANT_URL=postgresql://postgres:password@127.0.0.1:5433/postgres
REQUEST_X_FORWARDED_HOST_REGEXP=^([a-z]{20}).local.(?:com|dev)$
SERVER_ADMIN_API_KEYS=your-admin-api-key
AUTH_ENCRYPTION_KEY=your-encryption-key
```

## Monitoring and Webhooks

```env
# Monitoring
DEFAULT_METRICS_ENABLED=true
LOG_LEVEL=info

# Webhooks for event notifications
WEBHOOK_URL=https://your-webhook-endpoint.com/storage-events
WEBHOOK_API_KEY=your-webhook-api-key

# Optional: Logflare integration
LOGFLARE_ENABLED=false
LOGFLARE_API_KEY=your-logflare-key
LOGFLARE_SOURCE_TOKEN=your-source-token
```

## Security Considerations

### JWT Security
- **RSA Keys**: Use 2048-bit or higher RSA keys for production
- **Symmetric Keys**: Use cryptographically secure random keys (256-bit minimum)
- **Key Rotation**: Implement regular key rotation policies
- **Key Storage**: Store private keys securely, never commit to version control

### Access Control
- **Principle of Least Privilege**: The `anon` role should have minimal permissions
- **Service Account Security**: Rotate service account credentials regularly
- **Token Expiration**: Set appropriate token lifespans based on security requirements

### Network Security
- **HTTPS Only**: Always use HTTPS in production
- **CORS Configuration**: Restrict CORS origins to specific domains in production
- **Firewall Rules**: Implement proper firewall rules for database and storage access

### Storage Security
- **Bucket Policies**: Configure S3 bucket policies to restrict access
- **Encryption**: Enable encryption at rest and in transit
- **Access Logging**: Enable comprehensive access logging

## Troubleshooting

### Common Issues

1. **JWT Validation Errors**
   - Verify RSA public key format in `PGRST_JWT_SECRET`
   - Ensure `kid` values match between JWT and JWKS configuration
   - Check token expiration and audience claims

2. **Database Connection Issues**
   - Verify database roles exist and have correct permissions
   - Check connection string format and credentials
   - Ensure database accepts connections from the service host

3. **Storage Access Problems**
   - Verify S3 credentials and permissions
   - Check bucket policy and CORS configuration
   - Ensure network connectivity to storage endpoint

4. **Image Transformation Failures**
   - Verify ImgProxy service is running and accessible
   - Check image size limits and supported formats
   - Monitor ImgProxy logs for processing errors

### Validation Commands

Test your configuration with these commands:

```bash
# Test JWT token validation
curl -H "Authorization: Bearer $ANON_KEY" \
     http://localhost:5000/health

# Test database connectivity
curl -H "Authorization: Bearer $SERVICE_KEY" \
     http://localhost:5000/admin/health

# Test storage upload
curl -X POST \
     -H "Authorization: Bearer $SERVICE_KEY" \
     -F "file=@test.jpg" \
     http://localhost:5000/upload
```

## Support

For additional support:
- Check service logs at the configured `LOG_LEVEL`
- Monitor database connections and query performance
- Review storage backend metrics and error rates
- Validate JWT tokens at [jwt.io](https://jwt.io) for debugging