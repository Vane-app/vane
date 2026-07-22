// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

interface IReferralRegistry {
    function registerCampaign(uint256 campaignId, address business) external;
    function taskerFor(uint256 campaignId, address wallet) external view returns (address);
}

/// @title VaneEscrow
/// @notice Campaign budgets in USDC, released only against verified results.
///
/// @dev Trust model — deliberately narrow:
///      * The vault holds the funds. The Vane agent never custodies user money.
///      * The agent may only call `settle`, and settlement can only ever pay the
///        tasker address the registry sealed *before* the conversion. There is no
///        arbitrary-recipient path, so a compromised agent key cannot drain a vault
///        to an attacker — the worst case is paying a genuinely attributed tasker.
///      * Per-payout amount is capped by `rewardPerAction`, and total spend is capped
///        by the funded budget. Both are enforced here, not in the agent.
///      * Expiry refunds are permissionless: the business can always recover unspent
///        budget after `endsAt`, even if Vane disappears entirely.
contract VaneEscrow {
    /// @notice USDC on Arc, ERC-20 view, 6 decimals.
    IERC20 public immutable usdc;
    IReferralRegistry public immutable registry;

    /// @notice The Vane agent — may verify and settle, may never withdraw.
    address public agent;
    address public admin;

    /// @notice Protocol fee in basis points, charged to the business on settled results only.
    uint16 public feeBps = 800; // 8%
    address public feeRecipient;

    uint16 public constant MAX_FEE_BPS = 1000; // hard ceiling, 10%

    enum Status {
        None,
        Active,
        Cancelled,
        Expired
    }

    struct Campaign {
        address business;
        uint96 rewardPerAction; // USDC, 6dp — per-payout cap
        uint128 budget; // total funded
        uint128 spent; // paid to taskers
        uint128 feesAccrued; // paid to feeRecipient
        uint64 endsAt;
        uint64 bond; // business security deposit, refunded on clean close
        Status status;
    }

    uint256 public nextCampaignId = 1;
    mapping(uint256 => Campaign) public campaigns;

    /// @notice campaignId => tasker => total earned
    mapping(uint256 => mapping(address => uint256)) public earned;
    /// @notice Settlement idempotency: keccak(campaignId, wallet, actionIndex) => paid
    mapping(bytes32 => bool) public settled;

    event CampaignCreated(
        uint256 indexed campaignId,
        address indexed business,
        uint256 budget,
        uint96 rewardPerAction,
        uint64 endsAt,
        uint64 bond
    );
    event Settled(
        uint256 indexed campaignId,
        address indexed tasker,
        address indexed wallet,
        uint256 actionIndex,
        uint256 amount,
        uint256 fee,
        string reason
    );
    event Held(uint256 indexed campaignId, address indexed wallet, uint256 actionIndex, string reason);
    event CampaignClosed(uint256 indexed campaignId, Status status, uint256 refunded);
    event AgentUpdated(address indexed agent);
    event FeeUpdated(uint16 feeBps, address feeRecipient);

    error NotAgent();
    error NotAdmin();
    error NotBusiness();
    error NotActive();
    error BadParams();
    error AlreadySettled();
    error NotAttributed();
    error BudgetExhausted();
    error TooEarly();
    error TransferFailed();
    error FeeTooHigh();

    modifier onlyAgent() {
        if (msg.sender != agent) revert NotAgent();
        _;
    }

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    constructor(address _usdc, address _registry, address _agent, address _feeRecipient) {
        usdc = IERC20(_usdc);
        registry = IReferralRegistry(_registry);
        agent = _agent;
        admin = msg.sender;
        feeRecipient = _feeRecipient;
    }

    // ---------------------------------------------------------------- business

    /// @notice Fund a campaign. Pulls `budget + bond` USDC from the business.
    /// @dev The business approves this contract for USDC first — on Arc that approval
    ///      is itself gasless for the user when routed through Circle Paymaster.
    function createCampaign(uint128 budget, uint96 rewardPerAction, uint64 durationSeconds, uint64 bond)
        external
        returns (uint256 campaignId)
    {
        if (budget == 0 || rewardPerAction == 0 || rewardPerAction > budget || durationSeconds == 0) {
            revert BadParams();
        }

        campaignId = nextCampaignId++;
        campaigns[campaignId] = Campaign({
            business: msg.sender,
            rewardPerAction: rewardPerAction,
            budget: budget,
            spent: 0,
            feesAccrued: 0,
            endsAt: uint64(block.timestamp) + durationSeconds,
            bond: bond,
            status: Status.Active
        });

        uint256 pull = uint256(budget) + uint256(bond);
        if (!usdc.transferFrom(msg.sender, address(this), pull)) revert TransferFailed();

        registry.registerCampaign(campaignId, msg.sender);

        emit CampaignCreated(campaignId, msg.sender, budget, rewardPerAction, campaigns[campaignId].endsAt, bond);
    }

    /// @notice Business ends a campaign early. Everything already earned is already paid;
    ///         unspent budget and the bond return immediately.
    function cancel(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (msg.sender != c.business) revert NotBusiness();
        if (c.status != Status.Active) revert NotActive();
        c.status = Status.Cancelled;
        uint256 refund = _refundable(c);
        _payout(c.business, refund);
        emit CampaignClosed(campaignId, Status.Cancelled, refund);
    }

    /// @notice After `endsAt`, anyone may return unspent budget to the business.
    /// @dev Permissionless on purpose: the business's money comes home even if Vane
    ///      is offline. This is the "money is never lost" guarantee, enforced in code.
    function expire(uint256 campaignId) external {
        Campaign storage c = campaigns[campaignId];
        if (c.status != Status.Active) revert NotActive();
        if (block.timestamp < c.endsAt) revert TooEarly();
        c.status = Status.Expired;
        uint256 refund = _refundable(c);
        _payout(c.business, refund);
        emit CampaignClosed(campaignId, Status.Expired, refund);
    }

    function _refundable(Campaign storage c) private view returns (uint256) {
        return uint256(c.budget) - uint256(c.spent) - uint256(c.feesAccrued) + uint256(c.bond);
    }

    // ------------------------------------------------------------------- agent

    /// @notice Settle one verified result. Callable only by the agent.
    /// @param wallet The converting wallet — the tasker is derived from the registry seal,
    ///        never passed in, so the agent cannot redirect funds.
    /// @param reason The agent's written justification, emitted on-chain for the decision log.
    function settle(uint256 campaignId, address wallet, uint256 actionIndex, string calldata reason)
        external
        onlyAgent
        returns (uint256 paid)
    {
        Campaign storage c = campaigns[campaignId];
        if (c.status != Status.Active || block.timestamp >= c.endsAt) revert NotActive();

        bytes32 key = keccak256(abi.encodePacked(campaignId, wallet, actionIndex));
        if (settled[key]) revert AlreadySettled();

        address tasker = registry.taskerFor(campaignId, wallet);
        if (tasker == address(0)) revert NotAttributed();

        uint256 amount = c.rewardPerAction;
        uint256 fee = (amount * feeBps) / 10_000;
        if (uint256(c.spent) + uint256(c.feesAccrued) + amount + fee > uint256(c.budget)) revert BudgetExhausted();

        settled[key] = true;
        c.spent += uint128(amount);
        c.feesAccrued += uint128(fee);
        earned[campaignId][tasker] += amount;

        _payout(tasker, amount);
        if (fee > 0) _payout(feeRecipient, fee);

        emit Settled(campaignId, tasker, wallet, actionIndex, amount, fee, reason);
        return amount;
    }

    /// @notice Batch settlement — the Nanopayments path for streaming rev-share.
    /// @dev Many sub-cent payouts amortised into one transaction. Each entry is
    ///      independently idempotent; a duplicate inside a batch is skipped, not reverted,
    ///      so one bad entry can never block an honest tasker's payout.
    function settleBatch(
        uint256 campaignId,
        address[] calldata wallets,
        uint256[] calldata actionIndexes,
        string calldata reason
    ) external onlyAgent returns (uint256 count) {
        if (wallets.length != actionIndexes.length) revert BadParams();
        Campaign storage c = campaigns[campaignId];
        if (c.status != Status.Active || block.timestamp >= c.endsAt) revert NotActive();

        for (uint256 i = 0; i < wallets.length; ++i) {
            if (!_settleOne(campaignId, wallets[i], actionIndexes[i], reason)) continue;
            unchecked {
                ++count;
            }
        }
    }

    /// @dev One settlement attempt. Returns false instead of reverting so a single
    ///      bad entry in a batch can never block an honest tasker's payout.
    function _settleOne(uint256 campaignId, address wallet, uint256 actionIndex, string calldata reason)
        private
        returns (bool)
    {
        bytes32 key = keccak256(abi.encodePacked(campaignId, wallet, actionIndex));
        if (settled[key]) return false;

        address tasker = registry.taskerFor(campaignId, wallet);
        if (tasker == address(0)) return false;

        Campaign storage c = campaigns[campaignId];
        uint256 amount = c.rewardPerAction;
        uint256 fee = (amount * feeBps) / 10_000;
        if (uint256(c.spent) + uint256(c.feesAccrued) + amount + fee > uint256(c.budget)) return false;

        settled[key] = true;
        c.spent += uint128(amount);
        c.feesAccrued += uint128(fee);
        earned[campaignId][tasker] += amount;

        _payout(tasker, amount);
        if (fee > 0) _payout(feeRecipient, fee);

        emit Settled(campaignId, tasker, wallet, actionIndex, amount, fee, reason);
        return true;
    }

    /// @notice Record a refusal on-chain. Moves no money — it exists so the decision
    ///         log is auditable by the business, not only visible in Vane's UI.
    function hold(uint256 campaignId, address wallet, uint256 actionIndex, string calldata reason) external onlyAgent {
        emit Held(campaignId, wallet, actionIndex, reason);
    }

    // ------------------------------------------------------------------- admin

    function setAgent(address _agent) external onlyAdmin {
        agent = _agent;
        emit AgentUpdated(_agent);
    }

    function setFee(uint16 _feeBps, address _feeRecipient) external onlyAdmin {
        if (_feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        feeBps = _feeBps;
        feeRecipient = _feeRecipient;
        emit FeeUpdated(_feeBps, _feeRecipient);
    }

    // -------------------------------------------------------------------- view

    function remaining(uint256 campaignId) external view returns (uint256) {
        Campaign storage c = campaigns[campaignId];
        return uint256(c.budget) - uint256(c.spent) - uint256(c.feesAccrued);
    }

    function _payout(address to, uint256 amount) private {
        if (amount == 0) return;
        if (!usdc.transfer(to, amount)) revert TransferFailed();
    }
}
