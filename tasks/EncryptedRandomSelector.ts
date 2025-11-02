// Hardhat tasks for interacting with Encrypted Random Selector contract
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";
import { FhevmType } from "@fhevm/hardhat-plugin";

const CONTRACT_NAME = "EncryptedRandomSelector";

task("task:address", `Prints the ${CONTRACT_NAME} deployment address`).setAction(async (_args: TaskArguments, hre) => {
  const deployment = await hre.deployments.get(CONTRACT_NAME);
  console.log(`${CONTRACT_NAME} address is ${deployment.address}`);
});

task("task:candidate-count", "Reads the current candidate count")
  .addOptionalParam("address", "Optional contract address override")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments } = hre;

    const deployment = args.address ? { address: args.address } : await deployments.get(CONTRACT_NAME);
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const count = await contract.candidateCount();
    console.log(`Registered candidates: ${count}`);
  });

task("task:submit-candidate", "Encrypt and submit a candidate identifier")
  .addParam("value", "Numeric identifier for the participant (will be encrypted client-side)")
  .addOptionalParam("address", "Optional contract address override")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;
    const value = parseInt(args.value);
    if (!Number.isInteger(value)) {
      throw new Error("value must be an integer");
    }

    await fhevm.initializeCLIApi();

    const deployment = args.address ? { address: args.address } : await deployments.get(CONTRACT_NAME);
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const encrypted = await fhevm.createEncryptedInput(deployment.address, signer.address).add32(value).encrypt();

    const tx = await contract.submitCandidate(encrypted.handles[0], encrypted.inputProof);
    console.log(`Submit candidate tx: ${tx.hash}`);

    const receipt = await tx.wait();
    console.log(`Status: ${receipt?.status}`);
  });

task("task:execute-selection", "Owner-only: run encrypted random selection")
  .addParam("index", "Random index to select (integer within candidate count)")
  .addOptionalParam("address", "Optional contract address override")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;
    const index = parseInt(args.index);
    if (!Number.isInteger(index)) {
      throw new Error("index must be an integer");
    }

    await fhevm.initializeCLIApi();

    const deployment = args.address ? { address: args.address } : await deployments.get(CONTRACT_NAME);
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const encrypted = await fhevm.createEncryptedInput(deployment.address, signer.address).add32(index).encrypt();

    const tx = await contract.executeSelection(encrypted.handles[0], encrypted.inputProof);
    console.log(`Execute selection tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`Status: ${receipt?.status}`);
  });

task("task:get-encrypted-winner", "Reads the encrypted winner handle")
  .addOptionalParam("address", "Optional contract address override")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments } = hre;
    const deployment = args.address ? { address: args.address } : await deployments.get(CONTRACT_NAME);
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const winnerHandle = await contract.getEncryptedWinnerHandle();
    console.log(`Winner ciphertext: ${winnerHandle}`);
  });

task("task:decrypt-winner", "Owner-only: request decryption and locally decrypt the latest winner")
  .addOptionalParam("address", "Optional contract address override")
  .setAction(async (args: TaskArguments, hre) => {
    const { ethers, deployments, fhevm } = hre;
    await fhevm.initializeCLIApi();

    const deployment = args.address ? { address: args.address } : await deployments.get(CONTRACT_NAME);
    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt(CONTRACT_NAME, deployment.address);

    const tx = await contract.requestWinnerDecryption();
    console.log(`Decryption request tx: ${tx.hash}`);
    await tx.wait();

    const encryptedWinner = await contract.getEncryptedWinner();
    const decrypted = await fhevm.userDecryptEuint(FhevmType.euint32, encryptedWinner, deployment.address, signer);

    console.log(`Decrypted winner identifier: ${decrypted}`);
  });
