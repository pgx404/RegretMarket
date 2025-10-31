import { type AnchorWallet, useWallet } from '@solana/wallet-adapter-react'
import { AnchorProvider } from '@coral-xyz/anchor'
import { Connection } from '@solana/web3.js'
import { useMemo } from 'react'
import { useCluster } from './contexts/UseCluster'

export function useAnchorProvider(): AnchorProvider {
	const { cluster } = useCluster()
	const wallet = useWallet()

	return useMemo(() => {
		// Create connection with versioned transaction support
		const connection = new Connection(cluster.endpoint, {
			commitment: 'confirmed',
		})

		// Override getTransaction to support versioned transactions
		const originalGetTransaction = connection.getTransaction.bind(connection);
		connection.getTransaction = async (signature: string, options?: any) => {
			return originalGetTransaction(signature, {
				...options,
				maxSupportedTransactionVersion: 0,
			});
		};

		return new AnchorProvider(connection, wallet as AnchorWallet, {
			commitment: 'confirmed',
		})
	}, [cluster.endpoint, wallet])
}
