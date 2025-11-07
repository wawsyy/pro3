"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useChainId } from "wagmi";
import { ethers } from "ethers";
import { useFhevm } from "@/fhevm/useFhevm";
import { useInMemoryStorage } from "@/hooks/useInMemoryStorage";
import { FhevmDecryptionSignature } from "@/fhevm/FhevmDecryptionSignature";
import { EncryptedRandomSelectorABI } from "@/abi/EncryptedRandomSelectorABI";
import { EncryptedRandomSelectorAddresses } from "@/abi/EncryptedRandomSelectorAddresses";
import { useNetworkPreference } from "@/app/providers";

type ContractInfo = {
  abi: typeof EncryptedRandomSelectorABI.abi;
  address?: `0x${string}`;
  chainId?: number;
  chainName?: string;
};

const DEFAULT_CHAIN_ID = 31337;
const LOCAL_RPC =
  process.env.NEXT_PUBLIC_LOCAL_RPC ?? "http://127.0.0.1:8545";
const SEPOLIA_RPC =
  process.env.NEXT_PUBLIC_SEPOLIA_RPC ??
  "https://ethereum-sepolia.publicnode.com";

const FALLBACK_RPCS: Record<number, string> = {
  [DEFAULT_CHAIN_ID]: LOCAL_RPC,
  11155111: process.env.NEXT_PUBLIC_INFURA_SEPOLIA ?? SEPOLIA_RPC,
};

type StructuredError = {
  code?: string | number;
  message?: string;
  shortMessage?: string;
  data?: unknown;
  error?: StructuredError;
  name?: string;
};

const toStructuredError = (error: unknown): StructuredError => {
  if (typeof error === "object" && error !== null) {
    return error as StructuredError;
  }
  return { message: String(error) };
};

const extractRevertData = (error: StructuredError): string | undefined => {
  const candidates = [error.data, error.error?.data];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      return candidate;
    }
  }
  return undefined;
};

const didUserReject = (error: StructuredError): boolean => {
  const candidates = [error.code, error.error?.code];
  return candidates.some(
    (code) => code === "ACTION_REJECTED" || code === 4001,
  );
};

const resolveMessage = (error: StructuredError): string => {
  const candidates = [
    error.message,
    error.shortMessage,
    error.error?.message,
    error.error?.shortMessage,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.length > 0) {
      return candidate;
    }
  }

  return "";
};

function getContractByChainId(chainId: number | undefined): ContractInfo {
  const abi = EncryptedRandomSelectorABI.abi;
  if (!chainId) {
    return { abi };
  }

  const entry =
    EncryptedRandomSelectorAddresses[
      chainId.toString() as keyof typeof EncryptedRandomSelectorAddresses
    ];

  if (!entry || entry.address === ethers.ZeroAddress) {
    return { abi, chainId, chainName: entry?.chainName };
  }

  return {
    abi,
    address: entry.address as `0x${string}`,
    chainId: entry.chainId ?? chainId,
    chainName: entry.chainName,
  };
}

function deriveParticipantCode(fullName: string, referenceId: string): number {
  const seed = `${fullName.trim().toLowerCase()}|${referenceId
    .trim()
    .toLowerCase()}`;
  const hash = ethers.keccak256(ethers.toUtf8Bytes(seed));
  const code = Number(BigInt(hash) & BigInt(0xffffffff));
  return code === 0 ? 1 : code;
}

export function EncryptedRandomSelectorDashboard() {
  const { address, connector, isConnected } = useAccount();
  const chainId = useChainId();
  const { selectedChainId, selectChain } = useNetworkPreference();

  useEffect(() => {
    if (chainId) {
      selectChain(chainId);
    }
  }, [chainId, selectChain]);

  const effectiveChainId = chainId || selectedChainId || DEFAULT_CHAIN_ID;
  const contractInfo = useMemo(
    () => getContractByChainId(effectiveChainId),
    [effectiveChainId],
  );

  const [provider, setProvider] = useState<ethers.Eip1193Provider>();
  const [signer, setSigner] = useState<ethers.JsonRpcSigner>();
  const [readonlyProvider, setReadonlyProvider] =
    useState<ethers.JsonRpcProvider>();

  const [candidateCount, setCandidateCount] = useState<number>(0);
  const [owner, setOwner] = useState<string>();
  const [hasSelection, setHasSelection] = useState<boolean>(false);
  const [decryptionPending, setDecryptionPending] = useState<boolean>(false);
  const [latestRequestId, setLatestRequestId] = useState<string>("0");
  const [winnerHandle, setWinnerHandle] = useState<string | undefined>();
  const [winnerValue, setWinnerValue] = useState<number | null>(null);
  const [actionMessage, setActionMessage] = useState<string>("");
  const [isLoadingSummary, setIsLoadingSummary] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);
  const [isDecrypting, setIsDecrypting] = useState<boolean>(false);
  const [personalCode, setPersonalCode] = useState<number | null>(null);
  const [selectionIndex, setSelectionIndex] = useState<number>(0);
  const [participantForm, setParticipantForm] = useState({
    fullName: "",
    referenceId: "",
  });

  const { storage: decryptionStorage } = useInMemoryStorage();

  useEffect(() => {
    let active = true;
    const resolveProvider = async () => {
      if (!connector || !isConnected) {
        if (active) {
          setProvider(undefined);
          setSigner(undefined);
        }
        return;
      }
      try {
        const walletProvider = (await connector.getProvider()) as
          | ethers.Eip1193Provider
          | undefined;
        if (active) {
          setProvider(walletProvider);
        }
      } catch (error) {
        console.warn("Failed to resolve wallet provider", error);
        if (active) {
          setProvider(undefined);
        }
      }
    };

    resolveProvider();
    return () => {
      active = false;
    };
  }, [connector, isConnected, chainId]);

  useEffect(() => {
    let disposed = false;

    const setupProviders = async () => {
      const rpcUrl =
        FALLBACK_RPCS[effectiveChainId] ?? FALLBACK_RPCS[DEFAULT_CHAIN_ID];
      const staticProvider = new ethers.JsonRpcProvider(
        rpcUrl,
        effectiveChainId,
      );

      if (provider) {
        try {
          const browserProvider = new ethers.BrowserProvider(provider);
          const network = await browserProvider.getNetwork();
          if (Number(network.chainId) === Number(effectiveChainId)) {
            const resolvedSigner = await browserProvider.getSigner();
            if (!disposed) {
              setSigner(resolvedSigner);
              setReadonlyProvider(staticProvider);
            }
            return;
          }
          console.warn(
            `Wallet is connected to ${network.chainId}, expected ${effectiveChainId}. Using readonly provider instead.`,
          );
        } catch (error) {
          console.warn("Unable to initialize BrowserProvider", error);
        }
      }

      if (!disposed) {
        setReadonlyProvider(staticProvider);
        setSigner(undefined);
      }
    };

    setupProviders();

    return () => {
      disposed = true;
    };
  }, [provider, effectiveChainId]);

  const {
    instance: fhevmInstance,
    status: fhevmStatus,
    error: fhevmError,
  } = useFhevm({
    provider:
      provider && signer
        ? provider
        : FALLBACK_RPCS[effectiveChainId] ?? FALLBACK_RPCS[DEFAULT_CHAIN_ID],
    chainId: effectiveChainId,
    initialMockChains: { [DEFAULT_CHAIN_ID]: LOCAL_RPC },
  });

  const isOwner = useMemo(() => {
    if (!owner || !address) {
      return false;
    }
    return owner.toLowerCase() === address.toLowerCase();
  }, [owner, address]);

  const refreshSummary = useCallback(async () => {
    if (!contractInfo.address || !contractInfo.abi) {
      setCandidateCount(0);
      setOwner(undefined);
      setHasSelection(false);
      setDecryptionPending(false);
      setLatestRequestId("0");
      setActionMessage(
        "Contract is not deployed for the selected network. Please deploy first."
      );
      return;
    }

    try {
      setIsLoadingSummary(true);

      let providerForChecks = readonlyProvider;
      if (!providerForChecks) {
        const fallbackRpc =
          FALLBACK_RPCS[effectiveChainId] ?? FALLBACK_RPCS[DEFAULT_CHAIN_ID];
        providerForChecks = new ethers.JsonRpcProvider(
          fallbackRpc,
          effectiveChainId,
        );
        setReadonlyProvider(providerForChecks);
      }

      const network = await providerForChecks.getNetwork();
      if (Number(network.chainId) !== Number(effectiveChainId)) {
        console.warn(
          `Provider network (${network.chainId}) does not match expected chain (${effectiveChainId}), creating a fallback provider.`,
        );
        const fallbackRpc =
          FALLBACK_RPCS[effectiveChainId] ?? FALLBACK_RPCS[DEFAULT_CHAIN_ID];
        providerForChecks = new ethers.JsonRpcProvider(
          fallbackRpc,
          effectiveChainId,
        );
        setReadonlyProvider(providerForChecks);
        setActionMessage("Network updated. Refreshing data...");
      }

      const readContract = new ethers.Contract(
        contractInfo.address,
        contractInfo.abi,
        providerForChecks,
      );

      let code: string | null = null;
      if (
        "getCode" in providerForChecks &&
        typeof providerForChecks.getCode === "function"
      ) {
        code = await providerForChecks.getCode(contractInfo.address);
      } else if (providerForChecks instanceof ethers.JsonRpcProvider) {
        code = await providerForChecks.getCode(contractInfo.address);
      } else {
        const staticProvider = new ethers.JsonRpcProvider(
          FALLBACK_RPCS[effectiveChainId] ?? FALLBACK_RPCS[DEFAULT_CHAIN_ID],
          effectiveChainId,
        );
        code = await staticProvider.getCode(contractInfo.address);
      }
      if (!code || code === "0x") {
        setActionMessage(
          `Contract not found at ${contractInfo.address}. Make sure it is deployed on the selected network.`
        );
        setCandidateCount(0);
        setOwner(undefined);
        setHasSelection(false);
        setDecryptionPending(false);
        setLatestRequestId("0");
        return;
      }

      const [count, ownerAddress, selectionFlag, pendingFlag, requestId] =
        await Promise.all([
          readContract.candidateCount(),
          readContract.owner(),
          readContract.hasSelection(),
          readContract.decryptionPending(),
          readContract.latestDecryptionRequestId(),
        ]);

      setCandidateCount(Number(count));
      setOwner(ownerAddress);
      setHasSelection(Boolean(selectionFlag));
      setDecryptionPending(Boolean(pendingFlag));
      setLatestRequestId(requestId?.toString() ?? "0");

      if (selectionFlag) {
        try {
          const handleResult = await readContract.getEncryptedWinnerHandle();
          if (typeof handleResult === "string") {
            setWinnerHandle(handleResult);
          } else if (handleResult && "toString" in handleResult) {
            setWinnerHandle(handleResult.toString());
          } else {
            setWinnerHandle(undefined);
          }
        } catch (winnerError) {
          console.warn("Unable to read winner handle", winnerError);
          setWinnerHandle(undefined);
        }
      } else {
        setWinnerHandle(undefined);
      }

      setActionMessage("");
    } catch (unknownError: unknown) {
      const error = toStructuredError(unknownError);
      console.error("Failed to refresh selector summary", error);

      const nestedError = error.error;
      const errorCode = error.code ?? nestedError?.code;
      const messageText =
        (typeof error.message === "string" && error.message) ||
        (typeof nestedError?.message === "string" && nestedError.message) ||
        "";

      // Handle network change error gracefully
      if (
        errorCode === "NETWORK_ERROR" &&
        messageText.toLowerCase().includes("network changed")
      ) {
        console.log("Network change detected, will retry on next refresh");
        setActionMessage("Network is switching, please wait...");
      } else {
        setActionMessage(
          "Unable to read contract state. Confirm the selected network and deployment address are correct.",
        );
      }
    } finally {
      setIsLoadingSummary(false);
    }
  }, [contractInfo.address, contractInfo.abi, readonlyProvider, effectiveChainId]);

  useEffect(() => {
    refreshSummary();
  }, [refreshSummary, contractInfo.address, effectiveChainId]);

  const handleRefresh = useCallback(() => {
    refreshSummary();
  }, [refreshSummary]);

  const handleFormChange = (field: "fullName" | "referenceId", value: string) =>
    setParticipantForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmitCandidate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!contractInfo.address || !fhevmInstance || !signer) {
      setActionMessage(
        "Connect your wallet on a supported network to submit candidates.",
      );
      return;
    }

    if (!participantForm.fullName.trim() || !participantForm.referenceId.trim()) {
      setActionMessage("Full name and reference ID are required.");
      return;
    }

    try {
      setIsSubmitting(true);
      setActionMessage("Encrypting participant code...");

      const code = deriveParticipantCode(
        participantForm.fullName,
        participantForm.referenceId,
      );
      const input = fhevmInstance.createEncryptedInput(
        contractInfo.address,
        signer.address,
      );
      input.add32(code);
      const encrypted = await input.encrypt();

      setActionMessage("Submitting encrypted participant payload...");
      const writableContract = new ethers.Contract(
        contractInfo.address,
        contractInfo.abi,
        signer,
      );
      const tx = await writableContract.submitCandidate(
        encrypted.handles[0],
        encrypted.inputProof,
      );
      await tx.wait();

      setPersonalCode(code);
      setParticipantForm({ fullName: "", referenceId: "" });
      setActionMessage("Participant enrolled successfully.");
      await refreshSummary();
    } catch (unknownError: unknown) {
      const error = toStructuredError(unknownError);
      console.error("Failed to submit candidate", error);
      let friendlyMessage = resolveMessage(error) || String(unknownError);
      const revertData = extractRevertData(error);
      if (didUserReject(error)) {
        friendlyMessage = "Transaction was cancelled in MetaMask.";
      } else if (
        (error.code === "CALL_EXCEPTION" || error.name === "CallException") &&
        typeof revertData === "string" &&
        revertData.toLowerCase().startsWith("0x9fbfc589")
      ) {
        friendlyMessage = "You have already submitted a candidate for this round.";
      }
      setActionMessage(`Failed to submit candidate: ${friendlyMessage}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const generateRandomIndex = () => {
    if (candidateCount === 0) {
      return;
    }
    const random = Math.floor(Math.random() * candidateCount);
    setSelectionIndex(random);
  };

  const handleExecuteSelection = async () => {
    if (!contractInfo.address || !fhevmInstance || !signer) {
      setActionMessage(
        "Connect with the owner wallet to execute the selection.",
      );
      return;
    }
    if (!isOwner) {
      setActionMessage("Only the contract owner can run the selection.");
      return;
    }
    if (candidateCount === 0) {
      setActionMessage("No participants registered yet.");
      return;
    }
    if (selectionIndex < 0 || selectionIndex >= candidateCount) {
      setActionMessage("Selection index must be within the candidate range.");
      return;
    }

    try {
      setIsSelecting(true);
      setActionMessage("Encrypting random index...");
      const input = fhevmInstance.createEncryptedInput(
        contractInfo.address,
        signer.address,
      );
      input.add32(selectionIndex);
      const encrypted = await input.encrypt();

      setActionMessage("Executing encrypted selection...");
      const writableContract = new ethers.Contract(
        contractInfo.address,
        contractInfo.abi,
        signer,
      );
      const tx = await writableContract.executeSelection(
        encrypted.handles[0],
        encrypted.inputProof,
      );
      await tx.wait();

      setActionMessage("Selection completed. Awaiting decryption.");
      await refreshSummary();
    } catch (unknownError: unknown) {
      const error = toStructuredError(unknownError);
      console.error("executeSelection failed", error);
      if (didUserReject(error)) {
        setActionMessage("Selection transaction was cancelled in MetaMask.");
      } else {
        setActionMessage(
          "Failed to execute selection. Review console for diagnostics.",
        );
      }
    } finally {
      setIsSelecting(false);
    }
  };

  const handleRequestWinnerDecryption = async () => {
    if (!contractInfo.address || !signer) {
      setActionMessage("Connect with the owner wallet to request decryption.");
      return;
    }
    if (!isOwner) {
      setActionMessage("Only the owner can request on-chain decryption.");
      return;
    }
    if (!hasSelection) {
      setActionMessage("Run a selection before requesting decryption.");
      return;
    }
    if (decryptionPending) {
      setActionMessage("An oracle request is already pending. Please wait for completion.");
      return;
    }

    try {
      setActionMessage("Requesting oracle decryption...");
      const writableContract = new ethers.Contract(
        contractInfo.address,
        contractInfo.abi,
        signer,
      );
      const tx = await writableContract.requestWinnerDecryption();
      await tx.wait();
      setActionMessage(
        "Decryption request sent. Oracle will fulfill asynchronously.",
      );
      await refreshSummary();
    } catch (unknownError: unknown) {
      const error = toStructuredError(unknownError);
      console.error("requestWinnerDecryption failed", error);
      let friendlyMessage =
        resolveMessage(error) || "Request could not be completed.";
      const revertData = extractRevertData(error);
      if (didUserReject(error)) {
        friendlyMessage = "Request was cancelled in MetaMask.";
      } else if (
        typeof friendlyMessage === "string" &&
        friendlyMessage.includes("Failed to fetch")
      ) {
        friendlyMessage =
          "Network request to the FHE oracle failed. Check your internet connection or RPC endpoint.";
      } else if (
        (error.code === "CALL_EXCEPTION" || error.name === "CallException") &&
        typeof revertData === "string"
      ) {
        const lowered = revertData.toLowerCase();
        if (lowered.startsWith("0xc79aa9e7")) {
          friendlyMessage = "A decryption request is already pending for this round.";
        } else if (lowered.startsWith("0xe5041904")) {
          friendlyMessage = "No candidates registered. Submit participants before requesting decryption.";
        } else if (lowered.startsWith("0x9bbc3a63")) {
          friendlyMessage = "The oracle has not produced a decryptable result yet. Try again later.";
        }
      }
      setActionMessage(`Unable to request decryption: ${friendlyMessage}`);
    }
  };

  const handleDecryptWinner = async () => {
    if (!contractInfo.address || !fhevmInstance || !signer || !winnerHandle) {
      setActionMessage("Selection result not ready for decryption.");
      return;
    }

    try {
      setIsDecrypting(true);
      setActionMessage("Preparing local FHE decryption session...");
      const signature = await FhevmDecryptionSignature.loadOrSign(
        fhevmInstance,
        [contractInfo.address],
        signer,
        decryptionStorage,
      );

      if (!signature) {
        setActionMessage(
          "Unable to obtain FHE decryption signature. Retry authorization.",
        );
        return;
      }

      setActionMessage("Decrypting winner ciphertext locally...");
      const result = await fhevmInstance.userDecrypt(
        [{ handle: winnerHandle, contractAddress: contractInfo.address }],
        signature.privateKey,
        signature.publicKey,
        signature.signature,
        signature.contractAddresses,
        signature.userAddress,
        signature.startTimestamp,
        signature.durationDays,
      );

      const clear = Number(result[winnerHandle]);
      setWinnerValue(clear);
      setActionMessage(
        "Winner identifier decrypted. Share the code with participants to validate.",
      );
    } catch (error) {
      console.error("Local decryption failed", error);
      setActionMessage(
        "Failed to decrypt winner locally. Ensure authorization and try again.",
      );
    } finally {
      setIsDecrypting(false);
    }
  };

  const summaryItems = [
    {
      label: "Registered Candidates",
      value: candidateCount,
      description: "Encrypted identities stored on-chain.",
    },
    {
      label: "Selection Ready",
      value: hasSelection ? "Yes" : "Awaiting",
      description: hasSelection
        ? "A winner ciphertext is stored."
        : "Run a selection to produce a result.",
    },
    {
      label: "Oracle Request",
      value: decryptionPending ? "Pending" : latestRequestId,
      description: decryptionPending
        ? "Awaiting oracle callback."
        : "Most recent request id.",
    },
  ];

  return (
    <div className="flex flex-col gap-8 pb-10">
      <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-8 shadow-xl shadow-slate-950/40">
        <div className="flex flex-col gap-4">
          <span className="inline-flex w-fit items-center gap-2 rounded-full bg-sky-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.4em] text-sky-300">
            Private Lottery Workflow
          </span>
          <h1 className="text-3xl font-semibold leading-tight text-slate-50 md:text-4xl">
            Encrypted Random Selector
          </h1>
          <p className="max-w-2xl text-base text-slate-300">
            Establish a privacy-preserving draw to choose employees or DAO
            members without revealing identities. All participant submissions
            are encrypted end-to-end and selections run entirely within Zama&apos;s
            FHEVM.
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-sm text-slate-300">
            <span className="inline-flex items-center rounded-full border border-slate-700 px-3 py-1">
              • Encrypted onboarding
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-700 px-3 py-1">
              • Random selection under FHE
            </span>
            <span className="inline-flex items-center rounded-full border border-slate-700 px-3 py-1">
              • Controlled decryption
            </span>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <article className="flex flex-col gap-6 rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-slate-100">
              Participant Enrollment
            </h2>
            <button
              onClick={handleRefresh}
              className="rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
            >
              Refresh
            </button>
          </div>

          <form
            onSubmit={handleSubmitCandidate}
            className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5"
          >
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-200">
                Participant name
              </label>
              <input
                type="text"
                value={participantForm.fullName}
                onChange={(event) =>
                  handleFormChange("fullName", event.target.value)
                }
                placeholder="e.g. Jane Doe"
                className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium text-slate-200">
                Internal reference (employee ID, badge, alias)
              </label>
              <input
                type="text"
                value={participantForm.referenceId}
                onChange={(event) =>
                  handleFormChange("referenceId", event.target.value)
                }
                placeholder="e.g. HR-48291"
                className="rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center justify-center rounded-xl bg-sky-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:bg-sky-900 disabled:text-slate-400"
            >
              {isSubmitting ? "Encrypting..." : "Submit Encrypted Profile"}
            </button>
            {personalCode !== null && (
              <p className="rounded-xl border border-slate-700 bg-slate-900/70 px-4 py-3 text-xs text-slate-300">
                Share this private code with the participant to validate when
                the winner is decrypted:{" "}
                <span className="font-semibold text-sky-300">{personalCode}</span>
              </p>
            )}
          </form>
        </article>

        <aside className="flex flex-col gap-4">
          {summaryItems.map((item) => (
            <div
              key={item.label}
              className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4"
            >
              <p className="text-sm font-medium text-slate-400">
                {item.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-50">
                {item.value}
              </p>
              <p className="mt-2 text-xs text-slate-400">{item.description}</p>
            </div>
          ))}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-xs text-slate-400">
            <p>
              Contract address:{" "}
              {contractInfo.address ?? "Not deployed on current chain"}
            </p>
            <p>
              Owner wallet:{" "}
              {owner ?? "—"}
              {isOwner ? " (you)" : ""}
            </p>
            <p>FHEVM status: {fhevmStatus}</p>
            {fhevmError && (
              <p className="mt-1 text-red-300">
                {fhevmError.message ?? String(fhevmError)}
              </p>
            )}
          </div>
        </aside>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
          <h2 className="text-xl font-semibold text-slate-100">
            Encrypted Selection Console
          </h2>
          <p className="text-sm text-slate-400">
            Generate an encrypted index to pick a winner. Only the contract
            owner can trigger this action.
          </p>
          <div className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
              Selection index
            </label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={0}
                value={selectionIndex}
                onChange={(event) =>
                  setSelectionIndex(Number(event.target.value ?? 0))
                }
                className="w-32 rounded-xl border border-slate-700 bg-slate-950/70 px-4 py-2 text-sm text-slate-100 outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
              <button
                type="button"
                onClick={generateRandomIndex}
                className="rounded-xl border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-slate-500 hover:text-white"
              >
                Generate random
              </button>
            </div>
            <button
              type="button"
              disabled={isSelecting}
              onClick={handleExecuteSelection}
              className="flex items-center justify-center rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-emerald-900 disabled:text-slate-400"
            >
              {isSelecting ? "Submitting..." : "Run Encrypted Selection"}
            </button>
            {!isOwner && (
              <p className="text-xs text-slate-500">
                Switch to the owner wallet to enable this action.
              </p>
            )}
          </div>
        </article>

        <article className="flex flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
          <h2 className="text-xl font-semibold text-slate-100">
            Winner Reveal &amp; Audit Trail
          </h2>
          <p className="text-sm text-slate-400">
            Decrypt the stored ciphertext locally or request an oracle callback
            for auditable disclosure.
          </p>
          <div className="grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-5">
            <button
              type="button"
              onClick={handleDecryptWinner}
              disabled={!winnerHandle || isDecrypting}
              className="flex items-center justify-center rounded-xl bg-violet-500 px-5 py-3 text-sm font-semibold text-slate-50 transition hover:bg-violet-400 disabled:cursor-not-allowed disabled:bg-violet-900 disabled:text-slate-400"
            >
              {isDecrypting
                ? "Decrypting..."
                : "Decrypt Winner Locally (FHE)"}
            </button>
            <button
              type="button"
              onClick={handleRequestWinnerDecryption}
              disabled={!hasSelection || decryptionPending || !isOwner || isDecrypting}
              className="flex items-center justify-center rounded-xl border border-slate-700 px-5 py-3 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:border-slate-800 disabled:text-slate-500"
            >
              Request Oracle Decryption
            </button>
            <div className="rounded-xl border border-slate-800 bg-slate-950/70 p-4 text-sm">
              <p className="text-slate-400 flex items-center gap-2">
                Encrypted handle
                <span className="text-xs text-slate-500">
                  {winnerHandle ? "Ready for local decryption" : "Run selection first"}
                </span>
              </p>
              <p className="break-all text-slate-100">
                {winnerHandle ?? "Not available"}
              </p>
              <p className="mt-3 text-slate-400">Decrypted winner code</p>
              <p className="text-2xl font-semibold text-emerald-400">
                {winnerValue !== null ? winnerValue : "—"}
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Participants compare their personal code with the decrypted
                value to confirm the outcome without revealing raw identities.
              </p>
            </div>
          </div>
        </article>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-950/60 p-6">
        <h2 className="text-xl font-semibold text-slate-100">
          Operational Timeline
        </h2>
        <ol className="mt-4 space-y-3 text-sm text-slate-300">
          <li className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            1. Contributors submit their identifiers encrypted with the FHEVM
            client. The contract stores ciphertexts only.
          </li>
          <li className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            2. The contract owner generates an encrypted random index and
            executes the selection fully on-chain.
          </li>
          <li className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            3. The encrypted winner handle is either decrypted locally by
            authorized users or via the FHE oracle for auditability.
          </li>
          <li className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
            4. The decrypted code is shared with participants, who validate the
            outcome against their personal code without exposing identities.
          </li>
        </ol>
      </section>

      <section className="rounded-3xl border border-slate-800 bg-slate-900/50 p-6 text-sm text-slate-300">
        <p className="font-semibold text-slate-100">System status</p>
        <p className="mt-2">
          {isLoadingSummary
            ? "Loading contract state..."
            : actionMessage || "Ready for interactions."}
        </p>
      </section>
    </div>
  );
}

