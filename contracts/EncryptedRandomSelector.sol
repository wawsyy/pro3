// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint32, externalEuint32} from "@fhevm/solidity/lib/FHE.sol";
import {SepoliaConfig} from "@fhevm/solidity/config/ZamaConfig.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title EncryptedRandomSelector
/// @author Encrypted Random Selector Team
/// @notice Fully homomorphic encryption powered random picker for confidential draws.
/// @dev Participants register with encrypted identifiers. The owner triggers an encrypted random
///      selection and can request off-chain decryption of the result through the FHE oracle.
///      This contract ensures privacy preservation while enabling fair random selection processes.
contract EncryptedRandomSelector is SepoliaConfig, Ownable {
    struct Candidate {
        euint32 encryptedIdentifier;
        address submitter;
    }

    /// @notice Store all candidates in an array to preserve order for random selection.
    Candidate[] private _candidates;

    /// @notice Tracks how many encrypted identifiers an address has contributed.
    mapping(address submitter => uint256 submissionCount) public submissionsByAddress;

    /// @notice Last encrypted winner identifier selected by the contract.
    euint32 private _lastWinner;

    /// @notice Indicates if a valid encrypted selection exists for the current round.
    bool public hasSelection;

    /// @notice Last asynchronous decryption request identifier.
    uint256 public latestDecryptionRequestId;

    /// @notice When true, an oracle decryption call is pending.
    bool public decryptionPending;

    /// @notice Maps oracle request ids back to the caller that triggered the decryption.
    mapping(uint256 requestId => address requester) private _requestInitiator;

    /// @notice Emitted when a participant successfully submits an encrypted identifier.
    /// @param submitter The wallet that registered.
    /// @param index Index assigned to the encrypted entry.
    event CandidateSubmitted(address indexed submitter, uint256 indexed index);

    /// @notice Emitted after a selection has been computed.
    /// @param candidateCount Total number of encrypted participants that were considered.
    event SelectionExecuted(uint256 indexed candidateCount);

    /// @notice Emitted when an oracle decryption request is sent.
    /// @param requestId The identifier assigned by the oracle.
    event SelectionDecryptionRequested(uint256 indexed requestId);

    /// @notice Emitted when a decrypted winner is published by the oracle or local flow.
    /// @param requester Account that initiated the decryption.
    /// @param winnerIdentifier Clear winner identifier (application-specific meaning).
    event SelectionDecrypted(address indexed requester, uint32 indexed winnerIdentifier);

    error NoCandidates();
    error SelectionPending();
    error DecryptionNotReady();
    error CandidateIndexOutOfBounds();

    /// @notice Initializes the contract setting the deployer as owner.
    constructor() Ownable(msg.sender) {}

    /// @notice Submit an encrypted identifier to participate in the draw.
    /// @param encryptedInput The encrypted handle for the participant identifier.
    /// @param inputProof Zama oracle proof for the encrypted handle.
    /// @return index Position assigned to the participant in the encrypted pool.
    function submitCandidate(
        externalEuint32 encryptedInput,
        bytes calldata inputProof
    ) external returns (uint256 index) {
        euint32 candidateId = FHE.fromExternal(encryptedInput, inputProof);

        _candidates.push(Candidate({encryptedIdentifier: candidateId, submitter: msg.sender}));
        submissionsByAddress[msg.sender] += 1;

        // Give on-chain contract access and allow the submitter to decrypt their own identifier if needed.
        FHE.allowThis(candidateId);
        FHE.allow(candidateId, msg.sender);

        emit CandidateSubmitted(msg.sender, _candidates.length - 1);
        return _candidates.length - 1;
    }

    /// @notice Returns the number of registered candidates.
    /// @return count The current total count of encrypted candidates.
    function candidateCount() external view returns (uint256) {
        return _candidates.length;
    }

    /// @notice Fetch the encrypted identifier for a candidate index.
    /// @param index Position of the encrypted candidate.
    /// @return encryptedIdentifier The encrypted identifier stored for that participant.
    function getCandidate(uint256 index) external view returns (euint32) {
        if (index < _candidates.length) {
            return _candidates[index].encryptedIdentifier;
        }
        revert CandidateIndexOutOfBounds();
    }

    /// @notice Execute the random draw using an encrypted random index.
    /// @dev The supplied random index must be in the range [0, candidates.length - 1].
    ///      The function selects the matching candidate in the encrypted domain.
    /// @param encryptedRandomIndex Encrypted index produced off-chain.
    /// @param inputProof Zama oracle proof associated with the encrypted index.
    function executeSelection(externalEuint32 encryptedRandomIndex, bytes calldata inputProof) external onlyOwner {
        if (_candidates.length == 0) {
            revert NoCandidates();
        }

        euint32 randomIndex = FHE.fromExternal(encryptedRandomIndex, inputProof);
        euint32 selected = FHE.asEuint32(0);

        for (uint256 i = 0; i < _candidates.length; ++i) {
            ebool isMatch = FHE.eq(randomIndex, FHE.asEuint32(uint32(i)));
            selected = FHE.select(isMatch, _candidates[i].encryptedIdentifier, selected);
        }

        _lastWinner = selected;
        hasSelection = true;
        decryptionPending = false;
        latestDecryptionRequestId = 0;

        // Allow the contract and owner to process or decrypt the selection.
        FHE.allowThis(_lastWinner);
        FHE.allow(_lastWinner, owner());

        emit SelectionExecuted(_candidates.length);
    }

    /// @notice Retrieve the encrypted identifier of the last winner.
    /// @return encryptedWinner Handle referencing the encrypted winner.
    function getEncryptedWinner() external view returns (euint32) {
        if (!hasSelection) {
            revert DecryptionNotReady();
        }
        return _lastWinner;
    }

    /// @notice Retrieve the encrypted winner as a ciphertext handle for off-chain usage.
    /// @return ciphertext Serialized ciphertext of the last winner.
    function getEncryptedWinnerHandle() external view returns (bytes32) {
        if (!hasSelection) {
            revert DecryptionNotReady();
        }
        return FHE.toBytes32(_lastWinner);
    }

    /// @notice Trigger an asynchronous decryption via the FHE oracle.
    /// @return requestId The identifier assigned to the oracle request.
    function requestWinnerDecryption() external onlyOwner returns (uint256) {
        if (!hasSelection) {
            revert DecryptionNotReady();
        }
        if (decryptionPending) {
            revert SelectionPending();
        }

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(_lastWinner);

        uint256 requestId = FHE.requestDecryption(ciphertexts, this.onWinnerDecrypted.selector);

        latestDecryptionRequestId = requestId;
        decryptionPending = true;
        _requestInitiator[requestId] = msg.sender;

        emit SelectionDecryptionRequested(requestId);
        return requestId;
    }

    /// @notice Callback executed by the oracle with the decrypted winner identifier.
    /// @param requestId Identifier originally provided by the oracle.
    /// @param cleartexts ABI encoded decrypted winner payload.
    /// @param decryptionProof Signature bundle provided by the oracle.
    /// @return success True when the callback completed without errors.
    function onWinnerDecrypted(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory decryptionProof
    ) public returns (bool) {
        if (!decryptionPending) {
            revert DecryptionNotReady();
        }
        if (requestId != latestDecryptionRequestId) {
            revert SelectionPending();
        }

        // Validate oracle response
        FHE.checkSignatures(requestId, cleartexts, decryptionProof);

        uint32 winnerIdentifier = abi.decode(cleartexts, (uint32));

        decryptionPending = false;

        emit SelectionDecrypted(_requestInitiator[requestId], winnerIdentifier);
        return true;
    }

    /// @notice Clear the candidate list, intended for new rounds.
    function resetRound() external onlyOwner {
        for (uint256 i = 0; i < _candidates.length; ++i) {
            address submitter = _candidates[i].submitter;
            if (submissionsByAddress[submitter] > 0) {
                submissionsByAddress[submitter] -= 1;
            }
        }
        delete _candidates;
        _lastWinner = FHE.asEuint32(0);
        hasSelection = false;
        decryptionPending = false;
        latestDecryptionRequestId = 0;
    }
}
