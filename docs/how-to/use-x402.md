# How to Use the x402 Payment Plugin

The `@ch4p/plugin-x402` package adds [x402](https://www.x402.org) HTTP micropayment support to ch4p in two directions:

- **Server-side**: protect gateway endpoints with HTTP 402 Payment Required responses.
- **Client-side**: give the agent an `x402_pay` tool to construct payment headers when it hits a 402 response.

---

## Prerequisites

- ch4p installed and configured
- An EVM-compatible wallet address to receive payments (server) or to make payments (client)
- Optional: an `IIdentityProvider` implementation with a bound wallet for live signing

---

## Server-Side: Protect Gateway Endpoints

Add an `x402` section to `~/.ch4p/config.json`:

```json
{
  "x402": {
    "enabled": true,
    "server": {
      "payTo": "0xYourWalletAddress",
      "amount": "1000000",
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "network": "base",
      "description": "Payment required to access this gateway.",
      "protectedPaths": ["/sessions", "/sessions/*", "/webhooks/*"],
      "maxTimeoutSeconds": 300
    }
  }
}
```

Start the gateway:

```bash
ch4p gateway
```

The gateway banner will show `x402: enabled (base)`.

Any request to a protected path without a valid `X-PAYMENT` header receives:

```
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "x402Version": 1,
  "error": "X402",
  "accepts": [
    {
      "scheme": "exact",
      "network": "base",
      "maxAmountRequired": "1000000",
      "resource": "/sessions",
      "description": "Payment required to access this gateway.",
      "mimeType": "application/json",
      "payTo": "0xYourWalletAddress",
      "maxTimeoutSeconds": 300,
      "asset": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      "extra": {}
    }
  ]
}
```

A valid `X-PAYMENT` header bypasses pairing auth — payment serves as the authentication credential.

### On-Chain Verification

By default, the gateway accepts any structurally valid `X-PAYMENT` header. For production deployments, add a `verifyPayment` callback in code:

```typescript
import { createX402Middleware } from '@ch4p/plugin-x402';

const middleware = createX402Middleware({
  enabled: true,
  server: {
    payTo: '0xYourWallet',
    amount: '1000000',
    verifyPayment: async (payment, requirements) => {
      // Call your on-chain ERC-20 transferWithAuthorization verifier here.
      // Return true to allow, false to reject.
      return myOnChainVerifier.verify(payment, requirements);
    },
  },
});
```

---

## Client-Side: Agent Pays for Resources

When `x402.enabled` is true, the `x402_pay` tool is automatically registered for all gateway agent sessions.

If the agent calls a resource that returns 402, it can use this tool:

```
Tool: x402_pay
Args:
  url: "https://some-paid-api.com/data"
  x402_response: "{\"x402Version\":1,\"error\":\"X402\",\"accepts\":[...]}"
  wallet_address: "0xYourPayerWallet"
```

The tool returns:

```
Resource:  https://some-paid-api.com/data
Network:   base
Amount:    1000000 (asset 0x833589...)
Pay to:    0xRecipient
From:      0xYourPayerWallet

X-PAYMENT header value (add to your retry request):
eyJ4NDAyVmVyc2lvbi...

WARNING: Placeholder signature — cannot be used for real on-chain payments.
Configure an IIdentityProvider with a bound wallet to enable live signing.
```

The agent includes the `X-PAYMENT` value in the retry request header.

### Live Signing

To enable real on-chain payments, inject an `x402Signer` via `toolContextExtensions`:

```typescript
toolContextExtensions: {
  agentWalletAddress: '0xYourWallet',
  x402Signer: async (authorization) => {
    // Sign the EIP-3009 transferWithAuthorization struct.
    return myWallet.signTypedData(authorization);
  },
}
```

This is typically wired up by an `IIdentityProvider` implementation (e.g., plugin-erc8004).

---

## Configuration Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `x402.enabled` | boolean | `false` | Enable the x402 plugin |
| `x402.server.payTo` | string | — | Wallet address receiving payments |
| `x402.server.amount` | string | — | Amount in smallest unit (e.g. `"1000000"` = 1 USDC) |
| `x402.server.asset` | string | USDC on Base | ERC-20 token contract address |
| `x402.server.network` | string | `"base"` | Network identifier |
| `x402.server.description` | string | auto | Human-readable 402 message |
| `x402.server.protectedPaths` | string[] | `["/*"]` | Paths to protect. Supports `"/*"` wildcard suffix |
| `x402.server.maxTimeoutSeconds` | number | `300` | Payment authorization TTL |

---

## Protocol Notes

- `x402` uses the **exact** scheme: pay exactly `amount` of `asset` to `payTo`.
- Payments use **EIP-3009** (`transferWithAuthorization`) on the specified ERC-20 token.
- The `X-PAYMENT` header is a base64-encoded JSON object containing an EIP-712 signature and authorization struct.
- System paths (`/health`, `/.well-known/agent.json`, `/pair`) are always exempt from payment gating.
