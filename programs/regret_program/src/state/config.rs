use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub bump: u8,
    pub is_paused: bool,
    pub admin: Pubkey,
    pub max_leverage: u64,
    pub liquidation_fee: u64,
    pub maintainance_margin: u16,
    pub opening_fee: u16,
    pub closing_fee: u16,
    pub privacy_fee: u16,
    pub protocol_fee_share: u16,
    pub last_updated: u64,
}
