import React, { useState, useEffect } from 'react';
import { useRegretMarket } from './../regretMarket/api';
import type { MarketData } from './../regretMarket/api';
import styles from './OpenPositionModal.module.css';
import usdc from './../assets/usdc.svg';

interface OpenPositionModalProps {
	isOpen: boolean;
	onClose: () => void;
}

// Constants matching the smart contract
const USD_DECIMALS = 6;
const USD_MULTIPLIER = Math.pow(10, USD_DECIMALS);

const OpenPositionModal: React.FC<OpenPositionModalProps> = ({ isOpen, onClose }) => {
	const { markets, trader, traderBalances, openPosition } = useRegretMarket();

	const [selectedMarket, setSelectedMarket] = useState<string>('');
	const [isLong, setIsLong] = useState<boolean>(true);
	const [collateral, setCollateral] = useState<string>('');
	const [desiredEntryPrice, setDesiredEntryPrice] = useState<string>('');
	const [desiredSize, setDesiredSize] = useState<string>('');

	const [currentPrice, setCurrentPrice] = useState<number>(0);
	const [loadingPrice, setLoadingPrice] = useState<boolean>(false);

	const [calculatedValues, setCalculatedValues] = useState({
		targetPrice: 0,
		actualSize: 0,
		leverage: 0,
		positionValue: 0,
	});

	const selectedMarketData = markets.data?.find(m => m.pair === selectedMarket);

	// Get available balance in human-readable format (divide by 1_000_000)
	const availableBalanceRaw = traderBalances.data?.[0]?.availableBalance || 0;
	const availableBalance = availableBalanceRaw / USD_MULTIPLIER;

	// Fetch current price when market is selected
	useEffect(() => {
		if (!selectedMarketData) return;

		const fetchPrice = async () => {
			try {
				setLoadingPrice(true);

				// Ensure feedId has 0x prefix
				const feedId = selectedMarketData.feedId.startsWith('0x')
					? selectedMarketData.feedId
					: `0x${selectedMarketData.feedId}`;

				const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${feedId}`;
				const response = await fetch(url);

				if (!response.ok) {
					throw new Error(`Pyth API error: ${response.status}`);
				}

				const data = await response.json();

				if (data.parsed && data.parsed.length > 0) {
					const priceData = data.parsed[0].price;
					const price = parseFloat(priceData.price) * Math.pow(10, priceData.expo);
					setCurrentPrice(price);
				}
			} catch (error) {
				console.error('Failed to fetch price:', error);
				setCurrentPrice(0);
			} finally {
				setLoadingPrice(false);
			}
		};

		fetchPrice();

		// Refresh price every 5 seconds
		const interval = setInterval(fetchPrice, 5000);
		return () => clearInterval(interval);
	}, [selectedMarketData]);

	// Calculate position parameters
	useEffect(() => {
		if (!selectedMarketData || !collateral || !desiredEntryPrice || !desiredSize || currentPrice === 0) {
			setCalculatedValues({
				targetPrice: 0,
				actualSize: 0,
				leverage: 0,
				positionValue: 0,
			});
			return;
		}

		try {
			const collateralNum = parseFloat(collateral);
			const desiredEntryPriceNum = parseFloat(desiredEntryPrice);
			const desiredSizeNum = parseFloat(desiredSize);

			// Validate inputs based on position type
			if (isLong) {
				if (currentPrice <= desiredEntryPriceNum) {
					// For long: current price must be > desired entry price
					setCalculatedValues({
						targetPrice: 0,
						actualSize: 0,
						leverage: 0,
						positionValue: 0,
					});
					return;
				}
			} else {
				if (currentPrice >= desiredEntryPriceNum) {
					// For short: current price must be < desired entry price
					setCalculatedValues({
						targetPrice: 0,
						actualSize: 0,
						leverage: 0,
						positionValue: 0,
					});
					return;
				}
			}

			// Calculate target price (10% movement)
			const targetPrice = isLong
				? currentPrice * 1.1
				: currentPrice * 0.9;

			// Calculate actual size based on the formula
			let actualSize: number;
			if (isLong) {
				// For long: actual_size = desired_size × (target_price - desired_entry) / (target_price - current_price)
				const numerator = desiredSizeNum * (targetPrice - desiredEntryPriceNum);
				const denominator = targetPrice - currentPrice;
				actualSize = numerator / denominator;
			} else {
				// For short: actual_size = desired_size × (desired_entry - target_price) / (current_price - target_price)
				const numerator = desiredSizeNum * (desiredEntryPriceNum - targetPrice);
				const denominator = currentPrice - targetPrice;
				actualSize = numerator / denominator;
			}

			// Calculate position value
			const positionValue = actualSize * currentPrice;

			// Calculate leverage (position_value / collateral)
			const leverage = positionValue / collateralNum;

			setCalculatedValues({
				targetPrice,
				actualSize,
				leverage,
				positionValue,
			});
		} catch (error) {
			console.error('Error calculating position:', error);
			setCalculatedValues({
				targetPrice: 0,
				actualSize: 0,
				leverage: 0,
				positionValue: 0,
			});
		}
	}, [selectedMarketData, collateral, desiredEntryPrice, desiredSize, currentPrice, isLong]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();

		if (!selectedMarketData || !trader.data) {
			alert('Please wait for data to load');
			return;
		}

		if (calculatedValues.leverage === 0) {
			alert('Invalid position parameters');
			return;
		}

		try {
			// Parse human-readable values
			const collateralNum = parseFloat(collateral);
			const desiredEntryPriceNum = parseFloat(desiredEntryPrice);
			const desiredSizeNum = parseFloat(desiredSize);

			console.log('Opening position with human-readable values:', {
				collateral: collateralNum,
				desiredEntryPrice: desiredEntryPriceNum,
				desiredSize: desiredSizeNum,
				pair: selectedMarket,
				isLong,
				tokenDecimals: selectedMarketData.decimals,
			});

			// Pass human-readable values to the hook
			// The hook will handle all decimal conversions internally
			await openPosition.mutateAsync({
				tokenMint: 'USDC',
				pair: selectedMarket,
				desiredSize: desiredSizeNum,        // e.g., 0.1, 1.5
				desiredEntryPrice: desiredEntryPriceNum, // e.g., 150.50
				collateral: collateralNum,          // e.g., 100
				isLong,
			});

			// Reset form and close modal
			setSelectedMarket('');
			setCollateral('');
			setDesiredEntryPrice('');
			setDesiredSize('');
			onClose();
		} catch (error) {
			console.error('Failed to open position:', error);
			alert('Failed to open position. Check console for details.');
		}
	};

	if (!isOpen) return null;

	return (
		<div className={styles.overlay} onClick={onClose}>
			<div className={styles.modal} onClick={(e) => e.stopPropagation()}>
				<div className={styles.header}>
					<h2 className={styles.title}>🚀 Open New Position</h2>
					<button className={styles.closeBtn} onClick={onClose}>✕</button>
				</div>

				<form onSubmit={handleSubmit} className={styles.form}>
					{/* Market Selection */}
					<div className={`${styles.formGroup} ${styles.fullWidth}`}>
						<label className={styles.label}>Select Market:</label>
						<select
							className={styles.select}
							value={selectedMarket}
							onChange={(e) => setSelectedMarket(e.target.value)}
							required
						>
							<option value="">Choose a market...</option>
							{markets.data?.map((market: MarketData) => (
								<option key={market.pair} value={market.pair} disabled={market.isPaused}>
									{market.pair} {market.isPaused ? '(Paused)' : ''}
								</option>
							))}
						</select>
					</div>

					{/* Current Price Display */}
					{selectedMarketData && (
						<div className={styles.priceDisplay}>
							<span className={styles.priceLabel}>Current Price:</span>
							{loadingPrice ? (
								<div className={styles.priceLoading}>
									<div className={styles.spinner}></div>
								</div>
							) : (
								<span className={styles.priceValue}>
									${currentPrice.toLocaleString(undefined, {
										minimumFractionDigits: 2,
										maximumFractionDigits: 2
									})}
								</span>
							)}
						</div>
					)}

					{/* Position Type */}
					<div className={`${styles.formGroup} ${styles.fullWidth}`}>
						<label className={styles.label}>Position Type:</label>
						<div className={styles.toggleGroup}>
							<button
								type="button"
								className={`${styles.toggleBtn} ${isLong ? styles.toggleBtnActive : ''} ${styles.longBtn}`}
								onClick={() => setIsLong(true)}
							>
								📈 LONG
							</button>
							<button
								type="button"
								className={`${styles.toggleBtn} ${!isLong ? styles.toggleBtnActive : ''} ${styles.shortBtn}`}
								onClick={() => setIsLong(false)}
							>
								📉 SHORT
							</button>
						</div>
					</div>

					{/* Collateral */}
					<div className={styles.formGroup}>
						<label className={styles.label}>
							<span className={styles.labelWithIcon}>
								<img src={usdc} alt="USDC" className={styles.tokenIcon} />
								Collateral (USDC):
							</span>
							<span className={styles.balanceInfo}>
								Available: ${availableBalance.toLocaleString(undefined, {
									minimumFractionDigits: 2,
									maximumFractionDigits: 6
								})}
							</span>
						</label>
						<input
							type="number"
							className={styles.input}
							placeholder="e.g., 100"
							step="0.000001"
							min="0"
							value={collateral}
							onChange={(e) => setCollateral(e.target.value)}
							required
						/>
						<span className={styles.inputHint}>Enter amount in USDC (e.g., 100)</span>
					</div>

					{/* Desired Entry Price */}
					<div className={styles.formGroup}>
						<label className={styles.label}>
							Desired Entry Price (USD):
							<span className={styles.hint}>
								{isLong ? 'Must be < current price' : 'Must be > current price'}
							</span>
						</label>
						<input
							type="number"
							className={styles.input}
							placeholder="e.g., 150.50"
							step="0.01"
							min="0"
							value={desiredEntryPrice}
							onChange={(e) => setDesiredEntryPrice(e.target.value)}
							required
						/>
						<span className={styles.inputHint}>Enter price in USD (e.g., 150.50)</span>
					</div>

					{/* Desired Size */}
					<div className={styles.formGroup}>
						<label className={styles.label}>
							Desired Size ({selectedMarketData?.pair.split('/')[0] || 'Tokens'}):
						</label>
						<input
							type="number"
							className={styles.input}
							placeholder="e.g., 0.1"
							step={`0.${'0'.repeat(Math.max(0, (selectedMarketData?.decimals || 18) - 1))}1`}
							min="0"
							value={desiredSize}
							onChange={(e) => setDesiredSize(e.target.value)}
							required
						/>
						<span className={styles.inputHint}>
							Enter token amount (e.g., 0.1 for {selectedMarketData?.pair.split('/')[0] || 'tokens'})
						</span>
					</div>

					{/* Calculated Values */}
					{calculatedValues.leverage > 0 && (
						<div className={styles.calculatedSection}>
							<h3 className={styles.calculatedTitle}>📊 Position Details:</h3>
							<div className={styles.calculatedGrid}>
								<div className={styles.calculatedRow}>
									<span className={styles.calculatedLabel}>Target Price:</span>
									<span className={styles.calculatedValue}>
										${calculatedValues.targetPrice.toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2
										})}
									</span>
								</div>
								<div className={styles.calculatedRow}>
									<span className={styles.calculatedLabel}>Actual Size:</span>
									<span className={styles.calculatedValue}>
										{calculatedValues.actualSize.toFixed(Math.min(selectedMarketData?.decimals || 6, 6))} tokens
									</span>
								</div>
								<div className={styles.calculatedRow}>
									<span className={styles.calculatedLabel}>Position Value:</span>
									<span className={styles.calculatedValue}>
										${calculatedValues.positionValue.toLocaleString(undefined, {
											minimumFractionDigits: 2,
											maximumFractionDigits: 2
										})}
									</span>
								</div>
								<div className={styles.calculatedRow}>
									<span className={styles.calculatedLabel}>Leverage:</span>
									<span className={`${styles.calculatedValue} ${styles.leverageValue}`}>
										{calculatedValues.leverage.toFixed(2)}x
									</span>
								</div>
							</div>
						</div>
					)}

					{/* Submit Button */}
					<div className={styles.formActions}>
						<button
							type="submit"
							className={styles.submitBtn}
							disabled={
								openPosition.isPending ||
								!selectedMarket ||
								calculatedValues.leverage === 0 ||
								loadingPrice
							}
						>
							{openPosition.isPending ? 'Opening Position...' : 'Open Position 🚀'}
						</button>
						<button
							type="button"
							className={styles.cancelBtn}
							onClick={onClose}
						>
							Cancel
						</button>
					</div>
				</form>
			</div>
		</div>
	);
};

export default OpenPositionModal;
