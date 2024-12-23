import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";
import * as helpers from "@nomicfoundation/hardhat-network-helpers";
import { Roulette } from "../typechain-types";

// All the test rely on testTriggerCallback method because we can't mock Pyth Entropy provider,
// be sure to uncomment it in the contract before running the tests.
// It is also easier to test here because we are triggering the method so we don't have to set
// up a listener and wait for the provider to send the transaction.
describe("Roulette", function () {
  // We define a fixture to reuse the same setup in every test.
  // We use loadFixture to run this setup once, snapshot that state,
  // and reset Hardhat Network to that snapshot in every test.
  async function deployFixture() {
    // Contracts are deployed using the first signer/account by default
    const [owner, otherUser] = await hre.ethers.getSigners();

    // /!\ Needed to make the fork works
    await helpers.mine();

    const wxtzAddress = '0xB1Ea698633d57705e93b0E40c1077d46CD6A51d8';
    const usdcAddress = '0xa7c9092A5D2C3663B7C5F714dbA806d02d62B58a';
    const wethAddress = '0x8DEF68408Bc96553003094180E5C90d9fe5b88C1';
    const wxtz = await hre.ethers.getContractAt("IERC20", wxtzAddress);
    const usdc = await hre.ethers.getContractAt("IERC20", usdcAddress);
    const weth = await hre.ethers.getContractAt("IERC20", wethAddress);

    const Roulette = await hre.ethers.getContractFactory("Roulette");
    const roulette = await Roulette.deploy(
      '0x23f0e8FAeE7bbb405E7A7C3d60138FCfd43d7509',
      '0x03BCdBc56308c365B4dbADD4d71D0795f3ecCe36',
      wxtzAddress,
      usdcAddress,
      wethAddress
    );

    return { owner, otherUser, roulette, wxtz, usdc, weth };
  }

  describe("Deployment", function () {
    it("Should set the token and oracle", async function () {
      const { roulette, wxtz, usdc, weth } = await loadFixture(deployFixture);

      expect(await roulette.WXTZ()).to.equal(await wxtz.getAddress());
      expect(await roulette.USDC()).to.equal(await usdc.getAddress());
      expect(await roulette.WETH()).to.equal(await weth.getAddress());
      expect(await roulette.entropy()).to.not.equal(hre.ethers.ZeroAddress);
      expect(await roulette.entropyProvider()).to.not.equal(hre.ethers.ZeroAddress);
    });

    it("Should set the owner", async function () {
      const { owner, roulette } = await loadFixture(deployFixture);

      expect(await roulette.owner()).to.equal(owner.address);
    });
  });

  describe("Spin", function () {
    it("Should spin if correct amount paid", async function () {
      const { owner, roulette } = await loadFixture(deployFixture);
      const userRandomNumber = hre.ethers.randomBytes(32);
      const fee = await roulette.getFee();

      await expect(roulette.spin(userRandomNumber, { value: (fee + await roulette.AMOUNT()).toString() }))
        .to.emit(roulette, "Spin")
        .withArgs(owner.address, anyValue, userRandomNumber);
    });

    it("Should revert if no amount paid", async function () {
      const { roulette } = await loadFixture(deployFixture);
      const userRandomNumber = hre.ethers.randomBytes(32);

      await expect(roulette.spin(userRandomNumber, { value: 0 })).to.be.revertedWithCustomError(roulette, "NotRightAmount()");
    });


    describe("Swap after spin", function () {
      // function to create a spin
      const spinRoulette = async (roulette: Roulette) => {
        const userRandomNumber = hre.ethers.randomBytes(32);
        const fee = await roulette.getFee();
        const tx = await roulette.spin(userRandomNumber, { value: (fee + await roulette.AMOUNT()).toString() });
        const receipt = await tx.wait();

        return {
          userRandomNumber,
          fee,
          tx,
          receipt
        }
      }

      it("Should emit swap and swap USDC", async function () {
        const { owner, roulette, usdc } = await loadFixture(deployFixture);
        const { receipt: spinReceipt, } = await spinRoulette(roulette);

        // Access the Spin event and get sequence number
        const spinEvent = spinReceipt?.logs
          .map(log => roulette.interface.parseLog(log))
          .find(log => log?.name === "Spin");

        if (!spinEvent) {
          console.log("Spin event not found in transaction receipt");
          return;
        }

        const spinSequenceNumber = spinEvent.args.sequenceNumber;

        const userUSDCBalanceBefore = await usdc.balanceOf(owner.address);

        // Trigger the callback manually
        const randomNumber = 20;
        const randomNumberBytes = hre.ethers.toBeHex(randomNumber, 32);

        await expect(roulette.testTriggerCallback(spinSequenceNumber, randomNumberBytes))
          .to.emit(roulette, "Swap")
          .withArgs(owner.address, spinSequenceNumber, randomNumber + 1, await usdc.getAddress(), anyValue);

        expect(await usdc.balanceOf(owner.address)).to.be.greaterThan(userUSDCBalanceBefore);
      });

      it("Should emit swap and swap WETH", async function () {
        const { owner, roulette, weth } = await loadFixture(deployFixture);
        const { receipt: spinReceipt, } = await spinRoulette(roulette);

        // Access the Spin event and get sequence number
        const spinEvent = spinReceipt?.logs
          .map(log => roulette.interface.parseLog(log))
          .find(log => log?.name === "Spin");

        if (!spinEvent) {
          console.log("Spin event not found in transaction receipt");
          return;
        }

        const spinSequenceNumber = spinEvent.args.sequenceNumber;

        const userWETHBalanceBefore = await weth.balanceOf(owner.address);

        // Trigger the callback manually
        const randomNumber = 70;
        const randomNumberBytes = hre.ethers.toBeHex(randomNumber, 32);

        await expect(await roulette.testTriggerCallback(spinSequenceNumber, randomNumberBytes))
          .to.emit(roulette, "Swap")
          .withArgs(owner.address, spinSequenceNumber, randomNumber + 1, await weth.getAddress(), anyValue);

        expect(await weth.balanceOf(owner.address)).to.be.greaterThan(userWETHBalanceBefore);
      });

      it("Should emit lost and not affect user's token balances", async function () {
        const { owner, roulette, weth, usdc } = await loadFixture(deployFixture);
        const { receipt: spinReceipt } = await spinRoulette(roulette);

        // Parse Spin event
        const spinEvent = spinReceipt?.logs
          .map(log => roulette.interface.parseLog(log))
          .find(log => log?.name === "Spin");

        if (!spinEvent) {
          console.log("Spin event not found in transaction receipt");
          return;
        }

        const spinSequenceNumber = spinEvent.args.sequenceNumber;

        // Get user balances before the transaction
        const userWETHBalanceBefore = await weth.balanceOf(owner.address);
        const userUSDCBalanceBefore = await usdc.balanceOf(owner.address);
        const userBalanceBefore = await hre.ethers.provider.getBalance(owner.address);

        // Get contract balance before
        const rouletteBalanceBefore = await hre.ethers.provider.getBalance(await roulette.getAddress());

        // Prepare callback with a losing random number (1)
        const randomNumber = 1;
        const randomNumberBytes = hre.ethers.toBeHex(randomNumber, 32);

        // Execute callback and wait for transaction receipt
        const tx = await roulette.testTriggerCallback(spinSequenceNumber, randomNumberBytes);
        const receipt = await tx.wait();

        if (!receipt) {
          console.log("Error: receipt empty");
          return;
        }

        // Calculate gas cost
        const gasUsed = receipt.gasUsed;
        const gasPrice = receipt.gasPrice;
        const gasCost = gasUsed * gasPrice;

        // Expect "Lost" event to be emitted
        await expect(tx)
          .to.emit(roulette, "Lost")
          .withArgs(owner.address, spinSequenceNumber, randomNumber + 1);

        // Re-check balances (WETH and USDC remain unchanged)
        expect(await weth.balanceOf(owner.address)).to.equals(userWETHBalanceBefore);
        expect(await usdc.balanceOf(owner.address)).to.equals(userUSDCBalanceBefore);

        // ETH balance should account for gas cost (but no winnings)
        const userBalanceAfter = await hre.ethers.provider.getBalance(owner.address);
        const expectedBalance = userBalanceBefore - gasCost;

        expect(userBalanceAfter).to.equals(expectedBalance);

        // Check contract balance after
        const rouletteBalanceAfter = await hre.ethers.provider.getBalance(await roulette.getAddress());
        expect(rouletteBalanceAfter).to.equals(rouletteBalanceBefore + await roulette.AMOUNT());
      });


      it("Should emit double win and send back tokens", async function () {
        const { owner, roulette } = await loadFixture(deployFixture);
        const { receipt: spinReceipt } = await spinRoulette(roulette);

        const spinEvent = spinReceipt?.logs
          .map(log => roulette.interface.parseLog(log))
          .find(log => log?.name === "Spin");

        if (!spinEvent) {
          console.log("Spin event not found in transaction receipt");
          return;
        }

        const spinSequenceNumber = spinEvent.args.sequenceNumber;

        // Fund the contract
        await (await owner.sendTransaction({
          to: await roulette.getAddress(),
          value: hre.ethers.parseEther("10"),
        })).wait();

        const randomNumber = 95;
        const randomNumberBytes = hre.ethers.toBeHex(randomNumber, 32);
        const doubleAmount = (await roulette.AMOUNT()) * 2n;

        // Get user balance before transaction
        const userBalanceBefore = await hre.ethers.provider.getBalance(owner.address);

        // Execute the callback and get the transaction
        const tx = await roulette.testTriggerCallback(spinSequenceNumber, randomNumberBytes);
        const receipt = await tx.wait();  // Wait for the transaction to be mined

        if (!receipt) {
          console.log("Error: receipt empty");
          return;
        }

        // Calculate gas cost
        const gasUsed = receipt.gasUsed;
        const gasPrice = receipt.gasPrice;  // Accurate gas price used
        const gasCost = gasUsed * gasPrice;

        // Expect the event to be emitted
        await expect(tx)
          .to.emit(roulette, "DoubleWin")
          .withArgs(owner.address, spinSequenceNumber, randomNumber + 1, doubleAmount);

        // Compute balance after accounting for gas and winnings
        const userBalanceAfter = await hre.ethers.provider.getBalance(owner.address);
        const expectedBalance = userBalanceBefore - gasCost + doubleAmount;

        // Assert the final balance
        expect(userBalanceAfter).to.equals(expectedBalance);
      });
    });
  });
  describe("Withdraw", function () {
    it("Should allow owner to withdraw funds", async function () {
      const { owner, roulette } = await loadFixture(deployFixture);
      const amountDeposited = hre.ethers.parseEther("10");

      // Fund the contract
      await (await owner.sendTransaction({
        to: await roulette.getAddress(),
        value: amountDeposited,
      })).wait();

      const ownerBalanceBefore = await hre.ethers.provider.getBalance(owner.address);

      const tx = await roulette.withdrawFunds();
      const receipt = await tx.wait();  // Wait for the transaction to be mined

      if (!receipt) {
        console.log("Error: receipt empty");
        return;
      }

      // Calculate gas cost
      const gasUsed = receipt.gasUsed;
      const gasPrice = receipt.gasPrice;  // Accurate gas price used
      const gasCost = gasUsed * gasPrice;

      const ownerBalanceAfter = await hre.ethers.provider.getBalance(owner.address);
      const expectedBalance = ownerBalanceBefore - gasCost + amountDeposited;

      expect(ownerBalanceAfter).to.equals(expectedBalance);
    });

    it("Should revert if non owner tries to withdraw funds", async function () {
      const { owner, otherUser, roulette } = await loadFixture(deployFixture);
      const amountDeposited = hre.ethers.parseEther("10");

      // Fund the contract
      await (await owner.sendTransaction({
        to: await roulette.getAddress(),
        value: amountDeposited,
      })).wait();

      await expect(roulette.connect(otherUser).withdrawFunds()).to.be.revertedWithCustomError(roulette, `OwnableUnauthorizedAccount(address)`);

      const rouletteBalanceAfter = await hre.ethers.provider.getBalance(await roulette.getAddress());

      expect(rouletteBalanceAfter).to.equals(amountDeposited);
    });
  });
});
