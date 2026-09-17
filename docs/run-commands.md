
Frontend (PRD §3.2):


bun run harness --agent frontend --new-sandbox --new-thread
> Add a Counter component with increment/decrement buttons and a count display. Use Tailwind. Don't wire it to a contract yet — just static UI with local state.
Integration (PRD §4.2 — needs a sandbox with deployed Counter from Phase 1 + UI from Phase 3):


bun run harness --agent integration --sandbox <id> --new-thread
> Wire the Counter UI to the deployed Counter contract. Use wagmi and viem. Sepolia only.