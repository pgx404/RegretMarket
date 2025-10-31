import { useState, useEffect } from "react";
import styles from "./Message.module.css";

type MessageType = "info" | "success" | "error" | "warning";

interface MessageProps {
	type?: MessageType;
	message: string;
	duration?: number;
	onClose?: () => void;
}

export default function Message({
	type = "info",
	message,
	duration = 5000,
	onClose
}: MessageProps) {
	const [visible, setVisible] = useState<boolean>(true);
	const [exiting, setExiting] = useState<boolean>(false);

	useEffect(() => {
		if (duration) {
			const timer = setTimeout(() => {
				handleClose();
			}, duration);
			return () => clearTimeout(timer);
		}
	}, [duration]);

	const handleClose = () => {
		setExiting(true);
		setTimeout(() => {
			setVisible(false);
			if (onClose) onClose();
		}, 300);
	};

	if (!visible) return null;

	const getIcon = () => {
		switch (type) {
			case "success":
				return (
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
						<polyline points="22 4 12 14.01 9 11.01" />
					</svg>
				);
			case "error":
				return (
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="12" cy="12" r="10" />
						<line x1="15" y1="9" x2="9" y2="15" />
						<line x1="9" y1="9" x2="15" y2="15" />
					</svg>
				);
			case "warning":
				return (
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
						<line x1="12" y1="9" x2="12" y2="13" />
						<line x1="12" y1="17" x2="12.01" y2="17" />
					</svg>
				);
			case "info":
			default:
				return (
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
						<circle cx="12" cy="12" r="10" />
						<line x1="12" y1="16" x2="12" y2="12" />
						<line x1="12" y1="8" x2="12.01" y2="8" />
					</svg>
				);
		}
	};

	const messageClasses = `${styles.message} ${styles[`message${type.charAt(0).toUpperCase() + type.slice(1)}`]} ${exiting ? styles.messageExit : ''}`;

	return (
		<div className={messageClasses}>
			<div className={styles.messageIcon}>
				{getIcon()}
			</div>
			<div className={styles.messageContent}>
				{message}
			</div>
			<button className={styles.messageClose} onClick={handleClose}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
					<line x1="18" y1="6" x2="6" y2="18" />
					<line x1="6" y1="6" x2="18" y2="18" />
				</svg>
			</button>
		</div>
	);
}
