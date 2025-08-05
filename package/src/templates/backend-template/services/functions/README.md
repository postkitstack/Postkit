# Functions Runtime

This directory contains serverless-style functions that are automatically exposed as HTTP endpoints by the Functions Runtime service.

## How it Works

Each JavaScript or TypeScript file in this directory becomes a POST endpoint:

- `hello.js` → `POST /hello`
- `user-profile.ts` → `POST /user-profile`
- `my-function.js` → `POST /my-function`

## Function Structure

### JavaScript Function
```javascript
module.exports = async (req, res) => {
  const { body, user, headers } = req;
  
  // Your function logic here
  
  res.status(200).json({
    success: true,
    data: result
  });
};
```

### TypeScript Function
```typescript
interface FunctionRequest {
  body: any;
  user: UserClaims;
  headers: Record<string, string>;
}

interface FunctionResponse {
  status: (code: number) => FunctionResponse;
  json: (data: any) => void;
}

module.exports = async (req: FunctionRequest, res: FunctionResponse) => {
  // Your typed function logic here
};
```

## Authentication

All functions automatically receive JWT authentication through Keycloak:

- `req.user` contains the decoded JWT payload
- Functions are only called if JWT is valid
- User claims include: `sub`, `preferred_username`, `email`, `name`, `realm_access.roles`

## Request Object

The `req` object contains:
- `body` - Parsed JSON request body
- `user` - Decoded JWT user claims
- `headers` - Request headers

## Response Object

The `res` object provides:
- `status(code)` - Set HTTP status code
- `json(data)` - Send JSON response

## Environment Variables

Available in functions:
- `NODE_ENV` - Environment mode
- `JWT_ISSUER` - Keycloak realm issuer
- `JWKS_URL` - Keycloak JWKS endpoint

## Development

1. Create your function file in this directory
2. Restart the functions service: `pgkit restart functions`
3. Test your endpoint: `POST http://functions.localhost/your-function`

## Example cURL Request

```bash
# Get JWT token from Keycloak first
TOKEN="your-jwt-token"

# Call function
curl -X POST http://functions.localhost/hello \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "World", "message": "Hello from client!"}'
```

## Dependencies

To add npm dependencies for your functions:

1. Create a `package.json` in this directory
2. Add your dependencies
3. Functions Runtime will automatically install them
4. Import them in your functions as normal

Example `package.json`:
```json
{
  "name": "{{projectName}}-functions",
  "version": "1.0.0",
  "dependencies": {
    "axios": "^1.0.0",
    "lodash": "^4.17.21"
  }
}
```