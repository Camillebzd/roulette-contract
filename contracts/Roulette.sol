// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

// PYTH Interfaces
import {IEntropyConsumer} from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import {IEntropy} from "@pythnetwork/entropy-sdk-solidity/IEntropy.sol";

// openzeppelin
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// iswap router
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract Roulette is IEntropyConsumer {
    uint256 constant AMOUNT = 10 ether;

    IEntropy entropy;
    address entropyProvider;

    IERC20 immutable WXTZ;
    IERC20 immutable USDC;
    IERC20 immutable WETH;
    uint24 public constant poolFee = 500; // 0.05% used on Iguana

    ISwapRouter public immutable swapRouter;

    mapping(uint64 => address) users;

    event Spin(address indexed user, uint64 sequenceNumber, bytes32 userRandomNumber);
    event Swap(address indexed user, uint64 sequenceNumber, int256 finalNumber, address tokenOut, uint256 amountOut);

    error XTZWrapFailed();

    constructor(
        address entropyAddress,
        address router,
        address _wxtz,
        address _usdc,
        address _weth
    ) {
        entropy = IEntropy(entropyAddress);
        entropyProvider = entropy.getDefaultProvider();
        swapRouter = ISwapRouter(router);
        WXTZ = IERC20(_wxtz);
        USDC = IERC20(_usdc);
        WETH = IERC20(_weth);
        // approve the router for wxtz
        WXTZ.approve(router, type(uint256).max);
    }

    function spin(bytes32 userRandomNumber) external payable returns (uint64) {
        uint256 fee = getFee();

        require(msg.value == fee + AMOUNT);

        // deposit xtz for wxtz
        (bool success,) = address(WXTZ).call{value: AMOUNT}("");
        if (!success) revert XTZWrapFailed();

        // // Transfer WXTZ from the sender to this contract
        // WXTZ.transferFrom(msg.sender, address(this), AMOUNT);

        // Request the random number with the callback
        uint64 sequenceNumber = entropy.requestWithCallback{value: fee}(
            entropyProvider,
            userRandomNumber
        );

        // Store the sequence number to identify the callback request
        users[sequenceNumber] = msg.sender;

        emit Spin(msg.sender, sequenceNumber, userRandomNumber);
        return sequenceNumber;
    }

    // It is called by the entropy contract when a random number is generated.
    function entropyCallback(
        uint64 sequenceNumber,
        address /* provider */,
        bytes32 randomNumber
    ) internal override {
        int256 finalNumber = mapRandomNumber(randomNumber, 1, 100);
        address tokenOut;

        if (finalNumber <= 50) {
            // wxtz -> usdc
            tokenOut = address(USDC);
        } else {
            // wxtz -> weth
            tokenOut = address(WETH);
        }

        // Naively set amountOutMinimum to 0. In production, use an oracle or other data source to choose a safer value for amountOutMinimum.
        // We also set the sqrtPriceLimitx96 to be 0 to ensure we swap our exact input amount.
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: address(WXTZ),
                tokenOut: tokenOut,
                fee: poolFee,
                recipient: users[sequenceNumber],
                deadline: block.timestamp,
                amountIn: AMOUNT,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            });

        // The call to `exactInputSingle` executes the swap.
        uint256 amountOut = swapRouter.exactInputSingle(params);

        emit Swap(users[sequenceNumber], sequenceNumber, finalNumber, tokenOut, amountOut);

        delete users[sequenceNumber]; // reset
    }

    // This method is required by the IEntropyConsumer interface.
    // It returns the address of the entropy contract which will call the callback.
    function getEntropy() internal view override returns (address) {
        return address(entropy);
    }

    function getFee() public view returns (uint256) {
        uint256 fee = entropy.getFee(entropyProvider);

        return fee;
    }

    // Maps a random number into a range between minRange and maxRange (inclusive)
    function mapRandomNumber(
        bytes32 randomNumber,
        int256 minRange,
        int256 maxRange
    ) internal pure returns (int256) {
        uint256 range = uint256(maxRange - minRange + 1);

        return minRange + int256(uint256(randomNumber) % range);
    }
}
