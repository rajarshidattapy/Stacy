---
name: reentrancy-prevention
description: Patterns to prevent classic, cross-function, and read-only reentrancy. Covers Checks-Effects-Interactions, OpenZeppelin ReentrancyGuard, transient storage, push vs pull. Use for any function making external calls.
---

# reentrancy-prevention

## When to use

Any function that calls an external contract, transfers ETH, or interacts with an unknown token. Reentrancy is the #1 historical exploit class. Defense is cheap; oversight is expensive.

## Checks-Effects-Interactions (CEI)

The default pattern. Order operations as:

1. **Checks** — validate inputs, permissions, balances.
2. **Effects** — update contract state.
3. **Interactions** — make external calls or transfers.

```solidity
// Bad — withdraw before zeroing balance
function withdraw() external {
    uint256 amount = balances[msg.sender];
    require(amount > 0, "no balance");
    (bool ok,) = msg.sender.call{value: amount}("");
    require(ok);
    balances[msg.sender] = 0;   // attacker re-enters before this line
}

// Good — CEI
function withdraw() external {
    uint256 amount = balances[msg.sender];      // Check
    require(amount > 0, "no balance");
    balances[msg.sender] = 0;                    // Effect (state update)
    (bool ok,) = msg.sender.call{value: amount}(""); // Interaction
    require(ok, "transfer failed");
}
```

CEI alone defeats classic single-function reentrancy.

## OpenZeppelin ReentrancyGuard

Belt-and-suspenders for any function with interactions. One slot, one SSTORE per call:

```solidity
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Vault is ReentrancyGuard {
    function withdraw() external nonReentrant {
        // ... external calls safe even if CEI is wrong
    }
}
```

Cost: ~2.9k gas per call (warm SSTORE). For high-value functions, worth it.

## Transient storage (Solidity 0.8.24+)

EIP-1153 transient storage clears at end of transaction. Cheaper than `nonReentrant`:

```solidity
contract VaultTransient {
    bytes32 constant LOCK_SLOT = keccak256("reentrancy.lock");

    modifier nonReentrant() {
        assembly {
            if tload(LOCK_SLOT) { revert(0, 0) }
            tstore(LOCK_SLOT, 1)
        }
        _;
        assembly { tstore(LOCK_SLOT, 0) }
    }
}
```

OpenZeppelin v5.1+ has `ReentrancyGuardTransient`. ~100 gas vs ~2.9k. Requires Solidity 0.8.24+ AND the chain to support EIP-1153 (mainnet, Sepolia: yes).

## Cross-function reentrancy

Two functions that share state, only one guarded:

```solidity
// Bad — withdraw is guarded, transfer isn't
function withdraw() external nonReentrant { ... balances[msg.sender] = 0; ... }
function transfer(address to, uint256 amt) external {
    balances[msg.sender] -= amt;     // attacker re-enters here from withdraw callback
    balances[to] += amt;
}
```

Fix: guard ALL functions that read or write the shared state, or apply CEI to `transfer` too.

## Read-only reentrancy

A view function reads stale state mid-callback. The exploit happens in the consumer, not the provider:

```solidity
// PoolContract uses CEI for balance updates but its `getPrice()` reads
// `reserves` which was updated AFTER the external transfer.
// A consumer like LendingProtocol calls `pool.getPrice()` inside the
// callback and gets a manipulated price.
```

Defense:
- Apply state updates BEFORE external calls (full CEI).
- Or: protect view functions with a "no-callback-during-write" lock.
- Consumers should treat external view results as unsafe during transactions.

## Push vs pull payments

Pushing ETH is dangerous: recipient can revert (DoS) or re-enter.

```solidity
// Bad — pushes ETH, can be DoS'd by malicious receiver
function distribute() external {
    for (uint i = 0; i < winners.length; i++) {
        (bool ok,) = winners[i].call{value: prize}("");
        require(ok);    // one bad winner halts the loop forever
    }
}

// Good — pull pattern
mapping(address => uint256) pending;
function distribute() external {
    for (uint i = 0; i < winners.length; i++) {
        pending[winners[i]] += prize;
    }
}
function claim() external {
    uint256 amt = pending[msg.sender];
    pending[msg.sender] = 0;
    (bool ok,) = msg.sender.call{value: amt}("");
    require(ok);
}
```

Each user pulls their own; one bad recipient can't block others.

## Gas-limited transfers — avoid

`transfer()` and `send()` forward only 2300 gas. They don't prevent reentrancy in modern EVMs (gas costs changed) AND they fail with smart contract wallets that need more gas. Use `call{value: x}("")` + CEI/`nonReentrant` instead.

## ERC20 token gotchas

ERC777 and rebasing tokens can call back during `transfer`. Treat all external token calls as potential re-entry vectors:

```solidity
function deposit(IERC20 token, uint256 amount) external nonReentrant {
    uint256 before = token.balanceOf(address(this));
    token.transferFrom(msg.sender, address(this), amount);
    uint256 received = token.balanceOf(address(this)) - before;  // handles fee-on-transfer
    balances[msg.sender] += received;
}
```

## Common mistakes

- **Trusting `call` return value alone** — `(bool ok,) = ...; require(ok)`. If `ok` is true, the call succeeded. But the called contract may have re-entered before returning. Always combine with CEI or `nonReentrant`.
- **CEI but reading `address(this).balance` mid-flow** — balance can change unexpectedly. Cache, don't query repeatedly.
- **Single guard on parent, none on internal** — `nonReentrant` doesn't propagate. Each entry point needs its own.
- **Assuming `transfer()` (2300 gas) is safe** — it blocks gas-using receivers, breaking smart wallets. Don't use.
- **Forgetting view functions in the threat model** — read-only reentrancy bit several major protocols (Curve, others). View ≠ safe.
- **Re-entering via fallback in non-payable function** — even functions that don't accept ETH can be re-entered if they call out. Reentrancy is about the call graph, not value transfer.
