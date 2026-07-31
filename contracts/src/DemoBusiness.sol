// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IReferralRegistry {
    function recordConversion(uint256 campaignId, address wallet, uint256 actionIndex, bytes32 kind) external;
}

/// @title DemoBusiness
/// @notice A stand-in advertiser: the on-chain product a Vane campaign pays to grow.
///
/// @dev This exists so the whole loop can be demonstrated end to end without a real
///      advertiser having integrated anything. It plays the part a live business plays:
///      a user does something valuable (`convert`), and that action is a public on-chain
///      fact that anyone — Vane, the business, a sceptical judge — can verify independently.
///
///      It deliberately supports both intake paths Vane understands:
///
///      1. **Event-only (zero integration).** `Converted` is emitted unconditionally.
///         The Vane agent watches for it. A business using this path writes no Vane code
///         at all — it just tells Vane which contract and which event count as a result.
///
///      2. **Sealed (registry-integrated).** The contract also calls `recordConversion`
///         on Vane's registry, which refuses anything not already attributed. Stronger,
///         but requires the business to authorise this contract as a reporter.
///
///      The call in (2) is intentionally wrapped so a failure cannot revert the user's
///      action. A business's own product must never break because Vane's bookkeeping
///      rejected something — and it means an *unattributed* conversion still emits an
///      event, which is exactly the case the falcon must refuse out loud.
contract DemoBusiness {
    IReferralRegistry public immutable registry;
    address public owner;

    /// @notice The Vane campaign this product is currently being promoted under.
    uint256 public campaignId;

    /// @notice Per-user action counter — the monotonic index that makes replay impossible.
    mapping(address => uint256) public actionCount;

    /// @notice The result a campaign pays for. Public, permanent, independently verifiable.
    event Converted(address indexed user, uint256 indexed actionIndex, bytes32 kind);
    /// @notice Emitted when the registry declined to record — i.e. the wallet was never referred.
    event NotAttributed(address indexed user, uint256 indexed actionIndex);
    event CampaignSet(uint256 indexed campaignId);

    error NotOwner();

    /// @param _owner Passed explicitly — see the note on VaneEscrow's constructor. Under
    ///        Circle SCP, `msg.sender` during construction is Circle's deployer factory.
    constructor(address _registry, address _owner) {
        registry = IReferralRegistry(_registry);
        owner = _owner;
    }

    function setCampaign(uint256 _campaignId) external {
        if (msg.sender != owner) revert NotOwner();
        campaignId = _campaignId;
        emit CampaignSet(_campaignId);
    }

    /// @notice A user does the thing the business is paying to have happen.
    /// @param kind Free-form tag — "signup", "deposit", "trade" — carried through to the decision log.
    function convert(bytes32 kind) external returns (uint256 actionIndex) {
        actionIndex = actionCount[msg.sender]++;

        // Path 1: the public fact. Always emitted, integration or not.
        emit Converted(msg.sender, actionIndex, kind);

        // Path 2: the sealed record. Never allowed to break the user's action.
        try registry.recordConversion(campaignId, msg.sender, actionIndex, kind) {}
        catch {
            emit NotAttributed(msg.sender, actionIndex);
        }
    }
}
