// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";

interface IKarwanVault {
    function withdrawForYield(uint256 amount) external;
    function operator() external view returns (address);
    function outForYield() external view returns (uint256);
}

interface IUSDC {
    function approve(address spender, uint256 amount) external returns (bool);
}

interface IUSYCTeller {
    function deposit(uint256 assets, address receiver) external returns (uint256 shares);
}

/// @notice Route idle staked USDC into USYC for yield via the vault's
///         entitlement-agnostic path. USYC currently permits only the OPERATOR
///         EOA to subscribe (the vault contract reads NotPermissioned), so this
///         pulls USDC out with withdrawForYield and subscribes from the operator
///         EOA, which holds the USYC and earns the yield. The vault tracks the
///         outstanding USDC via outForYield, so totalReserves still reflects
///         backing. Unwind with UnwindStakeFromUSYC before large claims.
///
///         Use this when canCall(vault, teller, deposit) is still false. Once
///         Circle entitles the vault address itself, prefer the simpler
///         WrapVaultToUSYC (vault.wrap) instead.
///
///         Broadcast by the operator EOA (also the entitled USYC address).
///         Env: KARWAN_VAULT_ADDR, WRAP_USDC_AMOUNT (6dp). Keep a USDC buffer
///         in the vault covering cooling positions + active reservations.
contract RouteStakeToUSYC is Script {
    address constant USDC = 0x3600000000000000000000000000000000000000;
    address constant TELLER = 0x9fdF14c5B14173D74C08Af27AebFf39240dC105A;

    function run() external {
        address vault = vm.envAddress("KARWAN_VAULT_ADDR");
        uint256 amount = vm.envUint("WRAP_USDC_AMOUNT");
        address operator = IKarwanVault(vault).operator();

        vm.startBroadcast();
        // 1. Pull USDC from the vault to the operator EOA.
        IKarwanVault(vault).withdrawForYield(amount);
        // 2. Subscribe USDC -> USYC from the entitled operator EOA.
        IUSDC(USDC).approve(TELLER, amount);
        uint256 shares = IUSYCTeller(TELLER).deposit(amount, operator);
        vm.stopBroadcast();

        console.log("Vault:            ", vault);
        console.log("Routed USDC:      ", amount);
        console.log("USYC to operator: ", operator);
        console.log("USYC shares:      ", shares);
        console.log("Vault outForYield:", IKarwanVault(vault).outForYield());
    }
}
