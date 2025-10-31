import React from 'react';
import { useRegretMarket } from './../regretMarket/api';
import type { VaultData } from './../regretMarket/api';
import styles from './pool.module.css';
import usdc from '../assets/usdc.svg';

const Pools: React.FC = () => {
	const { vaults, } = useRegretMarket();


	const calculateUtilization = (vault: VaultData): number => {
		if (vault.lpDeposit === 0) return 0;
		return (vault.totalBorrowed / vault.lpDeposit) * 100;
	};

	const calculateTVL = (vault: VaultData): number => {
		return vault.lpDeposit + vault.traderDeposit;
	};

	return (
		<div className={styles.container}>
			<header className={styles.header}>
				<h1 className={styles.title}>🏦 Liquidity Pools</h1>
				<p className={styles.subtitle}>Where the magic happens... or losses accumulate 💸</p>
			</header>


			{/* Pools List */}
			<section className={styles.section}>
				<h2 className={styles.sectionTitle}>
					💰 Active Pools ({vaults.data?.length || 0})
				</h2>

				<div className={styles.poolsGrid}>
					{vaults.isLoading ? (
						<div className={styles.loadingCard}>
							<div className={styles.spinner}></div>
							<p>Loading pools... 🏊</p>
						</div>
					) : vaults.data && vaults.data.length > 0 ? (
						vaults.data.map((vault: VaultData, index: number) => {
							const utilization = calculateUtilization(vault);
							const tvl = calculateTVL(vault);

							return (
								<div key={index} className={styles.poolCard}>
									<div className={styles.poolHeader}>
										<div className={styles.tokenInfo}>
											<img
												src={usdc}
												alt="USDC"
												className={styles.tokenLogo}
											/>
											<div className={styles.tokenDetails}>
												<h3 className={styles.tokenName}>{vault.tokenMint}</h3>
												{vault.isPaused && (
													<span className={styles.pausedBadge}>⏸️ PAUSED</span>
												)}
											</div>
										</div>
									</div>

									<div className={styles.poolStats}>
										<div className={styles.statCard}>
											<span className={styles.statLabel}>Total Value Locked</span>
											<span className={styles.statValue}>
												${(tvl / 1000_000).toLocaleString()}
											</span>
										</div>

										<div className={styles.statCard}>
											<span className={styles.statLabel}>Utilization Rate</span>
											<span
												className={styles.statValue}
												style={{
													color: utilization > 80 ? 'var(--danger)' :
														utilization > 50 ? 'var(--warning)' :
															'var(--success)'
												}}
											>
												{(utilization / 100).toFixed(2)}%
											</span>
										</div>
									</div>

									<div className={styles.poolBody}>
										<div className={styles.poolSection}>
											<h4 className={styles.sectionLabel}>💎 LP Stats</h4>
											<div className={styles.poolRow}>
												<span className={styles.label}>LP Deposits:</span>
												<span className={styles.value}>
													${(vault.lpDeposit / 1000000).toLocaleString()}
												</span>
											</div>
											<div className={styles.poolRow}>
												<span className={styles.label}>Total LP Shares:</span>
												<span className={styles.value}>
													{vault.totalLpShares.toLocaleString()}
												</span>
											</div>
											<div className={styles.poolRow}>
												<span className={styles.label}>Accumulated Fees:</span>
												<span className={styles.valueSuccess}>
													${(vault.accumulatedLpFees / 1000000).toLocaleString()}
												</span>
											</div>
										</div>

										<div className={styles.poolSection}>
											<h4 className={styles.sectionLabel}>📊 Trader Stats</h4>
											<div className={styles.poolRow}>
												<span className={styles.label}>Trader Deposits:</span>
												<span className={styles.value}>
													${(vault.traderDeposit / 1000000).toLocaleString()}
												</span>
											</div>
											<div className={styles.poolRow}>
												<span className={styles.label}>Trader Collateral:</span>
												<span className={styles.value}>
													${vault.traderCollateral.toLocaleString()}
												</span>
											</div>
											<div className={styles.poolRow}>
												<span className={styles.label}>Total Borrowed:</span>
												<span className={styles.valueDanger}>
													${vault.totalBorrowed.toLocaleString()}
												</span>
											</div>
										</div>

										<div className={styles.poolSection}>
											<h4 className={styles.sectionLabel}>💰 Revenue</h4>
											<div className={styles.poolRow}>
												<span className={styles.label}>Protocol Fees:</span>
												<span className={styles.valueSuccess}>
													${vault.accumulatedFees.toLocaleString()}
												</span>
											</div>
											<div className={styles.poolRow}>
												<span className={styles.label}>Liquidation Rewards:</span>
												<span className={styles.valueSuccess}>
													${vault.accumulatedLiquidationRewards.toLocaleString()}
												</span>
											</div>
										</div>
									</div>

									<div className={styles.poolFooter}>
										<div className={styles.utilizationBar}>
											<div
												className={styles.utilizationFill}
												style={{
													width: `${Math.min(utilization, 100)}%`,
													background: utilization > 80 ? 'var(--gradient-danger)' :
														utilization > 50 ? 'var(--gradient-secondary)' :
															'var(--gradient-success)'
												}}
											/>
										</div>
										<span className={styles.statusIndicator}>
											{vault.isPaused ? '🔴 Pool Paused' : '🟢 Active'}
										</span>
									</div>
								</div>
							);
						})
					) : (
						<div className={styles.emptyState}>
							<p>No pools available yet... 🏜️</p>
							<p className={styles.emptyHint}>
								Create the first pool to start providing liquidity! (Admin only)
							</p>
						</div>
					)}
				</div>
			</section>

			{/* Global Pool Stats */}
			{vaults.data && vaults.data.length > 0 && (
				<footer className={styles.footer}>
					<div className={styles.stat}>
						<span className={styles.statLabel}>Total TVL:</span>
						<span className={styles.statValue}>
							${vaults.data.reduce((sum, v) => sum + calculateTVL(v), 0).toLocaleString()}
						</span>
					</div>
					<div className={styles.stat}>
						<span className={styles.statLabel}>Total LP Deposits:</span>
						<span className={styles.statValue}>
							${vaults.data.reduce((sum, v) => sum + v.lpDeposit, 0).toLocaleString()}
						</span>
					</div>
					<div className={styles.stat}>
						<span className={styles.statLabel}>Total Borrowed:</span>
						<span className={styles.statValue}>
							${vaults.data.reduce((sum, v) => sum + v.totalBorrowed, 0).toLocaleString()}
						</span>
					</div>
					<div className={styles.stat}>
						<span className={styles.statLabel}>Total Fees Earned:</span>
						<span className={styles.statValue}>
							${vaults.data.reduce((sum, v) => sum + v.accumulatedFees + v.accumulatedLpFees, 0).toLocaleString()}
						</span>
					</div>
				</footer>
			)}
		</div>
	);
};

export default Pools;
