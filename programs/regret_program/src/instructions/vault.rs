use anchor_lang::prelude::*;

use crate::{
    state::{Config, Vault},
    DISCRIMINATOR,
};

#[derive(Accounts)]
#[instruction(token_mint: String)]
pub struct CreatePool<'info> {
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
        space = DISCRIMINATOR + Vault::INIT_SPACE,
        seeds = [b"vault", token_mint.as_bytes()],
        bump
    )]
    pub pool: Account<'info, Vault>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(token_mint: String)]
pub struct FundPool<'info> {
    #[account(
        seeds = [b"config"],
        bump = config.bump
    )]
    pub config: Account<'info, Config>,
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [b"vault", token_mint.as_bytes()],
        bump
    )]
    pub pool: Account<'info, Vault>,
}
