/**
 * Hello World Function
 *
 * This is a sample function that demonstrates the basic structure
 * of a function in the Functions Runtime.
 *
 * Endpoint: POST /hello
 * Authentication: JWT required
 */

export default async ({req, user}) => {
  const {name = "world"} = (req.body as any) ?? {};
  return {msg: `Hello, ${name}!`, sub: user?.role};
};
