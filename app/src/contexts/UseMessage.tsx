import { useState, createContext, useContext } from "react";
import type { ReactNode } from "react";
import Message from "./../components/Message";
import styles from "./UseMessage.module.css";

type MessageType = "info" | "success" | "error" | "warning";

interface MessageData {
	id: number;
	type: MessageType;
	message: string;
	duration: number;
}

interface MessageContextType {
	showInfo: (message: string, duration?: number) => void;
	showSuccess: (message: string, duration?: number) => void;
	showWarning: (message: string, duration?: number) => void;
	showError: (message: string, duration?: number) => void;
}

const MessageContext = createContext<MessageContextType | undefined>(undefined);

export const useMessage = () => {
	const context = useContext(MessageContext);
	if (!context) {
		throw new Error("useMessage must be used within MessageProvider");
	}
	return context;
};

interface MessageProviderProps {
	children: ReactNode;
}

export default function UseMessage({ children }: MessageProviderProps) {
	const [messages, setMessages] = useState<MessageData[]>([]);

	const addMessage = (type: MessageType, message: string, duration: number = 5000) => {
		const id = Date.now() + Math.random();
		setMessages(prev => [...prev, { id, type, message, duration }]);
	};

	const removeMessage = (id: number) => {
		setMessages(prev => prev.filter(msg => msg.id !== id));
	};

	const showInfo = (message: string, duration?: number) => addMessage("info", message, duration);
	const showSuccess = (message: string, duration?: number) => addMessage("success", message, duration);
	const showWarning = (message: string, duration?: number) => addMessage("warning", message, duration);
	const showError = (message: string, duration?: number) => addMessage("error", message, duration);

	return (
		<MessageContext.Provider value={{ showInfo, showSuccess, showWarning, showError }}>
			{children}
			<div className={styles.messageContainer}>
				{messages.map(msg => (
					<Message
						key={msg.id}
						type={msg.type}
						message={msg.message}
						duration={msg.duration}
						onClose={() => removeMessage(msg.id)}
					/>
				))}
			</div>
		</MessageContext.Provider>
	);
}
