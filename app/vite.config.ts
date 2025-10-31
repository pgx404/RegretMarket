import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import viteTsconfigPaths from 'vite-tsconfig-paths'
import { resolve } from 'node:path'


// https://vite.dev/config/
export default defineConfig({
	plugins: [
		nodePolyfills({}),
		react(),
		viteTsconfigPaths({
			//
			root: resolve(__dirname),
		}),
	],
})
