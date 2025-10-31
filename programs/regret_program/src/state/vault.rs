use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Vault {
    pub bump: u8,
    pub is_paused: bool,
    // address of the token
    #[max_len(10)]
    pub token_mint: String,
    // total liquidity deposits
    pub lp_deposit: u64,
    pub total_lp_shares: u64,
    pub accumulated_lp_fees: u64,
    pub trader_deposit: u64,
    pub trader_collateral: u64,
    // total borrowed by traders
    pub total_borrowed: u64,
    // fees earned by the protol
    // only @admin will be able to withdraw
    pub accumulated_fees: u64,
    //  Liquidation rewards (liquidator withdrawable)
    pub accumulated_liquidation_rewards: u64,
}

impl Vault {
    pub fn available_liquidity(&self) -> u64 {
        self.lp_deposit.saturating_sub(self.total_borrowed)
    }
}
