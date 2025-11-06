import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Deployment script for Encrypted Random Selector contract
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedSelector = await deploy("EncryptedRandomSelector", {
    from: deployer,
    log: true,
    // Enable contract verification for public networks
    autoMine: true,
  });

  console.log(`EncryptedRandomSelector contract deployed at: ${deployedSelector.address}`);
  console.log(`Deployment transaction: ${deployedSelector.transactionHash}`);

  // Verify contract on Etherscan for public networks
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    try {
      await hre.run("verify:verify", {
        address: deployedSelector.address,
        constructorArguments: [],
      });
      console.log("Contract verification completed successfully");
    } catch (error) {
      console.log("Contract verification failed:", error);
    }
  }
};
export default func;
func.id = "deploy_encrypted_random_selector"; // id required to prevent reexecution
func.tags = ["EncryptedRandomSelector"];
