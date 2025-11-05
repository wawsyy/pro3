# Encrypted Random Selector

Encrypted Random Selector is a privacy-preserving lottery workflow that lets organisations draw winners from an
encrypted pool without revealing personal data on-chain. The project combines a fully homomorphic smart contract,
automated tasks, comprehensive tests, and a RainbowKit-powered frontend to deliver an end-to-end MVP that mirrors
real-world selection processes.

This project demonstrates advanced FHE (Fully Homomorphic Encryption) capabilities for secure random selection
processes, ensuring participant privacy while maintaining transparency in the selection mechanism.

## Highlights

- 🔐 **Encrypted onboarding** – participants submit identifiers through `EncryptedRandomSelector.sol` and the contract
  persists only ciphertext handles.
- 🎲 **On-chain random draw** – selections are performed inside the FHEVM using encrypted indices, keeping the entire
  lottery confidential.
- 🧾 **Auditable reveal** – results can be decrypted locally by authorised users or asynchronously via the FHE oracle.
- 🖥️ **RainbowKit UX** – the Next.js frontend ships with Rainbow wallet support, Tailwind styling, and a custom brand
  identity (favicon + logo).
- ✅ **Tested & scripted** – Hardhat tasks, local unit tests, and Sepolia smoke tests are provided to validate the flow.

## Repository Layout

```
encrypted-random-selector/
├── contracts/
│   └── EncryptedRandomSelector.sol   # core FHE contract
├── deploy/
│   └── deploy.ts                     # hardhat-deploy script
├── tasks/
│   └── EncryptedRandomSelector.ts    # CLI helpers (submit, select, decrypt)
├── test/
│   ├── EncryptedRandomSelector.ts    # mock-network unit tests
│   └── EncryptedRandomSelectorSepolia.ts # optional live-network script
├── frontend/                         # Next.js RainbowKit interface
└── README.md
```

## Prerequisites

- **Node.js** 20+
- **npm** 8+
- FHEVM credentials (MNEMONIC, INFURA key) if you plan to deploy beyond the local mock network.

## Getting Started

```bash
# Install dependencies
npm install

# Compile contracts and generate typechain bindings
npm run compile

# Execute unit tests (runs on the FHEVM mock environment)
npm test
```

### Environment variables

Set Hardhat secrets once using `hardhat vars`:

```bash
npx hardhat vars set MNEMONIC
npx hardhat vars set INFURA_API_KEY
# Optional: for verification
npx hardhat vars set ETHERSCAN_API_KEY
```

## Deployment & Tasks

```bash
# Start a node (separate shell)
npx hardhat node

# Deploy to the local node
npx hardhat deploy --network localhost

# Useful custom tasks
npx hardhat task:submit-candidate --value 123
npx hardhat task:execute-selection --index 0
npx hardhat task:get-encrypted-winner
npx hardhat task:decrypt-winner
```

For Sepolia, run:

```bash
npx hardhat deploy --network sepolia
npx hardhat test --network sepolia   # executes the smoke script
```

## Frontend Companion

The interface lives in `frontend/`:

```bash
cd frontend
npm install
npm run genabi   # sync ABI & addresses from /deployments
npm run dev      # http://localhost:3000
```

Features include:

- RainbowKit connect button in the header
- Encrypted registration form + status dashboards
- Owner-only selection console
- Local FHE decryption + oracle trigger panel

Environment variables (optional) should be defined with `NEXT_PUBLIC_` prefixes, e.g.:

- `NEXT_PUBLIC_LOCAL_RPC` (defaults to `http://127.0.0.1:8545`)
- `NEXT_PUBLIC_SEPOLIA_RPC`
- `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`

## Testing Strategy

- `test/EncryptedRandomSelector.ts` – end-to-end happy path on the mock FHEVM runtime.
- `test/EncryptedRandomSelectorSepolia.ts` – skipped by default; executes against a live FHEVM network once deployed.
- Frontend relies on manual QA through the integrated dashboards (encrypted counts, decryption flow, rainbow wallet).

## Contributors

This project is collaboratively developed by:

- **UI Developer**: wswsyy (shiyu689@qq.com) - Frontend development and user experience
- **Smart Contract Developer**: wawsyy (shiyu689@qq.com) - Blockchain contracts and cryptography

## License

Distributed under the [BSD-3-Clause-Clear License](LICENSE).

---

Built as a production-ready MVP for privacy-preserving random selection loops.
