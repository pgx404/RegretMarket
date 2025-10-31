import React, { useState, useEffect } from 'react';
import { useRegretMarket } from './../regretMarket/api';
import type { TraderBalance, PositionData } from './../regretMarket/api';
import styles from './portfolio.module.css';
import OpenPositionModal from './../components/OpenPositionModal';
import usdc from "./../assets/usdc.svg"

// Utility to convert Solana slot to Unix timestamp
// Solana slots are approximately 400ms each, genesis was around Sept 2020
const SOLANA_GENESIS_TIMESTAMP = 1599829200; // Approximate Sept 2020
const SLOT_DURATION_MS = 400;

function slotToTimestamp(slot: number): number | null {
	if (!slot || slot === 0) return null;
	return SOLANA_GENESIS_TIMESTAMP + Math.floor((slot * SLOT_DURATION_MS) / 1000);
}

function formatTimestamp(timestamp: number | null): string {
	if (!timestamp) return 'N/A';
	return new Date(timestamp * 1000).toLocaleString();
}

interface PriceData {
	[pair: string]: {
		price: number;
		loading: boolean;
		error: string | null;
	};
}

const Portfolio: React.FC = () => {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [prices, setPrices] = useState<PriceData>({});

	const {
		trader,
		traderBalances,
		userPositions,
		register,
		markets,
	} = useRegretMarket();

	// Fetch prices for all active positions
	useEffect(() => {
		const activePositions = userPositions.data?.filter(p => p.closedAt === 0) || [];

		if (activePositions.length === 0 || !markets.data) return;

		// Get unique pairs from active positions
		const pairs = [...new Set(activePositions.map(p => p.pair))];

		const fetchPrices = async () => {
			for (const pair of pairs) {
				// Find market data for this pair
				const market = markets.data.find(m => m.pair === pair);
				if (!market) continue;

				// Set loading state
				setPrices(prev => ({
					...prev,
					[pair]: { price: prev[pair]?.price || 0, loading: true, error: null }
				}));

				try {
					// Ensure feedId has 0x prefix
					const feedId = market.feedId.startsWith('0x')
						? market.feedId
						: `0x${market.feedId}`;

					const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`;
					const response = await fetch(url);

					if (!response.ok) {
						throw new Error(`Pyth API error: ${response.status}`);
					}

					const data = await response.json();

					if (data.parsed && data.parsed.length > 0) {
						const priceData = data.parsed[0].price;
						const price = parseFloat(priceData.price) * Math.pow(10, priceData.expo);

						setPrices(prev => ({
							...prev,
							[pair]: { price, loading: false, error: null }
						}));
					}
				} catch (error) {
					console.error(`Failed to fetch price for ${pair}:`, error);
					setPrices(prev => ({
						...prev,
						[pair]: {
							price: prev[pair]?.price || 0,
							loading: false,
							error: 'Failed to fetch price'
						}
					}));
				}
			}
		};

		// Initial fetch
		fetchPrices();

		// Refresh prices every 10 seconds
		const interval = setInterval(fetchPrices, 10000);
		return () => clearInterval(interval);
	}, [userPositions.data, markets.data]);

	// Calculate PnL for a position
	const calculatePnL = (position: PositionData): { pnl: number; pnlPercent: number } => {
		const currentPrice = prices[position.pair]?.price || position.currentPrice;

		if (position.isLong) {
			// For LONG: PnL = (current_price - entry_price) * size
			const pnl = (currentPrice - position.actualEnteredPrice) * position.actualSize;
			const pnlPercent = ((currentPrice - position.actualEnteredPrice) / position.actualEnteredPrice) * 100;
			return { pnl, pnlPercent };
		} else {
			// For SHORT: PnL = (entry_price - current_price) * size
			const pnl = (position.actualEnteredPrice - currentPrice) * position.actualSize;
			const pnlPercent = ((position.actualEnteredPrice - currentPrice) / position.actualEnteredPrice) * 100;
			return { pnl, pnlPercent };
		}
	};

	// Calculate total portfolio PnL
	const calculateTotalPnL = (): { totalPnL: number; totalPnLPercent: number } => {
		const activePositions = userPositions.data?.filter(p => p.closedAt === 0) || [];

		if (activePositions.length === 0) {
			return { totalPnL: 0, totalPnLPercent: 0 };
		}

		const totalCollateral = activePositions.reduce((sum, pos) => sum + pos.collateral, 0);
		const totalPnL = activePositions.reduce((sum, pos) => {
			const { pnl } = calculatePnL(pos);
			return sum + pnl;
		}, 0);

		const totalPnLPercent = totalCollateral > 0 ? (totalPnL / totalCollateral) * 100 : 0;

		return { totalPnL, totalPnLPercent };
	};

	const handleRegister = async () => {
		try {
			await register.mutateAsync({ tokenMint: 'USDC' });
		} catch (error) {
			console.error('Registration failed:', error);
		}
	};

	// Show registration prompt if trader is not available
	if (trader.isLoading) {
		return (
			<div className={styles.container}>
				<div className={styles.loading}>
					<div className={styles.spinner}></div>
					<p>Loading your portfolio... 🚀</p>
				</div>
			</div>
		);
	}

	if (!trader.data) {
		return (
			<div className={styles.container}>
				<div className={styles.registerPrompt}>
					<h1 className={styles.memeTitle}>👋 GM Degen!</h1>
					<p className={styles.memeSubtitle}>Looks like you're new here...</p>
					<p className={styles.registerText}>
						Register to start your journey to either the moon 🌙 or getting REKT 💀
					</p>
					<button
						className={styles.registerBtn}
						onClick={handleRegister}
						disabled={register.isPending}
					>
						{register.isPending ? 'Registering...' : 'Register Now (No Rug, We Promise) 🤝'}
					</button>
				</div>
			</div>
		);
	}

	const activePositions = userPositions.data?.filter(p => p.closedAt === 0) || [];
	const closedPositions = userPositions.data?.filter(p => p.closedAt !== 0) || [];
	const { totalPnL, totalPnLPercent } = calculateTotalPnL();

	return (
		<div className={styles.container}>
			{/* Open Position Modal */}
			<OpenPositionModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />

			<header className={styles.header}>
				<h1 className={styles.title}>💼 Your RegretMarket Portfolio</h1>
				<p className={styles.subtitle}>Where dreams are made... or destroyed 📉📈</p>
			</header>

			{/* Portfolio Summary */}
			{activePositions.length > 0 && (
				<section className={styles.summarySection}>
					<div className={styles.summaryCard}>
						<h3 className={styles.summaryTitle}>📊 Portfolio Summary</h3>
						<div className={styles.summaryGrid}>
							<div className={styles.summaryItem}>
								<span className={styles.summaryLabel}>Total PnL:</span>
								<div className={styles.summaryValueWrapper}>
									<img src={usdc} alt="USDC" className={styles.summaryIcon} />
									<span className={`${styles.summaryValue} ${totalPnL >= 0 ? styles.profit : styles.loss}`}>
										{totalPnL >= 0 ? '+' : ''}{totalPnL >= 0 ? '🚀 ' : '💀 '}${Math.abs(totalPnL).toFixed(2)}
									</span>
								</div>
							</div>
							<div className={styles.summaryItem}>
								<span className={styles.summaryLabel}>Total PnL %:</span>
								<span className={`${styles.summaryValue} ${totalPnLPercent >= 0 ? styles.profit : styles.loss}`}>
									{totalPnLPercent >= 0 ? '+' : ''}{totalPnLPercent.toFixed(2)}%
								</span>
							</div>
							<div className={styles.summaryItem}>
								<span className={styles.summaryLabel}>Active Positions:</span>
								<span className={styles.summaryValue}>{activePositions.length}</span>
							</div>
						</div>
					</div>
				</section>
			)}

			{/* Balances Section */}
			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>💰 Your Bags</h2>
				<div className={styles.balanceGrid}>
					{traderBalances.isLoading ? (
						<div className={styles.loadingCard}>Loading balances...</div>
					) : traderBalances.data && traderBalances.data.length > 0 ? (
						traderBalances.data.map((balance: TraderBalance) => (
							<div key={balance.publicKey.toString()} className={styles.balanceCard}>
								<div className={styles.balanceHeader}>
									<div className={styles.tokenInfo}>
										<img
											src={usdc}
											alt="USDC"
											className={styles.tokenLogo}
										/>
										<span className={styles.tokenName}>USDC</span>
									</div>
								</div>
								<div className={styles.balanceAmount}>
									<div className={styles.balanceRow}>
										<span className={styles.label}>Total:</span>
										<span className={styles.value}>${(balance.balance / 1000000).toLocaleString()}</span>
									</div>
									<div className={styles.balanceRow}>
										<span className={styles.label}>Locked:</span>
										<span className={styles.valueLocked}>${(balance.lockedBalance / 1000000).toLocaleString()}</span>
									</div>
									<div className={styles.balanceRow}>
										<span className={styles.label}>Available:</span>
										<span className={styles.valueAvailable}>${(balance.availableBalance / 1000000).toLocaleString()}</span>
									</div>
								</div>
							</div>
						))
					) : (
						<div className={styles.emptyState}>
							<p>No funds yet... Time to deposit some! 💸</p>
						</div>
					)}
				</div>
			</section>

			{/* Active Positions Section */}
			<section className={styles.section}>
				<div className={styles.sectionHeader}>
					<h2 className={styles.sectionTitle}>🔥 Active Positions ({activePositions.length})</h2>
					<button
						className={styles.openPositionBtn}
						onClick={() => setIsModalOpen(true)}
					>
						Open Position 🚀
					</button>
				</div>

				<div className={styles.positionsContainer}>
					{userPositions.isLoading ? (
						<div className={styles.loadingCard}>Loading positions...</div>
					) : activePositions.length > 0 ? (
						activePositions.map((position: PositionData) => {
							const { pnl, pnlPercent } = calculatePnL(position);
							const currentPrice = prices[position.pair]?.price || position.currentPrice;
							const priceLoading = prices[position.pair]?.loading;

							return (
								<div key={position.publicKey.toString()} className={styles.positionCard}>
									<div className={styles.positionHeader}>
										<div className={styles.positionPair}>
											<span className={styles.pairText}>{position.pair}</span>
											<span className={position.isLong ? styles.longBadge : styles.shortBadge}>
												{position.isLong ? '📈 LONG' : '📉 SHORT'}
											</span>
										</div>
										<div className={styles.positionId}>#{position.positionId}</div>
									</div>

									<div className={styles.positionBody}>
										<div className={styles.positionRow}>
											<span className={styles.label}>Collateral:</span>
											<span className={styles.value}>${position.collateral.toLocaleString()}</span>
										</div>
										<div className={styles.positionRow}>
											<span className={styles.label}>Size:</span>
											<span className={styles.value}>{position.actualSize.toFixed(6)} tokens</span>
										</div>
										<div className={styles.positionRow}>
											<span className={styles.label}>Entry Price:</span>
											<span className={styles.value}>${position.actualEnteredPrice.toLocaleString()}</span>
										</div>
										<div className={styles.positionRow}>
											<span className={styles.label}>Current Price:</span>
											<span className={styles.value}>
												{priceLoading ? (
													<span className={styles.priceLoading}>
														<span className={styles.miniSpinner}></span> Loading...
													</span>
												) : (
													`$${currentPrice.toLocaleString(undefined, {
														minimumFractionDigits: 2,
														maximumFractionDigits: 2
													})}`
												)}
											</span>
										</div>
										<div className={styles.positionRow}>
											<span className={styles.label}>Position Value:</span>
											<span className={styles.value}>
												${(currentPrice * position.actualSize).toLocaleString(undefined, {
													minimumFractionDigits: 2,
													maximumFractionDigits: 2
												})}
											</span>
										</div>
										<div className={styles.positionRow}>
											<span className={styles.label}>Leverage:</span>
											<span className={styles.leverageValue}>{position.leverage.toFixed(2)}x</span>
										</div>

										{/* PnL Section */}
										<div className={styles.pnlSection}>
											<div className={styles.pnlRow}>
												<span className={styles.pnlLabel}>Unrealized PnL:</span>
												<div className={styles.pnlValueWrapper}>
													<img src={usdc} alt="USDC" className={styles.pnlIcon} />
													<span className={`${styles.pnlValue} ${pnl >= 0 ? styles.profit : styles.loss}`}>
														{pnl >= 0 ? '+' : ''}{pnl >= 0 ? '🚀 ' : '💀 '}${Math.abs(pnl).toFixed(2)}
													</span>
												</div>
											</div>
											<div className={styles.pnlRow}>
												<span className={styles.pnlLabel}>PnL %:</span>
												<span className={`${styles.pnlPercent} ${pnlPercent >= 0 ? styles.profit : styles.loss}`}>
													{pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
												</span>
											</div>
										</div>

										<div className={styles.positionRow}>
											<span className={styles.label}>Opened:</span>
											<span className={styles.valueSmall}>
												{formatTimestamp(slotToTimestamp(position.enteredAt))}
											</span>
										</div>
									</div>
								</div>
							);
						})
					) : (
						<div className={styles.emptyState}>
							<p>No active positions... NGMI? 😢</p>
							<p className={styles.emptyHint}>Click "Open Position" to start trading!</p>
						</div>
					)}
				</div>
			</section>

			{/* Closed Positions Section */}
			{closedPositions.length > 0 && (
				<section className={styles.section}>
					<h2 className={styles.sectionTitle}>📜 Position History ({closedPositions.length})</h2>

					<div className={styles.positionsContainer}>
						{closedPositions.map((position: PositionData) => (
							<div key={position.publicKey.toString()} className={styles.positionCardClosed}>
								<div className={styles.positionHeader}>
									<div className={styles.positionPair}>
										<span className={styles.pairText}>{position.pair}</span>
										<span className={position.isLong ? styles.longBadge : styles.shortBadge}>
											{position.isLong ? '📈 LONG' : '📉 SHORT'}
										</span>
									</div>
									<div className={styles.positionId}>#{position.positionId}</div>
								</div>

								<div className={styles.positionBody}>
									<div className={styles.positionRow}>
										<span className={styles.label}>Collateral:</span>
										<span className={styles.value}>${position.collateral.toLocaleString()}</span>
									</div>
									<div className={styles.positionRow}>
										<span className={styles.label}>Size:</span>
										<span className={styles.value}>{position.actualSize.toFixed(6)} tokens</span>
									</div>
									<div className={styles.positionRow}>
										<span className={styles.label}>Entry Price:</span>
										<span className={styles.value}>${position.actualEnteredPrice.toLocaleString()}</span>
									</div>
									<div className={styles.positionRow}>
										<span className={styles.label}>Final Price:</span>
										<span className={styles.value}>${position.currentPrice.toLocaleString()}</span>
									</div>
									<div className={styles.positionRow}>
										<span className={styles.label}>Closed:</span>
										<span className={styles.valueSmall}>
											{formatTimestamp(slotToTimestamp(position.closedAt))}
										</span>
									</div>
								</div>
							</div>
						))}
					</div>
				</section>
			)}

			{/* Footer Stats */}
			<footer className={styles.footer}>
				<div className={styles.stat}>
					<span className={styles.statLabel}>Total Positions:</span>
					<span className={styles.statValue}>{trader.data.positionCount}</span>
				</div>
				<div className={styles.stat}>
					<span className={styles.statLabel}>Currently Active:</span>
					<span className={styles.statValue}>{trader.data.activePosition}</span>
				</div>
				<div className={styles.stat}>
					<span className={styles.statLabel}>Privacy Mode:</span>
					<span className={styles.statValue}>{trader.data.privacy ? '🔒 ON' : '👀 OFF'}</span>
				</div>
			</footer>
		</div>
	);
};

export default Portfolio;
