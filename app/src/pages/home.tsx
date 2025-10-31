import React, { useState, useEffect } from 'react';
import styles from './home.module.css';
import { useRouter } from '../contexts/RouterProvider';

interface Scenario {
	type: "LONG" | "SHORT";
	asset: string;
	yesterday: number;
	today: number;
	tomorrow: number;
	emoji: string;
}

interface Example {
	asset: string;
	yesterdayPrice: number;
	todayPrice: number;
	futurePrice: number;
	normalProfit: number;
	regretProfit: number;
	emoji: string;
}

const Home: React.FC = () => {
	const { navigate } = useRouter();
	const [activeScenario, setActiveScenario] = useState(0);

	const scenarios: Scenario[] = [
		{
			type: "LONG",
			asset: "SOL",
			yesterday: 150,
			today: 200,
			tomorrow: 210,
			emoji: "🚀"
		},
		{
			type: "SHORT",
			asset: "BTC",
			yesterday: 70000,
			today: 65000,
			tomorrow: 62000,
			emoji: "🐻"
		},
		{
			type: "LONG",
			asset: "ETH",
			yesterday: 2500,
			today: 2800,
			tomorrow: 3000,
			emoji: "💎"
		},
		{
			type: "SHORT",
			asset: "DOGE",
			yesterday: 0.15,
			today: 0.10,
			tomorrow: 0.08,
			emoji: "💀"
		}
	];

	const currentScenario = scenarios[activeScenario];

	const examples: Example[] = [
		{
			asset: "SOL",
			yesterdayPrice: 150,
			todayPrice: 200,
			futurePrice: 210,
			normalProfit: 10,
			regretProfit: 60,
			emoji: "🚀"
		},
		{
			asset: "BTC",
			yesterdayPrice: 60000,
			todayPrice: 65000,
			futurePrice: 67000,
			normalProfit: 2000,
			regretProfit: 7000,
			emoji: "₿"
		},
		{
			asset: "ETH",
			yesterdayPrice: 2500,
			todayPrice: 2800,
			futurePrice: 2900,
			normalProfit: 100,
			regretProfit: 400,
			emoji: "💎"
		}
	];

	useEffect(() => {
		const interval = setInterval(() => {
			setActiveScenario((prev) => (prev + 1) % scenarios.length);
		}, 4000);
		return () => clearInterval(interval);
	}, [scenarios.length]);

	return (
		<div className={styles.homePage}>
			{/* Hero Section */}
			<section className={styles.heroSection}>
				<div className={styles.heroContent}>
					<div className={styles.heroBadge}>
						<span className={styles.badgeEmoji}>😭</span>
						<span>Built by Regretters, For Regretters</span>
					</div>

					<h1 className={styles.heroTitle}>
						<span className={styles.gradientText}>Regret Market</span>
						<br />
						Trade What You Missed
					</h1>

					<p className={styles.heroSubtitle}>
						"I should've bought at $150..." - Stop saying it, START TRADING IT.
						<br />
						Finally, a protocol that understands your pain 💔
					</p>

					<div className={styles.heroCta}>
						<button
							className={styles.ctaPrimary}
							onClick={() => navigate('/portfolio')}
						>
							Fix My Regrets
							<span className={styles.btnArrow}>→</span>
						</button>
						<button
							className={styles.ctaSecondary}
							onClick={() => window.scrollTo({ top: 800, behavior: 'smooth' })}
						>
							Show Me How
							<span className={styles.btnEmoji}>👀</span>
						</button>
					</div>

					<div className={styles.heroStats}>
						<div className={styles.statItem}>
							<div className={styles.statValue}>24/7</div>
							<div className={styles.statLabel}>Regret Hours</div>
						</div>
						<div className={styles.statDivider}></div>
						<div className={styles.statItem}>
							<div className={styles.statValue}>$0</div>
							<div className={styles.statLabel}>Therapy Bills</div>
						</div>
						<div className={styles.statDivider}></div>
						<div className={styles.statItem}>
							<div className={styles.statValue}>100%</div>
							<div className={styles.statLabel}>Hindsight</div>
						</div>
					</div>
				</div>

				<div className={styles.heroVisual}>
					<div className={styles.scenarioBadge}>
						<span className={`${styles.badgeType} ${styles[currentScenario.type.toLowerCase()]}`}>
							{currentScenario.type === 'LONG' ? '📈' : '📉'} {currentScenario.type}
						</span>
					</div>

					<div className={styles.scenarioIndicators}>
						{scenarios.map((scenario, index) => (
							<button
								key={index}
								className={`${styles.indicator} ${index === activeScenario ? styles.active : ''} ${styles[scenario.type.toLowerCase()]}`}
								onClick={() => setActiveScenario(index)}
								title={`${scenario.type} ${scenario.asset}`}
							/>
						))}
					</div>

					<div className={`${styles.floatingCard} ${styles.card1}`}>
						<div className={styles.cardHeader}>
							<span className={styles.cardEmoji}>😫</span>
							<span className={styles.cardLabel}>Yesterday</span>
						</div>
						<div className={styles.cardAsset}>
							<span>{currentScenario.emoji}</span>
							<span>{currentScenario.asset}</span>
						</div>
						<div className={styles.cardPrice}>${currentScenario.yesterday.toLocaleString()}</div>
						<div className={styles.cardSubtitle}>
							{currentScenario.type === 'LONG' ? '"I should\'ve bought"' : '"I should\'ve shorted"'}
						</div>
					</div>

					<div className={`${styles.floatingCard} ${styles.card2}`}>
						<div className={styles.cardHeader}>
							<span className={styles.cardEmoji}>😩</span>
							<span className={styles.cardLabel}>Today</span>
						</div>
						<div className={styles.cardAsset}>
							<span>{currentScenario.emoji}</span>
							<span>{currentScenario.asset}</span>
						</div>
						<div className={styles.cardPrice}>${currentScenario.today.toLocaleString()}</div>
						<div className={styles.cardSubtitle}>
							{currentScenario.type === 'LONG' ? '"Why didn\'t I buy?"' : '"Why didn\'t I short?"'}
						</div>
					</div>

					<div className={`${styles.floatingCard} ${styles.card3}`}>
						<div className={styles.cardHeader}>
							<span className={styles.cardEmoji}>🤑</span>
							<span className={styles.cardLabel}>Tomorrow</span>
						</div>
						<div className={styles.cardAsset}>
							<span>{currentScenario.emoji}</span>
							<span>{currentScenario.asset}</span>
						</div>
						<div className={styles.cardPrice}>${currentScenario.tomorrow.toLocaleString()}</div>
						<div className={styles.cardSubtitle}>"Actually, I did!" 😎</div>
					</div>
				</div>
			</section>

			{/* How It Works Section */}
			<section className={styles.howItWorksSection}>
				<div className={styles.sectionHeader}>
					<h2 className={styles.sectionTitle}>
						<span className={styles.titleEmoji}>🤔</span>
						Stop Regretting, Start Profiting
					</h2>
					<p className={styles.sectionSubtitle}>
						We've all been there. Now there's a way out.
					</p>
				</div>

				<div className={styles.steps}>
					<div className={styles.step}>
						<div className={styles.stepNumber}>1</div>
						<div className={styles.stepContent}>
							<h3 className={styles.stepTitle}>Admit Your Regret 😔</h3>
							<p className={styles.stepDescription}>
								"I should've bought SOL at $150 yesterday..." or "I knew BTC was the top at $70k..."
								We know. We've all said it. Now's your chance to actually do something about it.
							</p>
						</div>
					</div>

					<div className={styles.step}>
						<div className={styles.stepNumber}>2</div>
						<div className={styles.stepContent}>
							<h3 className={styles.stepTitle}>We Do The Math 🧮</h3>
							<p className={styles.stepDescription}>
								Drop your collateral. Our protocol calculates the EXACT leverage needed
								to simulate entering at yesterday's price - whether it's buying the dip or shorting the top.
							</p>
						</div>
					</div>

					<div className={styles.step}>
						<div className={styles.stepNumber}>3</div>
						<div className={styles.stepContent}>
							<h3 className={styles.stepTitle}>Profit Like You Timed It Perfect 📈📉</h3>
							<p className={styles.stepDescription}>
								Watch your position grow as if you actually nailed the entry.
								Long or short, your gains match that perfect timing you keep replaying in your head.
							</p>
						</div>
					</div>

					<div className={styles.step}>
						<div className={styles.stepNumber}>4</div>
						<div className={styles.stepContent}>
							<h3 className={styles.stepTitle}>Close & Never Mention Your Secret 🤫</h3>
							<p className={styles.stepDescription}>
								Take profits whenever. Screenshot your gains. Post on CT.
								They don't need to know it was retroactive. Your secret's safe with us.
							</p>
						</div>
					</div>
				</div>
			</section>

			{/* Examples Section */}
			<section className={styles.examplesSection}>
				<div className={styles.sectionHeader}>
					<h2 className={styles.sectionTitle}>
						<span className={styles.titleEmoji}>💔</span>
						Your Biggest Regrets, Fixed
					</h2>
					<p className={styles.sectionSubtitle}>
						Stop replaying "what if" scenarios in your head at 3 AM
					</p>
				</div>

				<div className={styles.examplesGrid}>
					{examples.map((example, index) => (
						<div key={index} className={styles.exampleCard}>
							<div className={styles.exampleHeader}>
								<span className={styles.exampleEmoji}>{example.emoji}</span>
								<h3 className={styles.exampleAsset}>{example.asset}</h3>
							</div>

							<div className={styles.exampleTimeline}>
								<div className={styles.timelineItem}>
									<div className={styles.timelineLabel}>Yesterday</div>
									<div className={styles.timelinePrice}>${example.yesterdayPrice.toLocaleString()}</div>
									<div className={`${styles.timelineTag} ${styles.missed}`}>Missed 😭</div>
								</div>

								<div className={styles.timelineArrow}>→</div>

								<div className={styles.timelineItem}>
									<div className={styles.timelineLabel}>Today</div>
									<div className={styles.timelinePrice}>${example.todayPrice.toLocaleString()}</div>
									<div className={`${styles.timelineTag} ${styles.current}`}>Current</div>
								</div>

								<div className={styles.timelineArrow}>→</div>

								<div className={styles.timelineItem}>
									<div className={styles.timelineLabel}>Target</div>
									<div className={styles.timelinePrice}>${example.futurePrice.toLocaleString()}</div>
									<div className={`${styles.timelineTag} ${styles.target}`}>Target 🎯</div>
								</div>
							</div>

							<div className={styles.exampleComparison}>
								<div className={`${styles.comparisonItem} ${styles.normal}`}>
									<div className={styles.comparisonLabel}>Normal Position</div>
									<div className={styles.comparisonValue}>+${example.normalProfit.toLocaleString()}</div>
									<div className={styles.comparisonPercent}>
										{((example.normalProfit / example.todayPrice) * 100).toFixed(1)}%
									</div>
								</div>

								<div className={styles.comparisonVs}>VS</div>

								<div className={`${styles.comparisonItem} ${styles.regret}`}>
									<div className={styles.comparisonLabel}>Regret Position</div>
									<div className={styles.comparisonValue}>+${example.regretProfit.toLocaleString()}</div>
									<div className={styles.comparisonPercent}>
										{((example.regretProfit / example.yesterdayPrice) * 100).toFixed(1)}%
									</div>
								</div>
							</div>

							<div className={styles.exampleFooter}>
								<span className={styles.exampleMultiplier}>
									{(example.regretProfit / example.normalProfit).toFixed(1)}x Better
								</span>
								<span className={styles.exampleEmotion}>🚀</span>
							</div>
						</div>
					))}
				</div>
			</section>

			{/* Features Section */}
			<section className={styles.featuresSection}>
				<div className={styles.sectionHeader}>
					<h2 className={styles.sectionTitle}>
						<span className={styles.titleEmoji}>💊</span>
						The Regret Cure You've Been Waiting For
					</h2>
				</div>

				<div className={styles.featuresGrid}>
					<div className={styles.featureCard}>
						<div className={styles.featureIcon}>⏰</div>
						<h3 className={styles.featureTitle}>Actually Time Travel</h3>
						<p className={styles.featureDescription}>
							Trade yesterday's prices today. No more "I should've bought the dip" tweets.
						</p>
					</div>

					<div className={styles.featureCard}>
						<div className={styles.featureIcon}>🤖</div>
						<h3 className={styles.featureTitle}>We Do The Math For You</h3>
						<p className={styles.featureDescription}>
							Our smart contract calculates perfect leverage. You just pick what you regret.
						</p>
					</div>

					<div className={styles.featureCard}>
						<div className={styles.featureIcon}>💎</div>
						<h3 className={styles.featureTitle}>No Expiry on Regret</h3>
						<p className={styles.featureDescription}>
							Hold as long as you want. Your position doesn't expire just because time moved on.
						</p>
					</div>

					<div className={styles.featureCard}>
						<div className={styles.featureIcon}>📉</div>
						<h3 className={styles.featureTitle}>Short The Top Too</h3>
						<p className={styles.featureDescription}>
							"I knew it was overpriced!" Now prove it. Retroactive shorts work just as well.
						</p>
					</div>

					<div className={styles.featureCard}>
						<div className={styles.featureIcon}>💰</div>
						<h3 className={styles.featureTitle}>Or Just Provide Liquidity</h3>
						<p className={styles.featureDescription}>
							Not a regretter? Be the house. Earn fees from everyone fixing their mistakes.
						</p>
					</div>

					<div className={styles.featureCard}>
						<div className={styles.featureIcon}>🎭</div>
						<h3 className={styles.featureTitle}>Your Secret Is Safe</h3>
						<p className={styles.featureDescription}>
							Nobody needs to know you're trading retroactively. Just flex those gains.
						</p>
					</div>
				</div>

				<div className={styles.featuresDisclaimer}>
					*Therapy bills not included. Regret addiction is real. Trade responsibly 😅
				</div>
			</section>

			{/* CTA Section */}
			<section className={styles.ctaSection}>
				<div className={styles.ctaContent}>
					<h2 className={styles.ctaTitle}>
						Stop Living With Regret
						<span className={styles.ctaEmoji}>😭</span>
					</h2>
					<p className={styles.ctaSubtitle}>
						That "I should've bought" feeling? We fixed it. Now it's your turn.
					</p>
					<button
						className={styles.ctaButton}
						onClick={() => navigate('/portfolio')}
					>
						I'm Ready To Stop Regretting
						<span className={styles.btnGlow}></span>
					</button>
					<div className={styles.ctaNote}>
						⚠️ Warning: May cause excessive profit screenshots and decreased regret levels
					</div>
				</div>
			</section>
		</div>
	);
};

export default Home;
