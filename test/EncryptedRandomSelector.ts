import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { EncryptedRandomSelector, EncryptedRandomSelector__factory } from "../types";
import { FhevmType } from "@fhevm/hardhat-plugin";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function encrypt32(contractAddress: string, signer: HardhatEthersSigner, value: number) {
  return fhevm.createEncryptedInput(contractAddress, signer.address).add32(value).encrypt();
}

async function deployFixture() {
  const factory = (await ethers.getContractFactory("EncryptedRandomSelector")) as EncryptedRandomSelector__factory;
  const contract = (await factory.deploy()) as EncryptedRandomSelector;
  const address = await contract.getAddress();
  return { contract, address };
}

describe("EncryptedRandomSelector", function () {
  // Test suite for Encrypted Random Selector contract functionality
  let signers: Signers;
  let contract: EncryptedRandomSelector;
  let contractAddress: string;

  before(async function () {
    const [deployer, alice, bob] = await ethers.getSigners();
    signers = {
      deployer,
      alice,
      bob,
    };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn("EncryptedRandomSelector unit tests require the FHEVM mock environment");
      this.skip();
    }

    ({ contract, address: contractAddress } = await deployFixture());
  });

  it("allows participants to submit multiple encrypted identifiers", async function () {
    expect(await contract.candidateCount()).to.equal(0);

    const firstPayload = await encrypt32(contractAddress, signers.alice, 101);
    await expect(contract.connect(signers.alice).submitCandidate(firstPayload.handles[0], firstPayload.inputProof))
      .to.emit(contract, "CandidateSubmitted")
      .withArgs(signers.alice.address, 0);

    const secondPayload = await encrypt32(contractAddress, signers.alice, 202);
    await expect(contract.connect(signers.alice).submitCandidate(secondPayload.handles[0], secondPayload.inputProof))
      .to.emit(contract, "CandidateSubmitted")
      .withArgs(signers.alice.address, 1);

    expect(await contract.candidateCount()).to.equal(2);
    expect(await contract.submissionsByAddress(signers.alice.address)).to.equal(2);
  });

  it("selects the encrypted candidate matching the supplied index", async function () {
    const encryptedAlice = await encrypt32(contractAddress, signers.alice, 111);
    await contract.connect(signers.alice).submitCandidate(encryptedAlice.handles[0], encryptedAlice.inputProof);

    const encryptedBob = await encrypt32(contractAddress, signers.bob, 222);
    await contract.connect(signers.bob).submitCandidate(encryptedBob.handles[0], encryptedBob.inputProof);

    await expect(contract.getEncryptedWinner()).to.be.revertedWithCustomError(contract, "DecryptionNotReady");

    const randomIndex = await encrypt32(contractAddress, signers.deployer, 1);
    await expect(
      contract.connect(signers.deployer).executeSelection(randomIndex.handles[0], randomIndex.inputProof),
    ).to.emit(contract, "SelectionExecuted");

    const encryptedWinner = await contract.getEncryptedWinner();
    const clearWinner = await fhevm.userDecryptEuint(
      FhevmType.euint32,
      encryptedWinner,
      contractAddress,
      signers.deployer,
    );

    expect(clearWinner).to.equal(222);

    const ciphertextHandle = await contract.getEncryptedWinnerHandle();
    expect(ciphertextHandle).to.not.equal(ethers.ZeroHash);
  });

  it("resets submissions for subsequent rounds", async function () {
    const encryptedAlice = await encrypt32(contractAddress, signers.alice, 45);
    await contract.connect(signers.alice).submitCandidate(encryptedAlice.handles[0], encryptedAlice.inputProof);

    const encryptedBob = await encrypt32(contractAddress, signers.bob, 46);
    await contract.connect(signers.bob).submitCandidate(encryptedBob.handles[0], encryptedBob.inputProof);

    const randomIndex = await encrypt32(contractAddress, signers.deployer, 0);
    await contract.connect(signers.deployer).executeSelection(randomIndex.handles[0], randomIndex.inputProof);

    await contract.connect(signers.deployer).resetRound();
    expect(await contract.candidateCount()).to.equal(0);
    expect(await contract.submissionsByAddress(signers.alice.address)).to.equal(0);
    expect(await contract.submissionsByAddress(signers.bob.address)).to.equal(0);

    const encryptedBobNewRound = await encrypt32(contractAddress, signers.bob, 88);
    await expect(
      contract.connect(signers.bob).submitCandidate(encryptedBobNewRound.handles[0], encryptedBobNewRound.inputProof),
    )
      .to.emit(contract, "CandidateSubmitted")
      .withArgs(signers.bob.address, 0);

    expect(await contract.candidateCount()).to.equal(1);
  });
});
