import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { deployments, ethers, fhevm } from "hardhat";

describe("EncryptedRandomSelectorSepolia", function () {
  let signer: HardhatEthersSigner;
  let contractAddress: string;

  before(async function () {
    if (fhevm.isMock) {
      console.warn("EncryptedRandomSelectorSepolia tests require a live FHEVM network (Sepolia)");
      this.skip();
    }

    try {
      const deployment = await deployments.get("EncryptedRandomSelector");
      contractAddress = deployment.address;
    } catch (error) {
      (error as Error).message += ". Deploy with 'npx hardhat deploy --network sepolia'";
      throw error;
    }

    [signer] = await ethers.getSigners();
  });

  it("submits a candidate and observes the count", async function () {
    this.timeout(4 * 60000);

    const contract = await ethers.getContractAt("EncryptedRandomSelector", contractAddress);

    const encryptedPayload = await fhevm.createEncryptedInput(contractAddress, signer.address).add32(777).encrypt();
    const tx = await contract.submitCandidate(encryptedPayload.handles[0], encryptedPayload.inputProof);
    await tx.wait();

    const count = await contract.candidateCount();
    expect(count).to.be.greaterThan(0);
  });
});
