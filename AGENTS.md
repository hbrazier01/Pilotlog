# CLAUDE.md

This file provides guidance to Claude and other AI coding agents when working with code in this repository.

## Repository Overview

**Night Skills** is a collection of skills for AI agents to build, deploy, and interact with Midnight Network dApps. Skills are packaged instructions and scripts that extend agent capabilities for privacy-preserving blockchain development.

**Maintained by:** [Webisoft Development Labs](https://webisoft.com) - [Utkarsh Varma (@UvRoxx)](https://github.com/UvRoxx)

## About Midnight Network

Midnight is a privacy-first blockchain platform using zero-knowledge proofs:

- **Private Smart Contract State** - Encrypted ledger data
- **Selective Disclosure** - Prove claims without revealing data
- **Shielded Tokens** - Private token transfers
- **Unshielded Tokens** - Public when needed

## Available Skills

### midnight-compact-guide
Complete Compact language reference (v0.19+) for writing privacy-preserving smart contracts.

**Triggers:** "write contract", "Compact syntax", "ZK proof", "ledger state", "circuit function"

**Rules:**
- `privacy-selective-disclosure.md` - ZK disclosure patterns
- `tokens-shielded-unshielded.md` - Token vault patterns
- `common-errors.md` - Error messages and solutions
- `openzeppelin-patterns.md` - Security patterns (Ownable, Pausable, AccessControl)

**Critical Syntax Notes:**
- Pragma: `pragma language_version >= 0.19;`
- Ledger: Individual declarations, NOT block syntax
- Return type: `[]` (empty tuple), NOT `Void`
- Witness: Declaration only, NO body in Compact
- Pure helpers: `pure circuit`, NOT `pure function`
- Enum access: Dot notation (`Choice.rock`), NOT double colon

### midnight-sdk-guide
TypeScript SDK integration guide for Midnight dApps.

**Triggers:** "SDK", "TypeScript", "wallet integration", "connect dApp", "call contract"

**Rules:**
- `wallet-integration.md` - Complete wallet integration patterns

### midnight-infra-setup
Set up and run Midnight infrastructure locally using official dev tools.

**Triggers:** "setup infrastructure", "start node", "run indexer", "proof server"

**Based on:**
- [midnight-infra-dev-tools](https://github.com/midnightntwrk/midnight-infra-dev-tools)
- [midnight-node](https://github.com/midnightntwrk/midnight-node)
- [midnight-indexer](https://github.com/midnightntwrk/midnight-indexer)
- [midnight-ledger](https://github.com/midnightntwrk/midnight-ledger)

### midnight-deploy
Deploy Midnight contracts to local or preview network.

**Triggers:** "deploy contract", "deploy to testnet", "deploy to preview"

### midnight-test-runner
Run and debug Midnight contract tests.

**Triggers:** "run tests", "test contract", "debug test failure"

## Common Compact Syntax (v0.19+)

### Quick Reference

```compact
pragma language_version >= 0.19;

import CompactStandardLibrary;

// Ledger - individual declarations
export ledger counter: Counter;
export ledger owner: Bytes<32>;

// Witness - declaration only
witness local_secret_key(): Bytes<32>;

// Circuit - returns []
export circuit increment(): [] {
  counter.increment(1);
}

// Pure circuit (NOT function)
pure circuit helper(x: Field): Field {
  return x + 1;
}
```

### Common Mistakes

| Wrong | Correct |
|-------|---------|
| `ledger { }` block | `export ledger field: Type;` |
| `Void` return | `[]` return |
| `pure function` | `pure circuit` |
| `Choice::rock` | `Choice.rock` |
| `counter.value()` | `counter.read()` |

## Resources

| Resource | URL |
|----------|-----|
| Midnight Docs | https://docs.midnight.network |
| Compact Guide | https://docs.midnight.network/develop/reference/compact/lang-ref |
| Lace Wallet | https://www.lace.io |
| Faucet | https://faucet.preview.midnight.network |
| midnight-mcp | https://github.com/Olanetsoft/midnight-mcp |
| OpenZeppelin Compact | https://github.com/OpenZeppelin/compact-contracts |

## License

MIT - [Webisoft Development Labs](https://webisoft.com)
