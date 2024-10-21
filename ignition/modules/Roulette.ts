// This setup uses Hardhat Ignition to manage smart contract deployments.
// Learn more about it at https://hardhat.org/ignition

import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";
import { network } from "hardhat";

const RouletteModule = buildModule("RouletteModule", (m) => {
  const Entropy = "0x23f0e8FAeE7bbb405E7A7C3d60138FCfd43d7509";
  const SwapRouter = network.name === "etherlink" ? "0xE67B7D039b78DE25367EF5E69596075Bbd852BA9": "0x03BCdBc56308c365B4dbADD4d71D0795f3ecCe36";
  const WXTZ = network.name === "etherlink" ? "0xc9B53AB2679f573e480d01e0f49e2B5CFB7a3EAb" : "0xB1Ea698633d57705e93b0E40c1077d46CD6A51d8";
  const USDC = network.name === "etherlink" ? "0x796Ea11Fa2dD751eD01b53C372fFDB4AAa8f00F9" : "0xa7c9092A5D2C3663B7C5F714dbA806d02d62B58a";
  const WETH = network.name === "etherlink" ? "0xfc24f770F94edBca6D6f885E12d4317320BcB401" : "0x8DEF68408Bc96553003094180E5C90d9fe5b88C1";

  const roulette = m.contract("Roulette", [Entropy, SwapRouter, WXTZ, USDC, WETH]);

  return { roulette };
});

export default RouletteModule;
