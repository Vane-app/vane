// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ReferralRegistry
/// @notice On-chain attribution for Vane campaigns.
/// @dev A conversion is only ever credited to the tasker whose referral code the
///      converting wallet was sealed to *before* the conversion happened. The seal
///      is one-shot and permanent, so attribution cannot be rewritten after the
///      fact by a business, a tasker, or the Vane agent.
contract ReferralRegistry {
    struct Attribution {
        address tasker;
        uint64 sealedAt;
    }

    /// @notice campaignId => tasker => referral code
    mapping(uint256 => mapping(address => bytes32)) public codeOf;
    /// @notice referral code => tasker (global, codes are unique)
    mapping(bytes32 => address) public taskerOfCode;
    /// @notice campaignId => code => true once claimed
    mapping(uint256 => mapping(bytes32 => bool)) public codeTaken;

    /// @notice campaignId => converting wallet => attribution
    mapping(uint256 => mapping(address => Attribution)) public attributionOf;

    /// @notice campaignId => converting wallet => action index => recorded
    mapping(uint256 => mapping(address => mapping(uint256 => bool))) public actionRecorded;
    /// @notice campaignId => tasker => number of conversions credited
    mapping(uint256 => mapping(address => uint256)) public conversionCount;

    /// @notice Contracts allowed to record conversions for a campaign (the business's own app).
    mapping(uint256 => mapping(address => bool)) public reporterOf;
    /// @notice campaignId => business that owns it
    mapping(uint256 => address) public ownerOfCampaign;

    event CampaignRegistered(uint256 indexed campaignId, address indexed business);
    event ReporterSet(uint256 indexed campaignId, address indexed reporter, bool allowed);
    event CodeClaimed(uint256 indexed campaignId, address indexed tasker, bytes32 code);
    event WalletSealed(uint256 indexed campaignId, address indexed wallet, address indexed tasker, bytes32 code);
    event ConversionRecorded(
        uint256 indexed campaignId, address indexed wallet, address indexed tasker, uint256 actionIndex, bytes32 kind
    );

    error NotCampaignOwner();
    error CodeAlreadyTaken();
    error UnknownCode();
    error AlreadySealed();
    error NotSealed();
    error NotReporter();
    error DuplicateAction();

    /// @notice Called by the escrow when a campaign is funded.
    function registerCampaign(uint256 campaignId, address business) external {
        if (ownerOfCampaign[campaignId] != address(0)) return;
        ownerOfCampaign[campaignId] = business;
        emit CampaignRegistered(campaignId, business);
    }

    /// @notice The business authorises its own app/contract to report conversions.
    function setReporter(uint256 campaignId, address reporter, bool allowed) external {
        if (msg.sender != ownerOfCampaign[campaignId]) revert NotCampaignOwner();
        reporterOf[campaignId][reporter] = allowed;
        emit ReporterSet(campaignId, reporter, allowed);
    }

    /// @notice A tasker claims a referral code for a campaign. Free, permissionless, one per tasker.
    function claimCode(uint256 campaignId, bytes32 code) external {
        if (codeTaken[campaignId][code]) revert CodeAlreadyTaken();
        codeTaken[campaignId][code] = true;
        codeOf[campaignId][msg.sender] = code;
        taskerOfCode[code] = msg.sender;
        emit CodeClaimed(campaignId, msg.sender, code);
    }

    /// @notice Seal a wallet to the tasker who referred it. Permanent and one-shot.
    /// @dev Called when a referred user first arrives — before any conversion exists.
    ///      Anyone may call it, but only once per wallet per campaign, which is what
    ///      makes after-the-fact attribution rewriting impossible.
    function sealReferral(uint256 campaignId, address wallet, bytes32 code) external {
        if (attributionOf[campaignId][wallet].tasker != address(0)) revert AlreadySealed();
        address tasker = taskerOfCode[code];
        if (tasker == address(0)) revert UnknownCode();
        attributionOf[campaignId][wallet] = Attribution({tasker: tasker, sealedAt: uint64(block.timestamp)});
        emit WalletSealed(campaignId, wallet, tasker, code);
    }

    /// @notice Record a verifiable conversion. Only an authorised reporter may call.
    /// @param actionIndex Monotonic per-wallet index, so the same action can never be replayed.
    /// @param kind Free-form tag, e.g. "signup", "deposit", "trade".
    function recordConversion(uint256 campaignId, address wallet, uint256 actionIndex, bytes32 kind) external {
        if (!reporterOf[campaignId][msg.sender]) revert NotReporter();
        if (actionRecorded[campaignId][wallet][actionIndex]) revert DuplicateAction();

        Attribution memory a = attributionOf[campaignId][wallet];
        if (a.tasker == address(0)) revert NotSealed();

        actionRecorded[campaignId][wallet][actionIndex] = true;
        unchecked {
            conversionCount[campaignId][a.tasker] += 1;
        }
        emit ConversionRecorded(campaignId, wallet, a.tasker, actionIndex, kind);
    }

    function taskerFor(uint256 campaignId, address wallet) external view returns (address) {
        return attributionOf[campaignId][wallet].tasker;
    }

    function sealedAt(uint256 campaignId, address wallet) external view returns (uint64) {
        return attributionOf[campaignId][wallet].sealedAt;
    }
}
