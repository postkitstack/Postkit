# PostgREST Service

A RESTful API service that automatically generates REST endpoints from your PostgreSQL database schema.

## Overview

PostgREST is a standalone web server that turns your PostgreSQL database directly into a RESTful API. The schema and permissions determine the API endpoints and operations.

## Configuration

### Docker Image
```
postgrest/postgrest:v13.0.0
```

### Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `PGRST_OPENAPI_SERVER_PROXY_URI` | | Base URI for OpenAPI spec (leave empty for auto-detection) |
| `PGRST_OPENAPI_MODE` | `ignore-privileges` | Controls OpenAPI spec generation based on user privileges |
| `PGRST_DB_URI` | | PostgreSQL connection string (format: `postgresql://user:pass@host:port/dbname`) |
| `PGRST_DB_SCHEMA` | `public` | Database schema to expose via API |
| `PGRST_DB_ANON_ROLE` | `anon` | Database role for anonymous requests |
| `PGRST_JWT_SECRET` | JWK from Keycloak | JWT verification key in JWK format |
| `PGRST_JWT_AUD` | `account` | JWT audience claim to verify |
| `PGRST_JWT_ROLE_CLAIM_KEY` | `.role` | JSON path to extract database role from JWT |
| `PGRST_OPENAPI_SPEC_VERSION` | `3.0` | OpenAPI specification version |
| `PGRST_LOG_LEVEL` | `info` | Logging level (error, warn, info, debug) |

### JWT Configuration

The service uses Keycloak-generated JWK (JSON Web Key) for JWT verification:

```json
{
  "kid": "g",
  "alg": "RS256",
  "e": "AQAB",
  "key_ops": ["verify"],
  "kty": "RSA",
  "n": ""
}
```

**Note:** Replace the empty `"n"` value with the actual RSA public key modulus from your Keycloak realm.

## Authentication & Authorization

- **Anonymous Access**: Uses the `anon` database role for unauthenticated requests
- **JWT Authentication**: Validates JWTs issued by Keycloak
- **Role-based Access**: Extracts database role from JWT `.role` claim
- **Database-level Security**: Leverages PostgreSQL's Row Level Security (RLS) and role permissions

## API Endpoints

PostgREST automatically generates REST endpoints based on your database schema:

- `GET /table_name` - List records
- `POST /table_name` - Create record
- `PATCH /table_name?id=eq.1` - Update record
- `DELETE /table_name?id=eq.1` - Delete record
- `GET /rpc/function_name` - Call stored procedure

## Health Check

- **Endpoint**: `GET /`
- **Response**: Returns OpenAPI specification

## Development

### Local Setup

1. Ensure PostgreSQL is running and accessible
2. Set the `PGRST_DB_URI` environment variable
3. Configure the Keycloak JWK in `PGRST_JWT_SECRET`
4. Run the container with proper environment variables

### Testing

Test the API endpoints using curl or your preferred HTTP client:

```bash
# Anonymous request
curl http://localhost:3000/your_table

# Authenticated request
curl -H "Authorization: Bearer <jwt_token>" \
     http://localhost:3000/your_table
```

## Security Considerations

- Always use HTTPS in production
- Implement proper Row Level Security (RLS) policies in PostgreSQL
- Regularly rotate JWT signing keys
- Monitor and log API access
- Use strong database passwords and restrict network access

## Troubleshooting

### Common Issues

1. **Connection refused**: Check `PGRST_DB_URI` and database connectivity
2. **JWT verification failed**: Verify Keycloak JWK configuration
3. **403 Forbidden**: Check database role permissions and RLS policies
4. **Table not found**: Ensure table exists in the specified schema

### Logs

Set `PGRST_LOG_LEVEL=debug` for detailed logging during troubleshooting.

## Resources

- [PostgREST Documentation](https://postgrest.org/en/stable/)
- [PostgreSQL Row Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)
- [Keycloak JWT Documentation](https://www.keycloak.org/docs/latest/server_admin/#_token_exchange)