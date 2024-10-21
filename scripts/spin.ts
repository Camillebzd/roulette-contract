import { ethers, network } from 'hardhat';

async function main() {
  const address = (await import(`../ignition/deployments/chain-${network.config.chainId}/deployed_addresses.json`))['RouletteModule#Roulette'];
  if (!address) {
    console.log("Error: invalid address");
    return;
  }
  const roulette = await ethers.getContractAt("Roulette", address);
  const WXTZ = await ethers.getContractAt("IERC20", network.name === "etherlink" ? '0xc9B53AB2679f573e480d01e0f49e2B5CFB7a3EAb' : '0xB1Ea698633d57705e93b0E40c1077d46CD6A51d8');

  console.log("Roulette:", await roulette.getAddress());

  // allow my WXTZ
  console.log("Allowing roulette to take 10 WXTZ...");
  await (await WXTZ.approve(await roulette.getAddress(), ethers.parseUnits("10", "ether"))).wait();

  const randomNumber = ethers.randomBytes(32);
  const fee = await roulette.getFee();
  console.log('Fees to pay', fee);
  const tx = await roulette.spin(randomNumber, {value: fee.toString()});
  const txReceipt = await tx.wait();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});