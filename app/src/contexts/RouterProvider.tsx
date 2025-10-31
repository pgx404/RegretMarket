import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface RouterContextType {
	currentPath: string;
	navigate: (path: string) => void;
}

const RouterContext = createContext<RouterContextType | undefined>(undefined);

export const useRouter = () => {
	const context = useContext(RouterContext);
	if (!context) {
		throw new Error('useRouter must be used within RouterProvider');
	}
	return context;
};

interface RouterProviderProps {
	children: ReactNode;
}

export function RouterProvider({ children }: RouterProviderProps) {
	const [currentPath, setCurrentPath] = useState(window.location.pathname);

	useEffect(() => {
		const handlePopState = () => {
			setCurrentPath(window.location.pathname);
		};

		window.addEventListener('popstate', handlePopState);
		return () => window.removeEventListener('popstate', handlePopState);
	}, []);

	const navigate = (path: string) => {
		window.history.pushState({}, '', path);
		setCurrentPath(path);
	};

	return (
		<RouterContext.Provider value={{ currentPath, navigate }}>
			{children}
		</RouterContext.Provider>
	);
}
