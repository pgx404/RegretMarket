import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { RegretMarket } from "../target/types/regret_market.js";
import dotenv from "dotenv"
import os from "os";
import path from "path";

dotenv.config()

function expandHome(p: string): string {
	if (!p) return p;
	if (p.startsWith("~")) return path.join(os.homedir(), p.slice(1));
	if (p.startsWith("$HOME")) return path.join(os.homedir(), p.slice(5));
	return p;
}

// expand wallet path if needed
if (process.env.ANCHOR_WALLET) {
	process.env.ANCHOR_WALLET = expandHome(process.env.ANCHOR_WALLET);
}

console.log("Resolved wallet path:", process.env.ANCHOR_WALLET);

async function main() {
	const provider = anchor.AnchorProvider.env();
	anchor.setProvider(provider);

	const program = anchor.workspace.RegretMarket as Program<RegretMarket>;

	console.log(program.programId)
	// Derive the config PDA
	const [configPDA] = anchor.web3.PublicKey.findProgramAddressSync(
		[Buffer.from("config")],
		program.programId
	);

	// Configuration parameters
	const config = {
		maxLeverage: new anchor.BN(200000),           // 20x max leverage
		liquidationFee: new anchor.BN(500),       // 5% liquidation fee (500 basis points)
		maintainanceMargin: 500,                  // 5% maintenance margin (500 basis points)
		openingFee: 50,                           // 0.5% opening fee (50 basis points)
		closingFee: 50,                           // 0.5% closing fee (50 basis points)
		privacyFee: 10,                           // 0.1% privacy fee (10 basis points)
		protocolFeeShare: 30,                     // 0.3% protocol fee share (30 basis points)
	};

	// Call initialize
	const tx = await program.methods
		.initialize(
			config.maxLeverage,        // max_leverage (u64)
			config.liquidationFee,     // liquidation_fee (u64)
			config.maintainanceMargin, // maintainance_margin (u16)
			config.openingFee,         // opening_fee (u16)
			config.closingFee,         // closing_fee (u16)
			config.privacyFee,         // privacy_fee (u16)
			config.protocolFeeShare    // protocol_fee_share (u16)
		)
		.accounts({
			signer: provider.wallet.publicKey,
		})
		.rpc();

	console.log("Transaction signature:", tx);
	console.log("Config PDA:", configPDA.toString());
}

main().catch(console.error);
