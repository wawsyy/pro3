"use client";

// React providers for Wagmi, React Query, and application state management
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiConfig, createConfig, http } from "wagmi";
import { hardhat, sepolia } from "wagmi/chains";
import { metaMask } from "wagmi/connectors";
import { InMemoryStorageProvider } from "@/hooks/useInMemoryStorage";

const queryClient = new QueryClient();

const supportedChains = [hardhat, sepolia] as const;

const transports = {
  [hardhat.id]: http(
    process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8545",
  ),
  [sepolia.id]: http(
    process.env.NEXT_PUBLIC_INFURA_SEPOLIA ??
      "https://sepolia.infura.io/v3/b18fb7e6ca7045ac83c41157ab93f990",
  ),
};

const wagmiConfig = createConfig({
  connectors: [metaMask()],
  chains: supportedChains,
  transports,
  ssr: true,
});

type NetworkPreferenceContextValue = {
  selectedChainId: number;
  selectChain: (chainId: number) => void;
};

const NetworkPreferenceContext = createContext<NetworkPreferenceContextValue | undefined>(
  undefined,
);

export const useNetworkPreference = () => {
  const context = useContext(NetworkPreferenceContext);
  if (!context) {
    throw new Error("useNetworkPreference must be used within Providers");
  }
  return context;
};

export function Providers({ children }: { children: ReactNode }) {
  const [selectedChainId, setSelectedChainId] = useState<number>(sepolia.id);

  const networkPreference = useMemo<NetworkPreferenceContextValue>(
    () => ({
      selectedChainId,
      selectChain: setSelectedChainId,
    }),
    [selectedChainId],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <WagmiConfig config={wagmiConfig}>
        <NetworkPreferenceContext.Provider value={networkPreference}>
          <InMemoryStorageProvider>{children}</InMemoryStorageProvider>
        </NetworkPreferenceContext.Provider>
      </WagmiConfig>
    </QueryClientProvider>
  );
}
