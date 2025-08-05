# Keycloak Service

Identity and Access Management service providing authentication and authorization for your application stack.

## Overview

Keycloak is an open-source identity and access management solution that provides user federation, strong authentication, user management, fine-grained authorization, and more.

## Configuration

### Docker Image
```
bitnami/keycloak:24.0.4
```

### Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `KEYCLOAK_DATABASE_HOST` | `$(PROJECT_NAME)_db` | Database host for Keycloak |
| `KEYCLOAK_DATABASE_NAME` | `$(PROJECT_NAME)` | Database name |
| `KEYCLOAK_DATABASE_USER` | | Database username |
| `KEYCLOAK_DATABASE_PASSWORD` | | Database password |
| `KEYCLOAK_ADMIN_USER` | `admin` | Initial admin username |
| `KEYCLOAK_ADMIN_PASSWORD` | `a` | Initial admin password |
| `KC_HOSTNAME_STRICT_HTTPS` | `false` | Disable strict HTTPS hostname checking |
| `KC_HOSTNAME` | `$(PRIMARY_DOMAIN)` | Public hostname |
| `KC_HOSTNAME_ADMIN` | `$(PRIMARY_DOMAIN)` | Admin console hostname |
| `PROXY_ADDRESS_FORWARDING` | `true` | Enable proxy address forwarding |
| `KC_HTTP_ENABLED` | `false` | Disable HTTP (HTTPS only) |
| `KC_FEATURES` | `docker,scripts` | Enabled features |
| `KC_PROXY_HEADERS` | `xforwarded` | Proxy headers to trust |
| `KC_DB_SCHEMA` | `auth` | Database schema name |
| `KC_SPI_LOGIN_PROTOCOL_OPENID_CONNECT_LEGACY_LOGOUT_REDIRECT_URI` | `true` | Enable legacy logout redirect |
| `KC_PROXY` | `edge` | Proxy mode configuration |

## Realms

This Keycloak instance manages two realms:

### 1. Master Realm
- **Purpose**: Administrative realm for managing Keycloak itself
- **Users**: Admin users and service accounts
- **Clients**: Admin console and other administrative clients

### 2. Application Realm
- **Purpose**: Main application realm for end users
- **Users**: Application users and service accounts
- **Clients**: Your application services (PostgREST, frontend, etc.)

## Realm Configuration Management

### Keycloak Config CLI

We use the Keycloak Config CLI tool for realm configuration management and migrations.

**Repository**: https://github.com/adorsys/keycloak-config-cli  
**Version**: `adorsys/keycloak-config-cli:6.4.0-24`

### Exporting Realm Configuration

To export existing realm configurations from your current Keycloak instance:

```bash
docker run \
  -e KEYCLOAK_URL="https://test-keyclost.com/" \
  -e KEYCLOAK_USER="a" \
  -e KEYCLOAK_PASSWORD="appriadmin" \
  -e KEYCLOAK_AVAILABILITYCHECK_ENABLED=true \
  -e KEYCLOAK_AVAILABILITYCHECK_TIMEOUT=120s \
  -e IMPORT_FILES_LOCATIONS='/config/*' \
  -v /Users/supunnilakshana/development/appri/all_field_backend/AllFields-Backend/config/keycloak:/config \
  adorsys/keycloak-config-cli:6.4.0-24
```

### Environment Variables for Config CLI

| Variable | Value | Description |
|----------|-------|-------------|
| `KEYCLOAK_URL` | `https://test-keyclost.com/` | Keycloak server URL |
| `KEYCLOAK_USER` | `a` | Admin username |
| `KEYCLOAK_PASSWORD` | `appriadmin` | Admin password |
| `KEYCLOAK_AVAILABILITYCHECK_ENABLED` | `true` | Enable availability check |
| `KEYCLOAK_AVAILABILITYCHECK_TIMEOUT` | `120s` | Timeout for availability check |
| `IMPORT_FILES_LOCATIONS` | `/config/*` | Path to configuration files |

### Migration Process

#### Step 1: Prepare New Keycloak Instance
1. Deploy the new Keycloak instance with the configuration above
2. Ensure the database is properly configured
3. Verify the admin user can access the admin console

#### Step 2: Export Configuration from Existing Instance
```bash
# Export realm configurations
docker run \
  -e KEYCLOAK_URL="https://your-existing-keycloak.com/" \
  -e KEYCLOAK_USER="your-admin-user" \
  -e KEYCLOAK_PASSWORD="your-admin-password" \
  -e KEYCLOAK_AVAILABILITYCHECK_ENABLED=true \
  -e KEYCLOAK_AVAILABILITYCHECK_TIMEOUT=120s \
  -e EXPORT_FILES_LOCATIONS='/config/' \
  -v /path/to/your/config:/config \
  adorsys/keycloak-config-cli:6.4.0-24
```

#### Step 3: Import Configuration to New Instance
```bash
# Import realm configurations
docker run \
  -e KEYCLOAK_URL="https://your-new-keycloak.com/" \
  -e KEYCLOAK_USER="admin" \
  -e KEYCLOAK_PASSWORD="a" \
  -e KEYCLOAK_AVAILABILITYCHECK_ENABLED=true \
  -e KEYCLOAK_AVAILABILITYCHECK_TIMEOUT=120s \
  -e IMPORT_FILES_LOCATIONS='/config/*' \
  -v /path/to/your/config:/config \
  adorsys/keycloak-config-cli:6.4.0-24
```

## Configuration File Structure

Your configuration files should be organized as follows:

```
config/keycloak/
├── master-realm.json
├── application-realm.json
├── clients/
│   ├── postgrest-client.json
│   └── frontend-client.json
└── users/
    ├── service-accounts.json
    └── test-users.json
```

## Development Setup

### Local Development

1. **Start Keycloak**:
   ```bash
   docker-compose up keycloak
   ```

2. **Access Admin Console**:
   - URL: `http://localhost:8080/admin`
   - Username: `admin`
   - Password: `a`

3. **Import Development Configuration**:
   ```bash
   docker run \
     -e KEYCLOAK_URL="http://localhost:8080/" \
     -e KEYCLOAK_USER="admin" \
     -e KEYCLOAK_PASSWORD="a" \
     -e IMPORT_FILES_LOCATIONS='/config/*' \
     -v ./config/keycloak:/config \
     adorsys/keycloak-config-cli:6.4.0-24
   ```

### Production Deployment

1. **Security Considerations**:
   - Change default admin password
   - Use strong database passwords
   - Enable HTTPS
   - Configure proper firewall rules

2. **Database Setup**:
   - Create dedicated database user
   - Set up proper backup procedures
   - Configure connection pooling

## Troubleshooting

### Common Issues

1. **Database Connection Failed**:
   - Check `KEYCLOAK_DATABASE_*` environment variables
   - Verify database is running and accessible
   - Check network connectivity

2. **Admin Console Not Accessible**:
   - Verify `KC_HOSTNAME` and `KC_HOSTNAME_ADMIN` settings
   - Check proxy configuration
   - Ensure proper DNS resolution

3. **Config CLI Import Failed**:
   - Verify Keycloak is fully started
   - Check admin credentials
   - Validate JSON configuration files

4. **JWT Verification Issues**:
   - Ensure realm is properly configured
   - Check client settings
   - Verify JWK endpoint accessibility

### Logs

Monitor Keycloak logs for troubleshooting:
```bash
docker logs keycloak_container_name -f
```

## Security Best Practices

1. **Admin Security**:
   - Use strong admin passwords
   - Enable 2FA for admin accounts
   - Limit admin access to specific IP ranges

2. **Realm Security**:
   - Configure proper client authentication
   - Set appropriate token lifetimes
   - Enable brute force protection

3. **Network Security**:
   - Use HTTPS in production
   - Configure proper CORS settings
   - Implement rate limiting

## Monitoring

### Health Checks

- **Health Endpoint**: `GET /health`
- **Metrics Endpoint**: `GET /metrics`
- **Ready Endpoint**: `GET /health/ready`

### Key Metrics to Monitor

- Active user sessions
- Failed login attempts
- Token generation rate
- Database connection health
- Response times

## Resources

- [Keycloak Documentation](https://www.keycloak.org/documentation)
- [Keycloak Config CLI Documentation](https://github.com/adorsys/keycloak-config-cli)
- [Bitnami Keycloak Docker Hub](https://hub.docker.com/r/bitnami/keycloak)
