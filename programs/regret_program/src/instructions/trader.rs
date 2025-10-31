use anchor_lang::prelude::*;

use crate::{
    state::{Config, Trader, TraderPoolDetail, Vault},
    DISCRIMINATOR,
};

#[derive(Accounts)]
#[instruction(token_mint: String)]
pub struct Register<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        seeds = [b"vault", token_mint.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Vault>,
    #[account(
        init,
        payer = signer,
        space = DISCRIMINATOR + Trader::INIT_SPACE,
        seeds = [b"trader", signer.key().as_ref()],
        bump
    )]
    pub trader: Account<'info, Trader>,
    #[account(
        init,
        payer = signer,
        space = DISCRIMINATOR + TraderPoolDetail::INIT_SPACE,
        seeds = [b"trader_balance", signer.key().as_ref(), token_mint.as_bytes()],
        bump
    )]
    pub trader_balance: Account<'info, TraderPoolDetail>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_mint: String)]
pub struct ClaimVirtualBalance<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump,
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        seeds = [b"vault", token_mint.as_bytes()],
        bump = pool.bump
    )]
    pub pool: Account<'info, Vault>,
    #[account(
        mut,
        seeds = [b"trader_balance", signer.key().as_ref(), token_mint.as_bytes()],
        bump = trader_balance.bump
    )]
    pub trader_balance: Account<'info, TraderPoolDetail>,
}
