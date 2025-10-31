import React, { useState, useEffect } from 'react';
import { useRegretMarket } from './../regretMarket/api';
import type { MarketData } from './../regretMarket/api';
import styles from './market.module.css';

interface MarketPrice {
	[pair: string]: number;
}

const Markets: React.FC = () => {
	const { markets } = useRegretMarket();
	const [marketPrices, setMarketPrices] = useState<MarketPrice>({});
	const [loadingPrices, setLoadingPrices] = useState<{ [pair: string]: boolean }>({});

	console.log('Markets data:', markets.data);

	const fetchMarketPrice = async (market: MarketData) => {
		try {
			setLoadingPrices(prev => ({ ...prev, [market.pair]: true }));

			// Ensure feedId has 0x prefix
			const feedId = market.feedId.startsWith('0x') ? market.feedId : `0x${market.feedId}`;

			// Fetch price from Pyth Hermes API
			const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`;
			const response = await fetch(url);

			if (!response.ok) {
				throw new Error(`Pyth API error: ${response.status}`);
			}

			const data = await response.json();

			if (data.parsed && data.parsed.length > 0) {
				const priceData = data.parsed[0].price;
				const price = parseFloat(priceData.price) * Math.pow(10, priceData.expo);

				setMarketPrices(prev => ({ ...prev, [market.pair]: price }));
			}
		} catch (error) {
			console.error(`Failed to fetch price for ${market.pair}:`, error);
			setMarketPrices(prev => ({ ...prev, [market.pair]: 0 }));
		} finally {
			setLoadingPrices(prev => ({ ...prev, [market.pair]: false }));
		}
	};

	useEffect(() => {
		if (markets.data) {
			markets.data.forEach(market => {
				fetchMarketPrice(market);
			});

			// Refresh prices every 10 seconds
			const interval = setInterval(() => {
				markets.data.forEach(market => {
					fetchMarketPrice(market);
				});
			}, 10000);

			return () => clearInterval(interval);
		}
	}, [markets.data]);

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<h1 className={styles.title}>📊 Trading Markets</h1>
				<p className={styles.subtitle}>Choose your battlefield... I mean, market 🎯</p>
			</header>

			{/* Markets List */}
			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>
					🎰 Available Markets ({markets.data?.length || 0})
				</h2>

				<div className={styles.marketsGrid}>
					{markets.isLoading ? (
						<div className={styles.loadingCard}>
							<div className={styles.spinner}></div>
							<p>Loading markets... 📡</p>
						</div>
					) : markets.data && markets.data.length > 0 ? (
						markets.data.map((market: MarketData) => {
							const price = marketPrices[market.pair];
							const isPriceLoading = loadingPrices[market.pair];

							return (
								<div key={market.publicKey.toString()} className={styles.marketCard}>
									<div className={styles.marketHeader}>
										<div className={styles.pairInfo}>
											<h3 className={styles.pairName}>{market.pair}</h3>
											{market.isPaused && (
												<span className={styles.pausedBadge}>⏸️ PAUSED</span>
											)}
										</div>
										<div className={styles.priceInfo}>
											{isPriceLoading ? (
												<div className={styles.priceLoading}>
													<div className={styles.miniSpinner}></div>
												</div>
											) : (
												<>
													<span className={styles.priceLabel}>Price</span>
													<span className={styles.priceValue}>
														${price ? price.toLocaleString(undefined, {
															minimumFractionDigits: 2,
															maximumFractionDigits: 2
														}) : '—'}
													</span>
												</>
											)}
										</div>
									</div>

									<div className={styles.marketBody}>
										<div className={styles.marketRow}>
											<span className={styles.label}>Active Positions:</span>
											<span className={styles.value}>{market.totalActivePositions}</span>
										</div>
										<div className={styles.marketRow}>
											<span className={styles.label}>Decimals:</span>
											<span className={styles.value}>{market.decimals}</span>
										</div>
										<div className={styles.marketRow}>
											<span className={styles.label}>Feed ID:</span>
											<span className={styles.valueFeedId} title={market.feedId}>
												{market.feedId.slice(0, 8)}...{market.feedId.slice(-6)}
											</span>
										</div>
										<div className={styles.marketRow}>
											<span className={styles.label}>Address:</span>
											<span className={styles.valueAddress} title={market.publicKey.toString()}>
												{market.publicKey.toString().slice(0, 8)}...
											</span>
										</div>
									</div>

									<div className={styles.marketFooter}>
										<span className={styles.statusIndicator}>
											{market.isPaused ? '🔴 Not Trading' : '🟢 Live'}
										</span>
									</div>
								</div>
							);
						})
					) : (
						<div className={styles.emptyState}>
							<p>No markets available yet... 🏜️</p>
							<p className={styles.emptyHint}>
								Wait for markets to be created!
							</p>
						</div>
					)}
				</div>
			</section>

			{/* Market Stats */}
			{markets.data && markets.data.length > 0 && (
				<footer className={styles.footer}>
					<div className={styles.stat}>
						<span className={styles.statLabel}>Total Markets:</span>
						<span className={styles.statValue}>{markets.data.length}</span>
					</div>
					<div className={styles.stat}>
						<span className={styles.statLabel}>Active Markets:</span>
						<span className={styles.statValue}>
							{markets.data.filter(m => !m.isPaused).length}
						</span>
					</div>
					<div className={styles.stat}>
						<span className={styles.statLabel}>Total Positions:</span>
						<span className={styles.statValue}>
							{markets.data.reduce((sum, m) => sum + m.totalActivePositions, 0)}
						</span>
					</div>
				</footer>
			)}
		</div>
	);
};

export default Markets;
