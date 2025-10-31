use crate::{
    state::{Config, Market, Position, Trader, TraderPoolDetail, Vault},
    DISCRIMINATOR,
};
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

#[derive(Accounts)]
#[instruction( pair: String)]
pub struct OpenMarket<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        init,
        payer = signer,
        space = DISCRIMINATOR + Market::INIT_SPACE,
        seeds = [b"market", pair.as_bytes()],
        bump,
    )]
    pub market: Account<'info, Market>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(pair: String)]
pub struct UpdateMarket<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"market", pair.as_bytes()],
        bump,
    )]
    pub market: Account<'info, Market>,
}

#[derive(Accounts)]
#[instruction(token_mint: String, pair: String, position_id: u64)]
pub struct OpenPosition<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"trader", signer.key().as_ref()],
        bump = trader.bump
    )]
    pub trader: Account<'info, Trader>,
    #[account(
        mut,
        seeds = [b"trader_balance", signer.key().as_ref(), token_mint.as_bytes()],
        bump = trader_balance.bump
    )]
    pub trader_balance: Account<'info, TraderPoolDetail>,
    #[account(
        mut,
        seeds = [b"vault", token_mint.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"market", pair.as_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = signer,
        space = DISCRIMINATOR + Position::INIT_SPACE,
        seeds = [b"position", pair.as_bytes(), signer.key().as_ref(), position_id.to_le_bytes().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    pub price_update: Account<'info, PriceUpdateV2>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_mint: String, pair: String, position_id: u64)]
pub struct UpdatePosition<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"trader", signer.key().as_ref()],
        bump = trader.bump
    )]
    pub trader: Account<'info, Trader>,
    #[account(
        mut,
        seeds = [b"trader_balance", signer.key().as_ref(), token_mint.as_bytes()],
        bump = trader_balance.bump
    )]
    pub trader_balance: Account<'info, TraderPoolDetail>,
    #[account(
        mut,
        seeds = [b"vault", token_mint.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"market", pair.as_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        seeds = [b"position", pair.as_bytes(), signer.key().as_ref(), position_id.to_le_bytes().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    pub price_update: Account<'info, PriceUpdateV2>,
}

#[derive(Accounts)]
#[instruction(token_mint: String, pair: String, position_id: u64)]
pub struct ClosePosition<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"trader", signer.key().as_ref()],
        bump = trader.bump
    )]
    pub trader: Account<'info, Trader>,
    #[account(
        mut,
        seeds = [b"trader_balance", signer.key().as_ref(), token_mint.as_bytes()],
        bump = trader_balance.bump
    )]
    pub trader_balance: Account<'info, TraderPoolDetail>,
    #[account(
        mut,
        seeds = [b"vault", token_mint.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"market", pair.as_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        close = signer,
        seeds = [b"position", pair.as_bytes(), signer.key().as_ref(), position_id.to_le_bytes().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    pub price_update: Account<'info, PriceUpdateV2>,
}

#[derive(Accounts)]
#[instruction(token_mint: String, pair: String, owner: Pubkey, position_id: u64)]
pub struct RebalanceOrLiquidatePosition<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"trader", owner.as_ref()],
        bump = trader.bump
    )]
    pub trader: Account<'info, Trader>,
    #[account(
        mut,
        seeds = [b"trader_balance", owner.as_ref(), token_mint.as_bytes()],
        bump = trader_balance.bump
    )]
    pub trader_balance: Account<'info, TraderPoolDetail>,
    #[account(
        mut,
        seeds = [b"vault", token_mint.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"market", pair.as_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        close = signer,
        seeds = [b"position", pair.as_bytes(), owner.as_ref(), position_id.to_le_bytes().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,
    pub price_update: Account<'info, PriceUpdateV2>,
}
