# Regret Market

Time travel for the past trading regrets;

### Deployment Guide
```bash

anchor build
anchor deploy --provider.cluster devnet

npx tsx scripts/initialize.ts
npx tsx scripts/create_pool_and_market.ts

cd app && pnpm run dev
```
