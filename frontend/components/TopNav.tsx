"use client";

// Top navigation component for Encrypted Random Selector application
import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useAccount, useChainId, useConnect, useDisconnect } from "wagmi";
import { useNetworkPreference } from "@/app/providers";

const HARDHAT_CHAIN_ID = 31337;
const SEPOLIA_CHAIN_ID = 11155111;

type NetworkEntry = {
  id: number;
  label: string;
  badgeVariant: "primary" | "default" | "warning";
};

const NETWORKS: NetworkEntry[] = [
  { id: SEPOLIA_CHAIN_ID, label: "Sepolia", badgeVariant: "primary" },
  { id: HARDHAT_CHAIN_ID, label: "Hardhat", badgeVariant: "warning" },
];

function formatAddress(address?: string | null) {
  if (!address) return "";
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function TopNav() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectAsync, connectors, isLoading, pendingConnector } = useConnect();
  const { disconnect, isLoading: isDisconnecting } = useDisconnect();
  const { selectedChainId, selectChain } = useNetworkPreference();
  const [networkModalOpen, setNetworkModalOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);

  const metaMaskConnector = connectors.find(
    (connector) => connector.id === "metaMask" || connector.name === "MetaMask",
  );

  const handleConnect = async () => {
    if (!metaMaskConnector) {
      console.warn("MetaMask connector not available");
      return;
    }
    try {
      await connectAsync({ connector: metaMaskConnector });
    } catch (error) {
      console.error("Failed to connect MetaMask", error);
    }
  };

  const ensureNetwork = async (targetChainId: number) => {
    if (!window.ethereum) return;
    const chainParams =
      targetChainId === HARDHAT_CHAIN_ID
        ? {
            chainId: "0x7a69",
            chainName: "Hardhat Local",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: ["http://127.0.0.1:8545"],
          }
        : {
            chainId: "0xaa36a7",
            chainName: "Sepolia",
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
            rpcUrls: [
              process.env.NEXT_PUBLIC_INFURA_SEPOLIA ??
                "https://sepolia.infura.io/v3/b18fb7e6ca7045ac83c41157ab93f990",
            ],
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          };

    try {
      setIsSwitching(true);
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: chainParams.chainId }],
      });
    } catch (error: any) {
      if (error?.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [chainParams],
        });
      } else {
        throw error;
      }
    } finally {
      setIsSwitching(false);
    }
  };

  const handleSelectNetwork = async (targetChainId: number) => {
    selectChain(targetChainId);
    setNetworkModalOpen(false);
    if (isConnected) {
      try {
        await ensureNetwork(targetChainId);
      } catch (error) {
        console.error("Failed to switch network", error);
      }
    }
  };

  const activeChainId = chainId ?? selectedChainId;

  return (
    <header className="flex items-center justify-between rounded-2xl border border-slate-700/60 bg-slate-900/60 px-5 py-4 backdrop-blur">
      <Link href="/" className="flex items-center gap-3">
        <Image
          src="/ers-logo.svg"
          alt="Encrypted Random Selector"
          width={180}
          height={40}
          priority
        />
        <span className="hidden text-sm font-semibold uppercase tracking-[0.35em] text-slate-400 md:inline">
          Encrypted Random Selector
        </span>
      </Link>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setNetworkModalOpen(true)}
          className="rounded-full border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-sky-400 hover:text-sky-200"
        >
          Switch Network
        </button>
        {isConnected ? (
          <div className="flex items-center gap-3">
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm font-semibold text-slate-200">
              {formatAddress(address)}
            </span>
            <button
              onClick={() => disconnect()}
              disabled={isDisconnecting}
              className="rounded-full border border-slate-600 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-red-500 hover:text-red-400 disabled:opacity-60"
            >
              {isDisconnecting ? "Disconnecting" : "Disconnect"}
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={!metaMaskConnector || isLoading}
            className="rounded-full bg-sky-500 px-5 py-2 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-slate-600 disabled:text-slate-300"
          >
            {isLoading && pendingConnector?.id === metaMaskConnector?.id
              ? "Connecting..."
              : "Connect MetaMask"}
          </button>
        )}
      </div>

      {networkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-[280px] rounded-3xl bg-slate-900 p-4 shadow-2xl border border-slate-700">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-slate-100 uppercase tracking-wide">
                Switch Networks
              </h2>
              <button
                onClick={() => setNetworkModalOpen(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ×
              </button>
            </div>
            <div className="space-y-2">
              {NETWORKS.map((network) => {
                const isActive = activeChainId === network.id;
                return (
                  <button
                    key={network.id}
                    onClick={() => handleSelectNetwork(network.id)}
                    className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                      isActive
                        ? "bg-violet-600 text-white"
                        : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                    } ${isSwitching ? "opacity-70 cursor-wait" : ""}`}
                    disabled={isSwitching}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{network.label}</span>
                      {isActive && (
                        <span className="flex items-center gap-1 text-xs text-emerald-300">
                          <span className="inline-block h-2 w-2 rounded-full bg-emerald-300" />
                          Connected
                        </span>
                      )}
                      {!isActive && (
                        <span className="text-xs text-slate-400">Switch</span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
      </div>
      )}
    </header>
  );
}

