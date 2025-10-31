import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useWallet } from '@solana/wallet-adapter-react';
import { useMessage } from './../contexts/UseMessage';
import { useRouter } from './../contexts/RouterProvider';
import { useEffect, useRef, } from 'react';
import styles from './Navbar.module.css';

export default function Navbar() {
	const { connected, publicKey } = useWallet();
	const { showSuccess, showError, showInfo, showWarning } = useMessage();
	const { currentPath, navigate } = useRouter();

	// Add refs to track if we've already shown these messages
	const hasShownConnectedRef = useRef(false);
	const previousConnectedRef = useRef(connected);

	// Handle connection success - only show once per connection
	useEffect(() => {
		if (connected && publicKey && !hasShownConnectedRef.current) {
			const address = publicKey.toString();
			showSuccess(`Connected: ${address.slice(0, 4)}...${address.slice(-4)}`);
			hasShownConnectedRef.current = true;
		}
		// Reset when disconnected
		if (!connected) {
			hasShownConnectedRef.current = false;
		}
	}, [connected, publicKey]);

	// Handle disconnection - only show when transitioning from connected to disconnected
	useEffect(() => {
		if (previousConnectedRef.current && !connected) {
			showInfo('Wallet disconnected');
		}
		previousConnectedRef.current = connected;
	}, [connected]);

	// Handle wallet errors
	useEffect(() => {
		const handleError = (error: any) => {
			console.error('Wallet error:', error);
			if (error.message?.includes('User rejected')) {
				showWarning('Connection request rejected');
			} else if (error.message?.includes('not installed')) {
				showError('Wallet not found. Please install a Solana wallet.');
			} else if (error.message?.includes('network')) {
				showError('Network error. Please check your connection.');
			} else {
				showError('Wallet connection failed. Please try again.');
			}
		};

		// Listen for wallet errors
		window.addEventListener('wallet-error', handleError as EventListener);
		return () => {
			window.removeEventListener('wallet-error', handleError as EventListener);
		};
	}, [showError, showWarning]);

	const navLinks = [
		{ path: '/', label: 'Home' },
		{ path: '/market', label: 'Regret Terminal' },
		{ path: '/pool', label: 'Farm Regrets' },
		{ path: '/portfolio', label: 'Redemption Arc' },
	];


	return (
		<nav className={styles.navbar}>
			<div className={styles.navbarContent}>
				<div className={styles.navbarLeft}>
					<h1
						className={styles.navbarLogo}
						onClick={() => navigate('/')}
					>
						<span className={styles.logoRegret}>Regret</span>
						<span className={styles.logoMarket}>Market</span>
					</h1>
					<div className={styles.navbarLinks}>
						{navLinks.map((link) => (
							<button
								key={link.path}
								className={`${styles.navLink} ${currentPath === link.path ? styles.active : ''}`}
								onClick={() => navigate(link.path)}
							>
								{link.label}
							</button>
						))}
					</div>
				</div>
				<div className={styles.navbarRight}>
					<WalletMultiButton />
				</div>
			</div>
		</nav>
	);
}
