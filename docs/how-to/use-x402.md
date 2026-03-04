# How to Use the x402 Payment Plugin

The `@ch4p/plugin-x402` package adds [x402](https://www.x402.org) HTTP micropayment support to ch4p in two directions:

- **Server-side**: protect gateway endpoints with HTTP 402 Payment Required responses.
- **Client-side**: give the agent an `x402_pay` tool to construct payment headers when it hits a 402 response.

---

## Prerequisites

- ch4p installed and configured
- An EVM-compatible wallet address to receive payments (server) or to make payments (client)
- A private key for the paying wallet (client-side signing)

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

The simplest way to enable client-side payments is with a private key in your config. This is the recommended integration path until the `@ch4p/plugin-erc8004` identity provider plugin is complete.

### Quick Setup

1. Add the `client` section to `~/.ch4p/config.json`:

```json
{
  "x402": {
    "enabled": true,
    "client": {
      "privateKey": "${X402_PRIVATE_KEY}"
    }
  }
}
```

2. Set your private key in `~/.ch4p/.env`:

```
X402_PRIVATE_KEY=0x<your-64-char-hex-private-key>
```

That's it. The gateway derives your wallet address from the key automatically and injects an EIP-712 signer into the agent runtime.

### How It Works

When the agent encounters an HTTP 402 response, two payment paths are available:

**Automatic (`web_fetch`)** — When `web_fetch` runs on the main thread and hits a 402, it signs an EIP-3009 `transferWithAuthorization`, attaches the `X-PAYMENT` header, and retries the request transparently. No model intervention required.

**Manual (`x402_pay` tool)** — When `web_fetch` runs in a worker thread (the signer can't cross thread boundaries), the agent falls back to calling `x402_pay` explicitly:

```
Tool: x402_pay
Args:
  url: "https://some-paid-api.com/data"
  x402_response: "{\"x402Version\":1,\"error\":\"X402\",\"accepts\":[...]}"
```

The tool signs the payment and returns the `X-PAYMENT` header value. The agent retries with the header attached. Both paths are transparent to the end user.

### Client Configuration Options

| Field | Default | Description |
|-------|---------|-------------|
| `client.privateKey` | — | 0x-prefixed private key. Use env-var substitution: `"${X402_PRIVATE_KEY}"`. Never commit a real key. |
| `client.chainId` | `8453` | EIP-712 domain chain ID. Use `84532` for Base Sepolia testnet. |
| `client.tokenAddress` | USDC on Base | ERC-20 contract for the EIP-712 domain. |
| `client.tokenName` | `"USD Coin"` | Token name for the EIP-712 domain separator. |
| `client.tokenVersion` | `"2"` | Token version for the EIP-712 domain separator. |

### Future: Identity Provider Signing

The `@ch4p/plugin-erc8004` plugin (planned) will provide wallet UI integration and identity-bound signing as an alternative to raw private keys. Until then, the `client.privateKey` approach above is the simplest path to live on-chain payments.

---

## Configuration Reference

See [Configuration — x402](../reference/configuration.md#x402) for the full field reference covering both server and client options.

---

## Protocol Notes

- `x402` uses the **exact** scheme: pay exactly `amount` of `asset` to `payTo`.
- Payments use **EIP-3009** (`transferWithAuthorization`) on the specified ERC-20 token.
- The `X-PAYMENT` header is a base64-encoded JSON object containing an EIP-712 signature and authorization struct.
- System paths (`/health`, `/.well-known/agent.json`, `/pair`) are always exempt from payment gating.
