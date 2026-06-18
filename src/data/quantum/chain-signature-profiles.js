/**
 * Chain signature profiles registry for Quantum Intelligence.
 *
 * Each profile captures the default signature scheme, EVM account model,
 * contract wallet / account-abstraction support, and post-quantum (PQ)
 * readiness status for the chains WalletWall currently supports.
 *
 * Semantics:
 *   - EVM EOA outgoing transaction activity implies ecdsa_secp256k1
 *     signature exposure observed.
 *   - Contract wallets (Safe, multisig, ERC-4337 AA) require separate
 *     analysis; they do not expose the ECDSA key of an EOA directly.
 *   - pqSupportStatus reflects whether standard wallet tooling supports
 *     a PQ migration path — not whether any given wallet has migrated.
 */

/**
 * @typedef {'evm_eoa_and_contract'} AccountModel
 * @typedef {'ecdsa_secp256k1'} SignatureScheme
 * @typedef {'signature_observed_on_first_outgoing_tx'} EoaSignatureExposureModel
 * @typedef {'not_standard_wallet_default' | 'research_only' | 'available'} PqSupportStatus
 */

/**
 * @typedef {Object} ChainSignatureProfile
 * @property {string}                   chain
 * @property {string}                   displayName
 * @property {AccountModel}             accountModel
 * @property {SignatureScheme}          defaultSignatureScheme
 * @property {EoaSignatureExposureModel} eoaSignatureExposureModel
 * @property {boolean}                  contractWalletSupport
 * @property {boolean}                  accountAbstractionSupport
 * @property {PqSupportStatus}          pqSupportStatus
 * @property {string}                   notes
 */

/** @type {Record<string, ChainSignatureProfile>} */
export const CHAIN_SIGNATURE_PROFILES = {
  ethereum: {
    chain: 'ethereum',
    displayName: 'Ethereum',
    accountModel: 'evm_eoa_and_contract',
    defaultSignatureScheme: 'ecdsa_secp256k1',
    eoaSignatureExposureModel: 'signature_observed_on_first_outgoing_tx',
    contractWalletSupport: true,
    accountAbstractionSupport: true,
    pqSupportStatus: 'not_standard_wallet_default',
    notes:
      'EVM mainnet. EOA outgoing transactions imply ecdsa_secp256k1 signature ' +
      'exposure. Contract wallets (Safe, ERC-4337 AA) require separate handling. ' +
      'No PQ migration path is a standard wallet default as of the registry date.',
  },

  base: {
    chain: 'base',
    displayName: 'Base',
    accountModel: 'evm_eoa_and_contract',
    defaultSignatureScheme: 'ecdsa_secp256k1',
    eoaSignatureExposureModel: 'signature_observed_on_first_outgoing_tx',
    contractWalletSupport: true,
    accountAbstractionSupport: true,
    pqSupportStatus: 'not_standard_wallet_default',
    notes:
      'OP Stack L2 by Coinbase. Inherits Ethereum EVM signature semantics. ' +
      'No PQ migration path is a standard wallet default as of the registry date.',
  },

  arbitrum: {
    chain: 'arbitrum',
    displayName: 'Arbitrum',
    accountModel: 'evm_eoa_and_contract',
    defaultSignatureScheme: 'ecdsa_secp256k1',
    eoaSignatureExposureModel: 'signature_observed_on_first_outgoing_tx',
    contractWalletSupport: true,
    accountAbstractionSupport: true,
    pqSupportStatus: 'not_standard_wallet_default',
    notes:
      'Arbitrum Nitro L2. Inherits Ethereum EVM signature semantics. ' +
      'No PQ migration path is a standard wallet default as of the registry date.',
  },

  optimism: {
    chain: 'optimism',
    displayName: 'Optimism',
    accountModel: 'evm_eoa_and_contract',
    defaultSignatureScheme: 'ecdsa_secp256k1',
    eoaSignatureExposureModel: 'signature_observed_on_first_outgoing_tx',
    contractWalletSupport: true,
    accountAbstractionSupport: true,
    pqSupportStatus: 'not_standard_wallet_default',
    notes:
      'OP Stack L2 by Optimism. Inherits Ethereum EVM signature semantics. ' +
      'No PQ migration path is a standard wallet default as of the registry date.',
  },

  polygon: {
    chain: 'polygon',
    displayName: 'Polygon',
    accountModel: 'evm_eoa_and_contract',
    defaultSignatureScheme: 'ecdsa_secp256k1',
    eoaSignatureExposureModel: 'signature_observed_on_first_outgoing_tx',
    contractWalletSupport: true,
    accountAbstractionSupport: true,
    pqSupportStatus: 'not_standard_wallet_default',
    notes:
      'Polygon PoS EVM chain. Inherits Ethereum EVM signature semantics. ' +
      'No PQ migration path is a standard wallet default as of the registry date.',
  },
};

/**
 * Look up a chain signature profile by chain identifier.
 * Returns null for unknown or unsupported chains.
 *
 * @param {string | null | undefined} chain
 * @returns {ChainSignatureProfile | null}
 */
export function getChainSignatureProfile(chain) {
  if (!chain || typeof chain !== 'string') return null;
  return CHAIN_SIGNATURE_PROFILES[chain.toLowerCase()] ?? null;
}

/**
 * List all registered chain signature profiles.
 *
 * @returns {ChainSignatureProfile[]}
 */
export function listChainSignatureProfiles() {
  return Object.values(CHAIN_SIGNATURE_PROFILES);
}
