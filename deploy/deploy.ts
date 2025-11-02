import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

// Deployment script for Encrypted Random Selector contract
const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedSelector = await deploy("EncryptedRandomSelector", {
    from: deployer,
    log: true,
  });

  console.log(`EncryptedRandomSelector contract: `, deployedSelector.address);
};
export default func;
func.id = "deploy_encrypted_random_selector"; // id required to prevent reexecution
func.tags = ["EncryptedRandomSelector"];
