// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.20;

/// @title WXTZ functionnalities
/// @notice Functions for deposit and withdraw XTZ into the WXTZ contract
interface IWXTZ {
    /// @notice Deposit native XTZ for WXTZ
    function deposit() external payable;

    /// @notice Burn the WXTZ token and send back to the caller native XTZ
    /// @param wad The parameters necessary for the swap, encoded as `ExactInputSingleParams` in calldata
    function withdraw(uint wad) external;

    /**
     * @dev Sets a `value` amount of tokens as the allowance of `spender` over the
     * caller's tokens.
     *
     * Returns a boolean value indicating whether the operation succeeded.
     *
     * IMPORTANT: Beware that changing an allowance with this method brings the risk
     * that someone may use both the old and the new allowance by unfortunate
     * transaction ordering. One possible solution to mitigate this race
     * condition is to first reduce the spender's allowance to 0 and set the
     * desired value afterwards:
     * https://github.com/ethereum/EIPs/issues/20#issuecomment-263524729
     *
     * Emits an {Approval} event.
     */
    function approve(address spender, uint256 value) external returns (bool);
}
