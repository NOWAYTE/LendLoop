// Convex accepts JWTs issued by Clerk using the JWT template named "convex".
// CLERK_JWT_ISSUER_DOMAIN is set on the Convex deployment (npx convex env set ...),
// e.g. https://your-app.clerk.accounts.dev
const authConfig = {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
};

export default authConfig;
