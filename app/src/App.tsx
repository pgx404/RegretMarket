import './App.css'
import UseMessage from './contexts/UseMessage'
import { ClusterProvider } from './contexts/UseCluster'
import { UseWallet } from './contexts/UseWallet'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider, useRouter } from './contexts/RouterProvider'
import Navbar from './components/Navbar'
import Home from './pages/home'
import Markets from './pages/market'
import Portfolio from './pages/portfolio'
import Pools from './pages/pool'

const queryClient = new QueryClient()

export function Routes() {
	const { currentPath } = useRouter();

	// Simple route matching
	switch (currentPath) {
		case '/':
			return <Home />;
		case '/market':
			return <Markets />;
		case '/pool':
			return <Pools />;
		case '/portfolio':
			return <Portfolio />;
		default:
			return <Home />;
	}
}

function App() {
	return (
		<RouterProvider>
			<UseMessage>
				<ClusterProvider>
					<UseWallet>
						<QueryClientProvider client={queryClient}>
							<div className="app-container">
								<Navbar />
								<Routes />
							</div>
						</QueryClientProvider>
					</UseWallet>
				</ClusterProvider>
			</UseMessage>
		</RouterProvider>
	)
}

export default App
