import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RegretMarket } from "../target/types/regret_market.js";
import dotenv from "dotenv";
import os from "os";
import path from "path";

dotenv.config();

function expandHome(p: string): string {
	if (!p) return p;
	if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
	if (p.startsWith("$HOME")) return path.join(os.homedir(), p.slice(5));
	return p;
}

// Expand wallet path if needed
if (process.env.ANCHOR_WALLET) {
	process.env.ANCHOR_WALLET = expandHome(process.env.ANCHOR_WALLET);
}
console.log("Resolved wallet path:", process.env.ANCHOR_WALLET);

async function main() {
	const provider = anchor.AnchorProvider.env();
	anchor.setProvider(provider);
	const program = anchor.workspace.RegretMarket as Program<RegretMarket>;

	console.log("\n🚀 Creating Pool and Markets...\n");
	console.log("Program ID:", program.programId.toString());
	console.log("Signer:", provider.wallet.publicKey.toString());

	// Derive config PDA
	const [configPDA] = anchor.web3.PublicKey.findProgramAddressSync(
		[Buffer.from("config")],
		program.programId
	);

	const tokenMint = "USDC";

	// Derive pool PDA
	const [poolPDA] = anchor.web3.PublicKey.findProgramAddressSync(
		[Buffer.from("vault"), Buffer.from(tokenMint)],
		program.programId
	);

	// ============================================================================
	// STEP 1: Create Pool
	// ============================================================================
	console.log("\n💧 Creating Pool...");
	try {
		// Check if pool already exists
		try {
			await program.account.vault.fetch(poolPDA);
			console.log("✅ Pool already exists");
			console.log("   Pool PDA:", poolPDA.toString());
		} catch (e) {
			// Pool doesn't exist, create it
			const createPoolTx = await program.methods
				.createPool(tokenMint)
				.accounts({
					config: configPDA,
					signer: provider.wallet.publicKey,
					systemProgram: anchor.web3.SystemProgram.programId,
				})
				.rpc();

			console.log("✅ Pool created!");
			console.log("   Transaction:", createPoolTx);
			console.log("   Pool PDA:", poolPDA.toString());

			// Wait for confirmation
			await provider.connection.confirmTransaction(createPoolTx, 'confirmed');
		}
	} catch (error) {
		console.error("❌ Failed to create pool:", error);
		throw error;
	}

	// ============================================================================
	// STEP 2: Create Markets
	// ============================================================================
	const markets = [
		{
			pair: "BTC/USD",
			decimals: 8,
			feedId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
		},
		{
			pair: "SOL/USD",
			decimals: 9, // Solana has 9 decimals, not 6
			feedId: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"
		},
		{
			pair: "ETH/USD",
			decimals: 18,
			feedId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"
		},
		{
			pair: "LTC/USD",
			decimals: 8,
			feedId: "0x6e3f3fa8253588df9326580180233eb791e03b443a3ba7a1d892e73874e19a54"
		},
		{
			pair: "XMR/USD",
			decimals: 12,
			feedId: "0x46b8cc9347f04391764a0361e0b17c3ba394b001e7c304f7650f6376e37c321d"
		}
	];

	console.log("\n📊 Creating Markets...\n");

	for (const market of markets) {
		console.log(`Creating ${market.pair}...`);

		// Derive market PDA
		const [marketPDA] = anchor.web3.PublicKey.findProgramAddressSync(
			[Buffer.from("market"), Buffer.from(market.pair)],
			program.programId
		);

		try {
			// Check if market already exists
			try {
				await program.account.market.fetch(marketPDA);
				console.log(`✅ ${market.pair} already exists`);
				console.log(`   Market PDA: ${marketPDA.toString()}\n`);
				continue;
			} catch (e) {
				// Market doesn't exist, create it
			}

			const openMarketTx = await program.methods
				.openMarket(
					market.pair,
					market.decimals,
					market.feedId
				)
				.accounts({
					config: configPDA,
					signer: provider.wallet.publicKey,
					systemProgram: anchor.web3.SystemProgram.programId,
				})
				.rpc();

			console.log(`✅ ${market.pair} created!`);
			console.log(`   Transaction: ${openMarketTx}`);
			console.log(`   Market PDA: ${marketPDA.toString()}\n`);

			// Wait for confirmation
			await provider.connection.confirmTransaction(openMarketTx, 'confirmed');

		} catch (error: any) {
			console.error(`❌ Failed to create ${market.pair}:`, error.message);
			console.log(""); // Empty line for readability
		}
	}

	// ============================================================================
	// STEP 3: List All Markets
	// ============================================================================
	console.log("\n" + "=".repeat(80));
	console.log("📋 Verifying All Markets:");
	console.log("=".repeat(80) + "\n");

	try {
		const allMarkets = await program.account.market.all();

		if (allMarkets.length === 0) {
			console.log("❌ No markets found!");
		} else {
			console.log(`✅ Found ${allMarkets.length} markets:\n`);

			allMarkets.forEach((market, index) => {
				console.log(`${index + 1}. ${market.account.pair}`);
				console.log(`   Address: ${market.publicKey.toString()}`);
				console.log(`   Token Mint: ${market.account.tokenMint}`);
				console.log(`   Feed ID: ${market.account.feedId}`);
				console.log(`   Decimals: ${market.account.decimals}`);
				console.log(`   Active Positions: ${market.account.totalActivePositions}`);
				console.log(`   Paused: ${market.account.isPaused}`);
				console.log("");
			});
		}
	} catch (error) {
		console.error("❌ Failed to fetch markets:", error);
	}

	console.log("=".repeat(80));
	console.log("✅ Setup Complete!\n");
}

main().catch((error) => {
	console.error("\n❌ Script failed:");
	console.error(error);
	process.exit(1);
});
