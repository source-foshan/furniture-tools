// Public proof record for the official MCP Registry (HTTP domain verification of
// sourcefoshan.com, namespace com.sourcefoshan/*). Only the PUBLIC key is here; the
// private key is in the macOS Keychain (service "sourcefoshan-mcp-registry").
// Served at https://sourcefoshan.com/.well-known/mcp-registry-auth via a Worker
// route on exactly that path, and at the same path on tools.sourcefoshan.com.
export const MCP_REGISTRY_AUTH_PATH = '/.well-known/mcp-registry-auth';
export const MCP_REGISTRY_PROOF = 'v=MCPv1; k=ed25519; p=C4POd5S4PlMwAKZsqamXifIUnKzeIOMN0jh4s85y5sE=';
