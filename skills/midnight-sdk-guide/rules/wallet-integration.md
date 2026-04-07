# Wallet Integration Patterns

For production DApp development on Midnight, use the **1AM Wallet** integration.

See the dedicated skill: `1am-wallet-integration` for complete documentation including:
- Wallet detection and connection
- Provider setup (ConnectedAPI → MidnightProviders)
- Transaction flow (deploy, call, submit)
- 1AM ProofStation (hosted ZK proving)
- Common mistakes and fixes
- Network configuration

## Quick Reference

```typescript
// Detect 1AM Wallet
if (window.midnight?.['1AM']) {
  const connectedAPI = await window.midnight['1AM'].enable();
  const config = await connectedAPI.getConfiguration();
  const addresses = await connectedAPI.getShieldedAddresses();
}
```

Install: [1am.xyz/install-beta](https://1am.xyz/install-beta)

Reference implementation: [github.com/webisoftSoftware/zk-mint](https://github.com/webisoftSoftware/zk-mint)
