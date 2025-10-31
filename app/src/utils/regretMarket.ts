// Here we export some useful types and functions for interacting with the Anchor program.
import { AnchorProvider, Program } from '@coral-xyz/anchor'
import { type Cluster, PublicKey } from '@solana/web3.js'
import RegretmarketIDL from '../idl/regret_market.json'
import type { RegretMarket } from '../types/regret_market'

// Re-export the generated IDL and type
export { type RegretMarket, RegretmarketIDL }

// The programId is imported from the program IDL.
export const REGRET_MARKET_PROGRAM_ID = new PublicKey(RegretmarketIDL.address)

// This is a helper function to get the Counter Anchor program.
export function getRegretMarketProgram(provider: AnchorProvider, address?: PublicKey): Program<RegretMarket> {
	return new Program({ ...RegretmarketIDL, address: address ? address.toBase58() : RegretmarketIDL.address } as RegretMarket, provider)
}

// This is a helper function to get the program ID for the Counter program depending on the cluster.
export function getRegretMarketProgramId(cluster: Cluster) {
	switch (cluster) {
		case 'devnet':
		case 'testnet':
		case 'mainnet-beta':
		default:
			return REGRET_MARKET_PROGRAM_ID
	}
}
