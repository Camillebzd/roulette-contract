// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

// PYTH Interfaces
import {IEntropyConsumer} from "@pythnetwork/entropy-sdk-solidity/IEntropyConsumer.sol";
import {IEntropy} from "@pythnetwork/entropy-sdk-solidity/IEntropy.sol";

// openzeppelin
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

// iswap router
import {ISwapRouter} from "./interfaces/ISwapRouter.sol";

// iwxtz
import {IWXTZ} from "./interfaces/IWXTZ.sol";

// Uncomment this line to use console.log
// import "hardhat/console.sol";

contract Roulette is IEntropyConsumer, Ownable {
    uint256 public constant AMOUNT = 1 ether;

    IEntropy public entropy;
    address public entropyProvider;

    IWXTZ immutable public WXTZ;
    IERC20 immutable public USDC;
    IERC20 immutable public WETH;
    uint24 public constant poolFee = 500; // 0.05% used on Iguana

    ISwapRouter public immutable swapRouter;

    mapping(uint64 => address) users;

    event Spin(
        address indexed user,
        uint64 sequenceNumber,
        bytes32 userRandomNumber
    );
    event Swap(
        address indexed user,
        uint64 sequenceNumber,
        uint256 finalNumber,
        address tokenOut,
        uint256 amountOut
    );
    event Lost(
        address indexed user,
        uint64 sequenceNumber,
        uint256 finalNumber
    );
    event DoubleWin(
        address indexed user,
        uint64 sequenceNumber,
        uint256 finalNumber,
        uint256 doubledAmount
    );

    error NotRightAmount();
    error XTZWrapFailed();
    error FailedToSendXTZ();

    constructor(
        address entropyAddress,
        address router,
        address _wxtz,
        address _usdc,
        address _weth
    ) Ownable(msg.sender) {
        entropy = IEntropy(entropyAddress);
        entropyProvider = entropy.getDefaultProvider();
        swapRouter = ISwapRouter(router);
        WXTZ = IWXTZ(_wxtz);
        USDC = IERC20(_usdc);
        WETH = IERC20(_weth);
        // approve the router for wxtz
        WXTZ.approve(router, type(uint256).max);
    }

    receive() external payable {}

    function withdrawFunds() external onlyOwner {
        (bool success, ) = owner().call{value: address(this).balance}("");
        if (!success) revert FailedToSendXTZ();
    }

    function spin(bytes32 userRandomNumber) external payable returns (uint64) {
        // Pyth fees
        uint256 fee = getFee();

        if (msg.value != fee + AMOUNT) revert NotRightAmount();

        // deposit xtz for wxtz
        (bool success, ) = address(WXTZ).call{value: AMOUNT}("");
        if (!success) revert XTZWrapFailed();

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

    // TEST ONLY, remove on real contract
    function testTriggerCallback(uint64 sequenceNumber, bytes32 randomNumber) external {
        entropyCallback(sequenceNumber, entropyProvider, randomNumber);
    }

    // It is called by the entropy contract when a random number is generated.
    function entropyCallback(
        uint64 sequenceNumber,
        address /* provider */,
        bytes32 randomNumber
    ) internal override {
        uint256 finalNumber = mapRandomNumber(randomNumber, 1, 100);
        address user = users[sequenceNumber];

        if (finalNumber <= 10) {
            WXTZ.withdraw(AMOUNT);
            emit Lost(user, sequenceNumber, finalNumber);
        } else if (finalNumber > 90) {
            doubleReward(user, sequenceNumber, finalNumber);
        } else {
            swap(user, sequenceNumber, finalNumber);
        }
        delete users[sequenceNumber];
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
        uint256 minRange,
        uint256 maxRange
    ) internal pure returns (uint256) {
        uint256 range = uint256(maxRange - minRange + 1);

        return minRange + uint256(uint256(randomNumber) % range);
    }

    // unwrap and send back to user the amount paid twice
    function doubleReward(
        address user,
        uint64 sequenceNumber,
        uint256 finalNumber
    ) internal {
        uint256 amount = AMOUNT * 2;

        WXTZ.withdraw(AMOUNT);
        (bool sent, ) = payable(user).call{value: amount}("");
        if (!sent) revert FailedToSendXTZ();
        emit DoubleWin(user, sequenceNumber, finalNumber, amount);
    }

    // swap and send the token
    function swap(
        address user,
        uint64 sequenceNumber,
        uint256 finalNumber
    ) internal {
        address tokenOut = (finalNumber <= 50) ? address(USDC) : address(WETH);
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter
            .ExactInputSingleParams({
                tokenIn: address(WXTZ),
                tokenOut: tokenOut,
                fee: poolFee,
                recipient: user,
                deadline: block.timestamp,
                amountIn: AMOUNT,
                amountOutMinimum: 0, // keep it for test
                sqrtPriceLimitX96: 0
            });

        uint256 amountOut = swapRouter.exactInputSingle(params);
        emit Swap(user, sequenceNumber, finalNumber, tokenOut, amountOut);
    }
}
