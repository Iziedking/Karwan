import { parseAbi } from 'viem';

// KarwanAgreementEscrow as deployed on Arc Testnet at 0x55460D2b8b0D8067Ea33406b310224B5bd44F43C,
// from its Sourcify v2 exact match (24 Oct 2026). Regenerate only from a deployed, verified contract.
export const agreementEscrowContractAbi = [
  {
    "type": "constructor",
    "inputs": [
      {
        "name": "hub_",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "b",
        "type": "tuple",
        "components": [
          {
            "name": "minReview",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxReview",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "maxHorizon",
            "type": "uint64",
            "internalType": "uint64"
          }
        ],
        "internalType": "struct AgreementBounds"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "name": "Assigned",
    "type": "error",
    "inputs": []
  },
  {
    "name": "BadAmount",
    "type": "error",
    "inputs": []
  },
  {
    "name": "BadBounds",
    "type": "error",
    "inputs": []
  },
  {
    "name": "BadDelivery",
    "type": "error",
    "inputs": []
  },
  {
    "name": "BadHorizon",
    "type": "error",
    "inputs": []
  },
  {
    "name": "BadOutcome",
    "type": "error",
    "inputs": []
  },
  {
    "name": "BadParties",
    "type": "error",
    "inputs": []
  },
  {
    "name": "BadSignature",
    "type": "error",
    "inputs": []
  },
  {
    "name": "Closed",
    "type": "error",
    "inputs": []
  },
  {
    "name": "Early",
    "type": "error",
    "inputs": []
  },
  {
    "name": "Exists",
    "type": "error",
    "inputs": []
  },
  {
    "name": "Expired",
    "type": "error",
    "inputs": []
  },
  {
    "name": "FeeTooHigh",
    "type": "error",
    "inputs": []
  },
  {
    "name": "HoldBudget",
    "type": "error",
    "inputs": []
  },
  {
    "name": "InvalidShortString",
    "type": "error",
    "inputs": []
  },
  {
    "name": "NoPending",
    "type": "error",
    "inputs": []
  },
  {
    "name": "NonceUsed",
    "type": "error",
    "inputs": []
  },
  {
    "name": "NotAllowed",
    "type": "error",
    "inputs": []
  },
  {
    "name": "NotAssignee",
    "type": "error",
    "inputs": []
  },
  {
    "name": "NotGuardian",
    "type": "error",
    "inputs": []
  },
  {
    "name": "NotOpen",
    "type": "error",
    "inputs": []
  },
  {
    "name": "NotParty",
    "type": "error",
    "inputs": []
  },
  {
    "name": "NotSenior",
    "type": "error",
    "inputs": []
  },
  {
    "name": "NothingOwed",
    "type": "error",
    "inputs": []
  },
  {
    "name": "OnHold",
    "type": "error",
    "inputs": []
  },
  {
    "name": "OverCap",
    "type": "error",
    "inputs": []
  },
  {
    "name": "PoolBusy",
    "type": "error",
    "inputs": []
  },
  {
    "name": "ReentrancyGuardReentrantCall",
    "type": "error",
    "inputs": []
  },
  {
    "name": "StringTooLong",
    "type": "error",
    "inputs": [
      {
        "name": "str",
        "type": "string",
        "internalType": "string"
      }
    ]
  },
  {
    "name": "Accepted",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "payee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "name": "AccountClosed",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "name": "AccountOpened",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "asset",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "payer",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "payees",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "feeBps",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      },
      {
        "name": "feeRecipient",
        "type": "address",
        "indexed": false,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "name": "AssignmentReleased",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "payee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "assignee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "name": "EIP712DomainChanged",
    "type": "event",
    "inputs": [],
    "anonymous": false
  },
  {
    "name": "FeePaid",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "Funded",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "from",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "Held",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "until",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      },
      {
        "name": "reasonHash",
        "type": "bytes32",
        "indexed": false,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "name": "HoldReleased",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      }
    ],
    "anonymous": false
  },
  {
    "name": "HorizonSet",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "horizon",
        "type": "uint64",
        "indexed": false,
        "internalType": "uint64"
      }
    ],
    "anonymous": false
  },
  {
    "name": "LongstopSplit",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "by",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "name": "NonceCancelled",
    "type": "event",
    "inputs": [
      {
        "name": "payee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "nonce",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "OutcomeUnrecorded",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "party",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      }
    ],
    "anonymous": false
  },
  {
    "name": "OwedWithdrawn",
    "type": "event",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "Paid",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      },
      {
        "name": "toAssignee",
        "type": "bool",
        "indexed": false,
        "internalType": "bool"
      }
    ],
    "anonymous": false
  },
  {
    "name": "PayeeAdded",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "payee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      }
    ],
    "anonymous": false
  },
  {
    "name": "PayoutAssigned",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "payee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "assignee",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint128",
        "indexed": false,
        "internalType": "uint128"
      }
    ],
    "anonymous": false
  },
  {
    "name": "PayoutCredited",
    "type": "event",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "to",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "Promised",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "RecordAlreadyWritten",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "party",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      }
    ],
    "anonymous": false
  },
  {
    "name": "RecordPending",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "party",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "outcome",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      },
      {
        "name": "detail",
        "type": "uint16",
        "indexed": false,
        "internalType": "uint16"
      }
    ],
    "anonymous": false
  },
  {
    "name": "StakeHookFailed",
    "type": "event",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "indexed": true,
        "internalType": "bytes32"
      },
      {
        "name": "hook",
        "type": "uint8",
        "indexed": false,
        "internalType": "uint8"
      }
    ],
    "anonymous": false
  },
  {
    "name": "YieldParked",
    "type": "event",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "YieldPulled",
    "type": "event",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "indexed": true,
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint256",
        "indexed": false,
        "internalType": "uint256"
      }
    ],
    "anonymous": false
  },
  {
    "name": "HOLD_BUDGET",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "HOLD_STEP",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "LONGSTOP",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "MAX_FEE_BPS",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "MAX_HORIZON",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "MAX_PAYEES",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "accept",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "termsHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "acceptSplit",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "sellerBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "acceptWithStake",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "termsHash",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sig",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "accountOf",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {
            "name": "asset",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "horizon",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "payeeCount",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "closed",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "consentMask",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "valued",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "payer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "payerId",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "feeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "yieldBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "feeRecipient",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "holdUntil",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "seniorSafe",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "holdUsed",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "perDealCap",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "funded",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "balance",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "feePaid",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "promised",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "recordValue",
            "type": "uint128",
            "internalType": "uint128"
          }
        ],
        "internalType": "struct DealAccount"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "applyFallback",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "approveExtension",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "newDeadline",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "assignDigest",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "payee",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "assignee",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "submitter",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "nonce",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "assignPayout",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "payee",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "assignee",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "nonce",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sig",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "assignmentOf",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "payee",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "assignee",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "amount",
        "type": "uint128",
        "internalType": "uint128"
      },
      {
        "name": "paid",
        "type": "uint128",
        "internalType": "uint128"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "attestCheck",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "revision",
        "type": "uint32",
        "internalType": "uint32"
      },
      {
        "name": "pass",
        "type": "bool",
        "internalType": "bool"
      },
      {
        "name": "evidenceHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "cancelMissed",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "cancelNonce",
    "type": "function",
    "inputs": [
      {
        "name": "nonce",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "cancelSplit",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "cancelUnaccepted",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "claim",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "dealIdFor",
    "type": "function",
    "inputs": [
      {
        "name": "buyer",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "dispute",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "clauseHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "disputeOf",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {
            "name": "opener",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "openedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "proposed",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "escalated",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "proposedBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "proposedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "escalatedAt",
            "type": "uint64",
            "internalType": "uint64"
          }
        ],
        "internalType": "struct Dispute"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "eip712Domain",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "fields",
        "type": "bytes1",
        "internalType": "bytes1"
      },
      {
        "name": "name",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "version",
        "type": "string",
        "internalType": "string"
      },
      {
        "name": "chainId",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "verifyingContract",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "extensions",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "escalate",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "executeRuling",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "extendDeadline",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "newDeadline",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "feeLeft",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "fund",
    "type": "function",
    "inputs": [
      {
        "name": "salt",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "t",
        "type": "tuple",
        "components": [
          {
            "name": "asset",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "seller",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "trancheBps",
            "type": "uint16[12]",
            "internalType": "uint16[12]"
          },
          {
            "name": "acceptBy",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "deliveryDeadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "reclaimGrace",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "reviewWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "startLongstop",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "extensionSecs",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "silentLongstop",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "reviewStarts",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "maxExtensions",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "finalRelease",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "silenceOutcome",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "partialBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "fallbackBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "parts",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "partEvery",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "cancelFeeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "sellerStake",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "verifier",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "checkPolicy",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "agreementHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ],
        "internalType": "struct AgreementTerms"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "nonpayable"
  },
  {
    "name": "getDeal",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {
            "name": "state",
            "type": "uint8",
            "internalType": "enum AgreementState"
          },
          {
            "name": "count",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "paid",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "extUsed",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "extRequests",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "checkPassed",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "checkFailed",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "lateMark",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "partsPaid",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "revision",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "fundedAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "deadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "deliveredAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "reviewStartAt",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "reviewEnd",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "requestedDeadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "holdBase",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "sellerNet",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "feeTotal",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "released",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "feeReleased",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "termsHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ],
        "internalType": "struct AgreementDeal"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "getTerms",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {
            "name": "asset",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "seller",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "trancheBps",
            "type": "uint16[12]",
            "internalType": "uint16[12]"
          },
          {
            "name": "acceptBy",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "deliveryDeadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "reclaimGrace",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "reviewWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "startLongstop",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "extensionSecs",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "silentLongstop",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "reviewStarts",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "maxExtensions",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "finalRelease",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "silenceOutcome",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "partialBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "fallbackBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "parts",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "partEvery",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "cancelFeeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "sellerStake",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "verifier",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "checkPolicy",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "agreementHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ],
        "internalType": "struct AgreementTerms"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "held",
    "type": "function",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "hold",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "reasonHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "hub",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "address",
        "internalType": "contract IKarwanHub"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "isParty",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "who",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "keepStake",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "longstopSplit",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "toPayer",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "toPayees",
        "type": "uint256[]",
        "internalType": "uint256[]"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "markDelivered",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "proofHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "maxHorizon",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "maxReview",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "minReview",
    "type": "function",
    "inputs": [],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "nonceUsed",
    "type": "function",
    "inputs": [
      {
        "name": "payee",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "nonce",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bool",
        "internalType": "bool"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "owed",
    "type": "function",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "internalType": "address"
      },
      {
        "name": "who",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "owedTotal",
    "type": "function",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "panelOf",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {
            "name": "arbiter",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "reviewer",
            "type": "address",
            "internalType": "address"
          }
        ],
        "internalType": "struct DisputePanel"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "parkable",
    "type": "function",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "parked",
    "type": "function",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "payPart",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "payeesOf",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "out",
        "type": "address[]",
        "internalType": "address[]"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "pendingRecord",
    "type": "function",
    "inputs": [
      {
        "name": "key",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint24",
        "internalType": "uint24"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "promisedTotal",
    "type": "function",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "proposeRuling",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "sellerBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "rulingHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "proposeSplit",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "sellerBps",
        "type": "uint16",
        "internalType": "uint16"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "rebalanceYield",
    "type": "function",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "receivableOf",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "r",
        "type": "tuple",
        "components": [
          {
            "name": "asset",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "seller",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "unpaid",
            "type": "uint256",
            "internalType": "uint256"
          },
          {
            "name": "horizon",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "open",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "financeable",
            "type": "bool",
            "internalType": "bool"
          }
        ],
        "internalType": "struct Receivable"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "reclaim",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "release",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "releaseAssignment",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "payee",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "releaseBySig",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      },
      {
        "name": "sig",
        "type": "bytes",
        "internalType": "bytes"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "releaseDigest",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "tranche",
        "type": "uint8",
        "internalType": "uint8"
      },
      {
        "name": "deadline",
        "type": "uint256",
        "internalType": "uint256"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "releaseHold",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "requestExtension",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "newDeadline",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "requestMoreTime",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "retryRecord",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "party",
        "type": "uint8",
        "internalType": "uint8"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "reviewEndOf",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "uint64",
        "internalType": "uint64"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "rule",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      },
      {
        "name": "sellerBps",
        "type": "uint16",
        "internalType": "uint16"
      },
      {
        "name": "rulingHash",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "splitOf",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "tuple",
        "components": [
          {
            "name": "proposer",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "sellerBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "active",
            "type": "bool",
            "internalType": "bool"
          },
          {
            "name": "paid",
            "type": "uint8",
            "internalType": "uint8"
          }
        ],
        "internalType": "struct SplitOffer"
      }
    ],
    "stateMutability": "view"
  },
  {
    "name": "startReview",
    "type": "function",
    "inputs": [
      {
        "name": "dealId",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  },
  {
    "name": "termsHashOf",
    "type": "function",
    "inputs": [
      {
        "name": "t",
        "type": "tuple",
        "components": [
          {
            "name": "asset",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "seller",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "amount",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "trancheBps",
            "type": "uint16[12]",
            "internalType": "uint16[12]"
          },
          {
            "name": "acceptBy",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "deliveryDeadline",
            "type": "uint64",
            "internalType": "uint64"
          },
          {
            "name": "reclaimGrace",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "reviewWindow",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "startLongstop",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "extensionSecs",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "silentLongstop",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "reviewStarts",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "maxExtensions",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "finalRelease",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "silenceOutcome",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "partialBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "fallbackBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "parts",
            "type": "uint8",
            "internalType": "uint8"
          },
          {
            "name": "partEvery",
            "type": "uint32",
            "internalType": "uint32"
          },
          {
            "name": "cancelFeeBps",
            "type": "uint16",
            "internalType": "uint16"
          },
          {
            "name": "sellerStake",
            "type": "uint128",
            "internalType": "uint128"
          },
          {
            "name": "verifier",
            "type": "address",
            "internalType": "address"
          },
          {
            "name": "checkPolicy",
            "type": "bytes32",
            "internalType": "bytes32"
          },
          {
            "name": "agreementHash",
            "type": "bytes32",
            "internalType": "bytes32"
          }
        ],
        "internalType": "struct AgreementTerms"
      }
    ],
    "outputs": [
      {
        "name": "",
        "type": "bytes32",
        "internalType": "bytes32"
      }
    ],
    "stateMutability": "pure"
  },
  {
    "name": "withdrawOwed",
    "type": "function",
    "inputs": [
      {
        "name": "asset",
        "type": "address",
        "internalType": "address"
      }
    ],
    "outputs": [],
    "stateMutability": "nonpayable"
  }
] as const;

// Events of the linked libraries (AgreementLib, DisputeLib, ruling and delivery libraries).
// They run by delegatecall, so their logs carry the escrow's address but are not
// in the escrow's own ABI. Signatures copied from contracts/src/suite/agreement and dispute.
export const agreementLibraryEventsAbi = parseAbi([
  'event CheckReported(bytes32 indexed dealId, uint32 revision, bool pass, bytes32 evidenceHash)',
  'event DeadlineMoved(bytes32 indexed dealId, uint64 deadline)',
  'event DealAccepted(bytes32 indexed dealId)',
  'event DealCancelled(bytes32 indexed dealId, uint256 refunded)',
  'event DealFunded(bytes32 indexed dealId, address indexed buyer, address indexed seller, uint256 funded, bytes32 termsHash)',
  'event DealReclaimed(bytes32 indexed dealId, uint256 refunded, bool deposit)',
  'event DealSettled(bytes32 indexed dealId)',
  'event Delivered(bytes32 indexed dealId, uint8 tranche, uint32 revision, bytes32 proofHash)',
  'event DisputeEscalated(bytes32 indexed dealId, address indexed by, uint64 rulingDue)',
  'event DisputeOpened(bytes32 indexed dealId, address indexed opener, bytes32 clauseHash)',
  'event DisputeResolved(bytes32 indexed dealId, uint16 sellerBps, bytes32 rulingHash, uint8 how)',
  'event ExtensionRequested(bytes32 indexed dealId, uint64 deadline)',
  'event PartPaid(bytes32 indexed dealId, uint8 part, uint256 amount)',
  'event PlanCancelled(bytes32 indexed dealId, uint256 toSeller, uint256 toBuyer)',
  'event ReviewExtended(bytes32 indexed dealId, uint8 used, uint64 reviewEnd)',
  'event ReviewStarted(bytes32 indexed dealId, uint8 tranche, uint64 reviewEnd)',
  'event RulingProposed(bytes32 indexed dealId, uint16 sellerBps, bytes32 rulingHash, uint64 appealEnds)',
  'event SplitCancelled(bytes32 indexed dealId)',
  'event SplitProposed(bytes32 indexed dealId, address proposer, uint16 sellerBps)',
  'event SplitSettled(bytes32 indexed dealId, uint16 sellerBps, uint256 toSeller, uint256 toBuyer)',
  'event TranchePaid(bytes32 indexed dealId, uint8 tranche, uint256 sellerAmount, uint256 fee, bool byClaim)',
  'event TrancheRuled(bytes32 indexed dealId, uint8 tranche, uint16 sellerBps, uint256 toSeller, uint256 toBuyer)',
]);

export const agreementEscrowAbi = [...agreementEscrowContractAbi, ...agreementLibraryEventsAbi] as const;
