# Encrypted Random Selector – Frontend

This Next.js application provides the user experience for the Encrypted Random Selector MVP. Participants submit
encrypted identifiers, administrators execute an FHE-powered random draw, and the results can be decrypted locally or
through the FHE oracle. The interface is designed as a production-ready baseline inspired by @zama-9 demos.

## Key Features

- 🌈 **RainbowKit Integration** – Rainbow wallet connect button in the header with wallet-connect fallbacks.
- 🔁 **End-to-end flow** – Submit encrypted identities, run the random draw, and decrypt results from a single
  dashboard.
- 📊 **Operational telemetry** – Live status panels for candidate count, selection status, and oracle requests.
- 🎨 **Custom branding** – Tailored favicon, logo, and gradient background to differentiate this system.
- ⚙️ **FHEVM tooling** – Reuses the shared `fhevm/` utilities for decryption signatures and encrypted inputs.

## Prerequisites

- Node.js 20+
- Access to the backend project in `../` (ABI generation and deployments)
- Optional: WalletConnect project id (`NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID`)

## Setup

```bash
cd frontend
npm install

# Sync ABI and addresses from ../deployments
npm run genabi

# Start the application
npm run dev
```

The app is served at [http://localhost:3000](http://localhost:3000).

### Environment Variables

| Variable                               | Purpose                                  | Default                                   |
| -------------------------------------- | ---------------------------------------- | ----------------------------------------- |
| `NEXT_PUBLIC_LOCAL_RPC`                | RPC URL for the local mock chain         | `http://127.0.0.1:8545`                   |
| `NEXT_PUBLIC_SEPOLIA_RPC`              | RPC URL for Sepolia                      | `https://ethereum-sepolia.publicnode.com` |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | Enables WalletConnect/Rainbow connectors | `"demo-project-id"`                       |

Create a `.env.local` file if you need to override these values.

## Workflow

1. Deploy the smart contract (`npx hardhat deploy --network localhost` or Sepolia).
2. Run `npm run genabi` so the ABI/address stubs are generated in `frontend/abi`.
3. `npm run dev` to boot the UI.
4. Connect a wallet via RainbowKit and follow the guided steps on the dashboard:
   - Fill the participant form; a personal validation code is displayed after submission.
   - Trigger a selection from the “Encrypted Selection Console” (owner-only).
   - Decrypt the winner locally or issue an oracle request for auditability.

## Project Structure

```
frontend/
├── abi/                         # auto-generated ABI + address maps
├── app/
│   ├── layout.tsx               # RainbowKit provider + layout wrapper
│   └── page.tsx                 # renders the dashboard component
├── components/
│   ├── EncryptedRandomSelectorDashboard.tsx
│   └── TopNav.tsx
├── fhevm/                       # shared helpers from the SDK template
├── hooks/
│   └── useInMemoryStorage.tsx
└── public/
    ├── ers-logo.svg             # system brand
    └── ...                      # static assets (favicon, images)
```

## Production Build

```bash
npm run build
npm start
```

Ensure you regenerate ABI files (`npm run genabi`) whenever contracts are redeployed.

## License

This frontend inherits the root repository’s BSD-3-Clause-Clear license.
