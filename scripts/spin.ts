import { ethers, network } from 'hardhat';

async function main() {
  const address = (await import(`../ignition/deployments/chain-${network.config.chainId}/deployed_addresses.json`))['RouletteModule#Roulette'];
  if (!address) {
    console.log("Error: invalid address");
    return;
  }
  const roulette = await ethers.getContractAt("Roulette", address);
  console.log("Roulette:", await roulette.getAddress());

  const randomNumber = ethers.randomBytes(32);
  const fee = await roulette.getFee();
  console.log('Fees to pay:', fee);
  console.log('Spinning the roulette...');

  const tx = await roulette.spin(randomNumber, { value: (fee + ethers.parseEther('10')).toString() });
  const receipt = await tx.wait();

  // Access the Spin event and get sequence number
  const spinEvent = receipt?.logs
    .map(log => roulette.interface.parseLog(log))
    .find(log => log?.name === "Spin");

  if (!spinEvent) {
    console.log("Spin event not found in transaction receipt");
    return;
  }

  const spinSequenceNumber = spinEvent.args.sequenceNumber;
  console.log("Spin event detected:");
  console.log("User:", spinEvent.args.user);
  console.log("Sequence Number:", spinSequenceNumber.toString());
  console.log("User's random number:", spinEvent.args.userRandomNumber);

  // Promise to wait for Swap event with correct sequence number
  console.log("Waiting for Swap event...");

  const swapEventPromise = new Promise((resolve, reject) => {
    let swapContractEvent = roulette.getEvent("Swap");
    const timeout = setTimeout(() => {
      roulette.off(swapContractEvent); // Remove listener if timed out
      reject(new Error("Swap event not received within timeout"));
    }, 2 * 60 * 1000); // 2 minutes

    // Listen for the Swap event with the correct filter
    roulette.on(swapContractEvent, (user, swapSequenceNumber, finalNumber, tokenOut, amountOut) => {
      if (spinSequenceNumber == swapSequenceNumber) {
        clearTimeout(timeout); // Clear timeout once the event is received
        roulette.off(swapContractEvent);  // Clean up all listeners after resolving
        console.log("Swap event detected with matching sequence number:");
        console.log("User:", user);
        console.log("Swap sequence number:", swapSequenceNumber.toString());
        console.log("Final number:", finalNumber);
        console.log("Token out address:", tokenOut);
        console.log("Amount out:", amountOut);
        resolve({ user, swapSequenceNumber, finalNumber, tokenOut, amountOut });  // Resolve the promise with event args
      } else {
        console.log("Received Swap event with non-matching sequence number:", swapSequenceNumber.toString());
      }
    });
  });

  try {
    const swapEvent = await swapEventPromise;
    console.log("Swap event received:", swapEvent);
  } catch (error: any) {
    console.error("Error:", error.message);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});