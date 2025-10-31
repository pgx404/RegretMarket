use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Market {
    pub bump: u8,
    #[max_len(20)]
    pub pair: String,
    pub decimals: u8,
    #[max_len(70)]
    pub feed_id: String,
    pub total_active_positions: u64,
    pub is_paused: bool,
}
