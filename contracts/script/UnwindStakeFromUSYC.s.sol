// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

interface IKarwanVault {
    function depositFromYield(uint256 amount) external;
    function operator() external view returns (address);
    function outForYield() external view returns (uint256);
}

interface IUSDC {
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IUSYCTeller {
    function redeem(uint256 shares, address receiver, address account)
        external
        returns (uint256 assets);
}

/// @notice Reverse of RouteStakeToUSYC. The operator EOA redeems USYC back to
///         USDC through the Teller, then returns it to the vault with
///         depositFromYield, which clears outForYield and books the surplus
///         (USYC appreciation) as vault yield. Run before large claims so the
///         vault holds enough liquid USDC, or to harvest yield.
///
///         Broadcast by the operator EOA.
///         Env: KARWAN_VAULT_ADDR, USYC_SHARES (6dp USYC amount to redeem).
contract UnwindStakeFromUSYC is Script {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant TELLER = 0x9fdF14c5B14173D74C08Af27AebFf39240dC105A;

    function run() external {
        address vault = vm.envAddress("KARWAN_VAULT_ADDR");
        uint256 shares = vm.envUint("USYC_SHARES");
        address operator = IKarwanVault(vault).operator();

        vm.startBroadcast();
        // 1. Redeem USYC -> USDC into the operator EOA.
        uint256 usdcOut = IUSYCTeller(TELLER).redeem(shares, operator, operator);
        // 2. Return the USDC to the vault; surplus over outForYield is yield.
        IUSDC(USDC).approve(vault, usdcOut);
        IKarwanVault(vault).depositFromYield(usdcOut);
        vm.stopBroadcast();

        console.log("Vault:            ", vault);
        console.log("Redeemed shares:  ", shares);
        console.log("USDC returned:    ", usdcOut);
        console.log("Vault outForYield:", IKarwanVault(vault).outForYield());
    }
}
