import { getRegretMarketProgram, getRegretMarketProgramId } from "./../utils/regretMarket";
import { type Cluster, PublicKey, SystemProgram } from '@solana/web3.js'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { PythSolanaReceiver } from "@pythnetwork/pyth-solana-receiver";
import { HermesClient } from "@pythnetwork/hermes-client";
import BN from "bn.js";
import { useCluster } from "../contexts/UseCluster";
import { useAnchorProvider } from "../useAnchorProvider";

// IMPORTANT DECIMAL CONSTANTS
// All USD values (collateral, prices) use 6 decimals
const USD_DECIMALS = 6;
const USD_MULTIPLIER = Math.pow(10, USD_DECIMALS); // 1_000_000

// Pyth Hermes endpoints (works for all networks!)
const HERMES_ENDPOINTS = {
	"mainnet-beta": "https://hermes.pyth.network",
	devnet: "https://hermes.pyth.network",
	testnet: "https://hermes.pyth.network",
	custom: "https://hermes.pyth.network",
};

export interface ConfigData {
	isPaused: boolean;
	bump: number;
	admin: PublicKey;
	maxLeverage: number;
	liquidationFee: number;
	maintainanceMargin: number;
	openingFee: number;
	closingFee: number;
	privacyFee: number;
	protocolFeeShare: number;
	lastUpdated: number;
}

export interface VaultData {
	bump: number;
	isPaused: boolean;
	tokenMint: string;
	lpDeposit: number;
	totalLpShares: number;
	accumulatedLpFees: number;
	traderDeposit: number;
	traderCollateral: number;
	totalBorrowed: number;
	accumulatedFees: number;
	accumulatedLiquidationRewards: number;
}

export interface MarketData {
	publicKey: PublicKey;
	pair: string;
	feedId: string;
	decimals: number;
	totalActivePositions: number;
	isPaused: boolean;
	bump: number;
}

export interface PositionData {
	publicKey: PublicKey;
	positionId: number;
	pair: string;
	tokenMint: string;
	isLong: boolean;
	enteredAt: number;
	closedAt: number;
	collateral: number; // In human-readable USD (e.g., 1000 = $1,000)
	actualSize: number; // In human-readable token amount (e.g., 1 = 1 BTC)
	desiredSize: number; // In human-readable token amount
	actualEnteredPrice: number; // In human-readable USD per token (e.g., 50000 = $50,000)
	desiredEntryPrice: number; // In human-readable USD per token
	currentTargetPrice: number; // In human-readable USD per token
	currentPrice: number; // In human-readable USD per token
	positionValue: number; // In human-readable USD
	leverage: number; // In basis points (10000 = 1x)
	lastFundingSlot: number;
	cumulativeFundingPaid: number; // In human-readable USD
	lastUpdated: number;
	bump: number;
}

export interface TraderData {
	bump: number;
	privacy: boolean;
	positionCount: number;
	activePosition: number;
}

export interface TraderBalance {
	publicKey: PublicKey;
	tokenMint: string;
	balance: number; // In human-readable USD
	lockedBalance: number; // In human-readable USD
	availableBalance: number; // In human-readable USD
	bump: number;
}

export function useRegretMarket() {
	const { cluster } = useCluster()
	const provider = useAnchorProvider()

	const programId = useMemo(() => getRegretMarketProgramId(cluster.name as Cluster), [cluster])
	const program = useMemo(() => getRegretMarketProgram(provider, programId), [provider, programId])

	const [configPDA] = useMemo(() =>
		PublicKey.findProgramAddressSync(
			[Buffer.from('config')],
			programId
		),
		[programId]
	);

	// ============================================================================
	// CONFIG QUERIES AND MUTATIONS
	// ============================================================================

	const config = useQuery({
		queryKey: ["config", { cluster }],
		queryFn: async () => {
			const configAccount = await program.account.config.fetch(configPDA);
			return {
				isPaused: configAccount.isPaused,
				bump: configAccount.bump,
				admin: configAccount.admin,
				maxLeverage: Number(configAccount.maxLeverage),
				liquidationFee: Number(configAccount.liquidationFee),
				maintainanceMargin: Number(configAccount.maintainanceMargin),
				openingFee: Number(configAccount.openingFee),
				closingFee: Number(configAccount.closingFee),
				privacyFee: Number(configAccount.privacyFee),
				protocolFeeShare: Number(configAccount.protocolFeeShare),
				lastUpdated: Number(configAccount.lastUpdated),
			} as ConfigData;
		},
	})

	const isAdmin = (caller: PublicKey | null): boolean => {
		if (!caller || !config.data?.admin) return false
		return config.data.admin.equals(caller)
	}

	// ============================================================================
	// VAULT QUERIES AND MUTATIONS
	// ============================================================================

	const vaults = useQuery({
		queryKey: ["vaults", { cluster }],
		queryFn: async () => {
			const accounts = await program.account.vault.all();

			return accounts.map((account): VaultData => {
				const vault = account.account;

				// Note: Vault stores token amounts directly, no decimals conversion needed
				// since the smart contract handles raw token amounts
				return {
					bump: vault.bump,
					isPaused: vault.isPaused,
					tokenMint: vault.tokenMint,
					lpDeposit: Number(vault.lpDeposit),
					totalLpShares: Number(vault.totalLpShares),
					accumulatedLpFees: Number(vault.accumulatedLpFees),
					traderDeposit: Number(vault.traderDeposit),
					traderCollateral: Number(vault.traderCollateral),
					totalBorrowed: Number(vault.totalBorrowed),
					accumulatedFees: Number(vault.accumulatedFees),
					accumulatedLiquidationRewards: Number(vault.accumulatedLiquidationRewards),
				};
			});
		},
		refetchInterval: 30000,
	});

	const createPool = useMutation({
		mutationKey: ["createPool", "update", { cluster }],
		mutationFn: async ({ tokenMint }: { tokenMint: string }) => {
			if (!provider.wallet.publicKey) throw new Error("Wallet not connected");

			return program.methods.createPool(tokenMint).accounts({
				config: configPDA,
				signer: provider.wallet.publicKey,
				systemProgram: SystemProgram.programId,
			}).rpc()
		},
		onSuccess: (signature) => {
			console.log("Create pool signature:", signature);
			vaults.refetch();
		},
		onError: (error) => {
			console.error(error.message);
		},
	})

	// ============================================================================
	// MARKET QUERIES AND MUTATIONS
	// ============================================================================

	const markets = useQuery({
		queryKey: ["markets", { cluster }],
		queryFn: async () => {
			const accounts = await program.account.market.all();

			return accounts.map((account): MarketData => ({
				publicKey: account.publicKey,
				pair: account.account.pair,
				feedId: account.account.feedId,
				decimals: account.account.decimals,
				totalActivePositions: Number(account.account.totalActivePositions),
				isPaused: account.account.isPaused,
				bump: account.account.bump,
			}));
		},
		refetchInterval: 30000,
	});

	const getMarket = (pair: string): MarketData => {
		const market = markets.data?.find(m => m.pair === pair);
		if (!market) {
			throw new Error(`Market not found for pair: ${pair}`);
		}
		return market;
	};

	const getFeedId = (pair: string): string => {
		return getMarket(pair).feedId;
	};

	const getTokenDecimals = (pair: string): number => {
		return getMarket(pair).decimals;
	};

	const openMarket = useMutation({
		mutationKey: ["openMarket", "update", { cluster }],
		mutationFn: async ({
			tokenMint,
			pair,
			decimals,
			feedId,
		}: {
			tokenMint: string;
			pair: string;
			decimals: number;
			feedId: string;
		}) => {
			if (!provider.wallet.publicKey) throw new Error("Wallet not connected");

			const [poolPda] = PublicKey.findProgramAddressSync(
				[Buffer.from("vault"), Buffer.from(tokenMint)],
				program.programId
			);

			return program.methods
				.openMarket(tokenMint, pair, decimals, feedId)
				.accounts({
					config: configPDA,
					signer: provider.wallet.publicKey,
					pool: poolPda,
					systemProgram: SystemProgram.programId,
				})
				.rpc();
		},
		onSuccess: (signature) => {
			console.log("Open market signature:", signature);
			markets.refetch();
		},
		onError: (error) => {
			console.error(error);
		},
	});

	const updateMarket = useMutation({
		mutationKey: ["updateMarket", { cluster }],
		mutationFn: async ({
			pair,
			feedId,
		}: {
			pair: string;
			feedId?: string;
		}) => {
			if (!provider.wallet.publicKey) throw new Error("Wallet not connected");

			return program.methods
				.updateMarket(pair, feedId || null)
				.accounts({
					config: configPDA,
					signer: provider.wallet.publicKey,
				})
				.rpc();
		},
		onSuccess: (signature) => {
			console.log("Update market signature:", signature);
			markets.refetch();
		},
		onError: (error) => {
			console.error(error);
		},
	});

	// ============================================================================
	// TRADER QUERIES AND MUTATIONS
	// ============================================================================

	const trader = useQuery({
		queryKey: ["trader", provider.wallet.publicKey?.toString(), { cluster }],
		queryFn: async () => {
			if (!provider.wallet.publicKey) throw new Error("Wallet not connected");

			try {
				const [traderPDA] = PublicKey.findProgramAddressSync(
					[Buffer.from('trader'), provider.wallet.publicKey.toBuffer()],
					programId
				);

				const traderAccount = await program.account.trader.fetch(traderPDA);

				return {
					bump: traderAccount.bump,
					privacy: traderAccount.privacy,
					positionCount: Number(traderAccount.positionCount),
					activePosition: Number(traderAccount.activePosition),
				} as TraderData;
			} catch (error) {
				return null;
			}
		},
		enabled: !!provider.wallet.publicKey,
		refetchInterval: 30000,
	});

	const register = useMutation({
		mutationKey: ["register", "update", { cluster }],
		mutationFn: async ({ tokenMint }: { tokenMint: string }) => {
			if (!provider.wallet.publicKey) throw new Error("Wallet not connected");

			const [poolPda] = PublicKey.findProgramAddressSync(
				[Buffer.from("vault"), Buffer.from(tokenMint)],
				program.programId
			);

			return program.methods.register(tokenMint).accounts({
				config: configPDA,
				signer: provider.wallet.publicKey,
				pool: poolPda,
				systemProgram: SystemProgram.programId,
			}).rpc();
		},
		onSuccess: (signature) => {
			console.log("Register signature:", signature);
			trader.refetch();
			traderBalances.refetch();
		},
		onError: (error) => {
			console.error(error);
		},
	});

	const claimVirtualBalance = useMutation({
		mutationKey: ["claimVirtualBalance", "update", { cluster }],
		mutationFn: async ({ tokenMint }: { tokenMint: string }) => {
			if (!provider.wallet.publicKey) throw new Error("Wallet not connected");

			const [poolPda] = PublicKey.findProgramAddressSync(
				[Buffer.from("vault"), Buffer.from(tokenMint)],
				program.programId
			);

			const [traderBalancePda] = PublicKey.findProgramAddressSync(
				[Buffer.from("trader_balance"), provider.wallet.publicKey.toBuffer(), Buffer.from(tokenMint)],
				program.programId
			);

			return program.methods.claimVirtualBalance(tokenMint).accounts({
				config: configPDA,
				signer: provider.wallet.publicKey,
				pool: poolPda,
				traderBalance: traderBalancePda,
			}).rpc();
		},
		onSuccess: (signature) => {
			console.log("Claim virtual balance signature:", signature);
			traderBalances.refetch();
		},
		onError: (error) => {
			console.error(error);
		},
	});

	// ============================================================================
	// TRADER BALANCE QUERIES
	// ============================================================================

	const traderBalances = useQuery({
		queryKey: ["traderBalances", provider.wallet.publicKey?.toString(), { cluster }],
		queryFn: async () => {
			if (!provider.wallet.publicKey) throw new Error("Wallet not connected");

			const accounts = await program.account.traderPoolDetail.all();

			const userAccounts = accounts.filter(account =>
				account.account.owner.toString() === provider.wallet.publicKey!.toString()
			);

			return userAccounts.map((account): TraderBalance => {
				const balance = Number(account.account.balance);
				const lockedBalance = Number(account.account.lockedBalance);
				return {
					publicKey: account.publicKey,
					tokenMint: account.account.tokenMint,
					balance: balance,
					lockedBalance: lockedBalance,
					availableBalance: balance - lockedBalance,
					bump: account.account.bump,
				};
			});
		},
		enabled: !!provider.wallet.publicKey,
		refetchInterval: 30000,
	});

	// ============================================================================
	// POSITION QUERIES AND MUTATIONS
	// ============================================================================

	const userPositions = useQuery({
		queryKey: ["userPositions", provider.wallet.publicKey?.toString(), { cluster }],
		queryFn: async () => {
			if (!provider.wallet.publicKey) throw new Error("Wallet not connected");

			const accounts = await program.account.position.all([
				{
					memcmp: {
						offset: 8 + 1, // After discriminator + bump
						bytes: provider.wallet.publicKey.toBase58(),
					},
				},
			]);

			return accounts.map((account): PositionData => {
				const market = markets.data?.find(m => m.pair === account.account.pair);
				const tokenDecimals = market?.decimals || 18;

				return {
					publicKey: account.publicKey,
					positionId: Number(account.account.positionId),
					pair: account.account.pair,
					tokenMint: account.account.tokenMint,
					isLong: account.account.isLong,
					enteredAt: Number(account.account.enteredAt),
					closedAt: Number(account.account.closedAt),
					// USD values - use 6 decimals
					collateral: Number(account.account.collateral) / USD_MULTIPLIER,
					actualEnteredPrice: Number(account.account.actualEnteredPrice) / USD_MULTIPLIER,
					desiredEntryPrice: Number(account.account.desiredEntryPrice) / USD_MULTIPLIER,
					currentTargetPrice: Number(account.account.currentTargetPrice) / USD_MULTIPLIER,
					currentPrice: Number(account.account.currentPrice) / USD_MULTIPLIER,
					positionValue: Number(account.account.positionValue) / USD_MULTIPLIER,
					cumulativeFundingPaid: Number(account.account.cumulativeFundingPaid) / USD_MULTIPLIER,
					// Token amounts - convert from token's native decimals
					actualSize: Number(account.account.actualSize) / Math.pow(10, tokenDecimals),
					desiredSize: Number(account.account.desiredSize) / Math.pow(10, tokenDecimals),
					// Leverage in basis points
					leverage: Number(account.account.leverage) / 10_000,
					// Other fields
					lastFundingSlot: Number(account.account.lastFundingSlot),
					lastUpdated: Number(account.account.lastUpdated),
					bump: account.account.bump,
				};
			});
		},
		enabled: !!provider.wallet.publicKey && !!markets.data,
		refetchInterval: 30000,
	});

	const openPosition = useMutation({
		mutationKey: ["openPosition", { cluster }],
		mutationFn: async ({
			tokenMint,
			pair,
			desiredSize,
			desiredEntryPrice,
			collateral,
			isLong,
		}: {
			tokenMint: string;
			pair: string;
			desiredSize: number;       // Human-readable value (e.g., 0.1, 1.5)
			desiredEntryPrice: number; // Human-readable value (e.g., 150.50)
			collateral: number;        // Human-readable value (e.g., 100)
			isLong: boolean;
		}) => {
			if (!provider.wallet.publicKey) throw new Error("Wallet not connected");

			// Validate inputs before any calculations
			if (!tokenMint || typeof tokenMint !== 'string') {
				throw new Error("Invalid token mint");
			}
			if (!pair || typeof pair !== 'string') {
				throw new Error("Invalid pair");
			}
			if (typeof desiredSize !== 'number' || !isFinite(desiredSize) || desiredSize <= 0) {
				throw new Error(`Invalid desired size: ${desiredSize}`);
			}
			if (typeof desiredEntryPrice !== 'number' || !isFinite(desiredEntryPrice) || desiredEntryPrice <= 0) {
				throw new Error(`Invalid desired entry price: ${desiredEntryPrice}`);
			}
			if (typeof collateral !== 'number' || !isFinite(collateral) || collateral <= 0) {
				throw new Error(`Invalid collateral: ${collateral}`);
			}

			const feedId = getFeedId(pair);
			const tokenDecimals = getTokenDecimals(pair);
			const hermesUrl = HERMES_ENDPOINTS[cluster.network as keyof typeof HERMES_ENDPOINTS] || HERMES_ENDPOINTS["custom"];

			// Constants for decimals
			const COLLATERAL_DECIMALS = 6;  // USDC/USD always uses 6 decimals
			const PRICE_DECIMALS = 6;        // Price always uses 6 decimals

			// Helper function to convert float to BN with proper scaling
			const floatToBN = (value: number, decimals: number): BN => {
				// Convert to string with enough precision to avoid scientific notation
				let str = value.toString();

				// Handle scientific notation (e.g., 1.5e-7)
				if (str.includes('e')) {
					const [mantissa, exponent] = str.split('e');
					const exp = parseInt(exponent);

					if (exp < 0) {
						// Negative exponent: move decimal left
						const [intPart, decPart = ''] = mantissa.split('.');
						str = '0.' + '0'.repeat(Math.abs(exp) - 1) + intPart + decPart;
					} else {
						// Positive exponent: move decimal right
						const [intPart, decPart = ''] = mantissa.split('.');
						const zerosToAdd = exp - decPart.length;
						if (zerosToAdd >= 0) {
							str = intPart + decPart + '0'.repeat(zerosToAdd);
						} else {
							str = intPart + decPart.slice(0, exp) + '.' + decPart.slice(exp);
						}
					}
				}

				// Split into integer and decimal parts
				const [intPart = '0', decPart = ''] = str.split('.');

				// Pad or truncate decimal part to required length
				let paddedDec = decPart.padEnd(decimals, '0');
				if (paddedDec.length > decimals) {
					paddedDec = paddedDec.slice(0, decimals);
				}

				// Combine and create BN (remove leading zeros but keep at least one digit)
				const combined = (intPart || '0') + paddedDec;
				const cleaned = combined.replace(/^0+/, '') || '0';

				return new BN(cleaned);
			};

			// Convert amounts to BN with proper scaling
			let collateralBN: BN;
			let desiredEntryPriceBN: BN;
			let desiredSizeBN: BN;

			try {
				// Collateral: human value (e.g., 100) -> 100000000 (6 decimals)
				collateralBN = floatToBN(collateral, COLLATERAL_DECIMALS);

				// Entry price: human value (e.g., 150.50) -> 150500000 (6 decimals)
				desiredEntryPriceBN = floatToBN(desiredEntryPrice, PRICE_DECIMALS);

				// Desired size: human value (e.g., 0.1) -> token's smallest unit
				desiredSizeBN = floatToBN(desiredSize, tokenDecimals);

				console.log("Converted values:", {
					pair,
					tokenDecimals,
					input: {
						collateral,
						desiredEntryPrice,
						desiredSize,
					},
					output: {
						collateral: collateralBN.toString(),
						desiredEntryPrice: desiredEntryPriceBN.toString(),
						desiredSize: desiredSizeBN.toString(),
					},
					humanReadable: {
						collateral: `${collateral} USDC`,
						desiredEntryPrice: `$${desiredEntryPrice}`,
						desiredSize: `${desiredSize} tokens`,
					}
				});
			} catch (error) {
				throw new Error(`Failed to convert values to BN: ${error}`);
			}

			// Derive trader PDA
			const [traderPda] = PublicKey.findProgramAddressSync(
				[Buffer.from("trader"), provider.wallet.publicKey.toBuffer()],
				program.programId
			);

			// Get position ID
			let positionId = 0;
			try {
				const traderAccount = await program.account.trader.fetch(traderPda);
				positionId = traderAccount.positionCount.toNumber();
			} catch (e) {
				console.log("Trader account not found, using position ID 0");
				positionId = 0;
			}

			// Validate position ID
			if (!isFinite(positionId) || positionId < 0) {
				throw new Error(`Invalid position ID: ${positionId}`);
			}

			const positionIdBN = new BN(positionId);

			// Derive all required PDAs
			const [configPda] = PublicKey.findProgramAddressSync(
				[Buffer.from("config")],
				program.programId
			);

			const [traderBalancePda] = PublicKey.findProgramAddressSync(
				[Buffer.from("trader_balance"), provider.wallet.publicKey.toBuffer(), Buffer.from(tokenMint)],
				program.programId
			);

			const [marketPda] = PublicKey.findProgramAddressSync(
				[Buffer.from("market"), Buffer.from(pair)],
				program.programId
			);

			const [poolPda] = PublicKey.findProgramAddressSync(
				[Buffer.from("vault"), Buffer.from(tokenMint)],
				program.programId
			);

			const [positionPda] = PublicKey.findProgramAddressSync(
				[
					Buffer.from("position"),
					Buffer.from(pair),
					provider.wallet.publicKey.toBuffer(),
					positionIdBN.toArrayLike(Buffer, 'le', 8)
				],
				program.programId
			);

			// Fetch price updates from Hermes
			const hermesClient = new HermesClient(hermesUrl);
			const priceUpdates = await hermesClient.getLatestPriceUpdates([feedId], { encoding: "base64" });

			if (!priceUpdates?.binary?.data) {
				throw new Error("No price data available from Pyth");
			}

			const priceUpdateData = priceUpdates.binary.data;

			// Create Pyth Solana Receiver
			const pythSolanaReceiver = new PythSolanaReceiver({
				connection: provider.connection,
				wallet: provider.wallet as any,
			});

			// Use the transaction builder
			const transactionBuilder = pythSolanaReceiver.newTransactionBuilder({
				closeUpdateAccounts: true,
			});

			// Add price update posting instructions
			await transactionBuilder.addPostPriceUpdates(priceUpdateData);

			// Debug log before creating instruction
			console.log("Creating instruction with:", {
				tokenMint,
				pair,
				positionId: positionIdBN.toString(),
				desiredSize: desiredSizeBN.toString(),
				desiredEntryPrice: desiredEntryPriceBN.toString(),
				collateral: collateralBN.toString(),
				isLong
			});

			// Add open position instruction
			await transactionBuilder.addPriceConsumerInstructions(
				async (getPriceUpdateAccount) => {
					const priceUpdateAccount = getPriceUpdateAccount(feedId);

					const instruction = await program.methods
						.openPosition(
							tokenMint,
							pair,
							positionIdBN,
							desiredSizeBN,
							desiredEntryPriceBN,
							collateralBN,
							isLong
						)
						.accounts({
							config: configPda,
							signer: provider.wallet.publicKey,
							trader: traderPda,
							traderBalance: traderBalancePda,
							pool: poolPda,
							market: marketPda,
							position: positionPda,
							priceUpdate: priceUpdateAccount,
							systemProgram: SystemProgram.programId,
						})
						.instruction();

					return [{ instruction, signers: [] }];
				}
			);

			// Build transactions
			const transactions = await transactionBuilder.buildVersionedTransactions({
				computeUnitPriceMicroLamports: 50000,
			});

			// Send transactions manually
			const signatures = [];
			for (let i = 0; i < transactions.length; i++) {
				const txObject = transactions[i];
				const tx = txObject.tx;
				const signers = txObject.signers || [];

				if (signers.length > 0) {
					tx.sign(signers);
				}

				const signedTx = await provider.wallet.signTransaction(tx);

				const signature = await provider.connection.sendRawTransaction(
					signedTx.serialize(),
					{
						skipPreflight: false,
						preflightCommitment: 'confirmed',
					}
				);

				await provider.connection.confirmTransaction(signature, 'confirmed');
				signatures.push(signature);
			}

			return signatures[signatures.length - 1];
		},
		onSuccess: (signature) => {
			console.log("Open position signature:", signature);
			userPositions.refetch();
			traderBalances.refetch();
			trader.refetch();
			vaults.refetch();
		},
		onError: (error) => {
			console.error('Open position error:', error);
			// Show user-friendly error message
			if (error instanceof Error) {
				console.error('Error details:', error.message);
			}
		},
	});

	return {
		// Config
		config,
		isAdmin,

		// Vaults
		vaults,
		createPool,

		// Markets
		markets,
		openMarket,
		updateMarket,
		getMarket,
		getFeedId,
		getTokenDecimals,

		// Trader
		trader,
		register,
		claimVirtualBalance,

		// Trader Balances
		traderBalances,

		// Positions
		userPositions,
		openPosition,
	};
}
