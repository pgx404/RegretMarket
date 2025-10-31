use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Trader {
    pub owner: Pubkey,
    pub bump: u8,
    // defaults to false
    pub privacy: bool,
    pub position_count: u64,
    pub active_position: u64,
}

#[account]
#[derive(InitSpace)]
pub struct TraderPoolDetail {
    pub owner: Pubkey,
    pub bump: u8,
    #[max_len(10)]
    pub token_mint: String,
    pub balance: u64,
    pub locked_balance: u64,
}

impl TraderPoolDetail {
    pub fn available_balance(&self) -> u64 {
        self.balance.saturating_sub(self.locked_balance)
    }
}
