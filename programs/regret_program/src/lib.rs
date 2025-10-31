use anchor_lang::prelude::*;

mod instructions;
mod price_update;
mod state;

use instructions::*;
use price_update::*;
use state::*;

pub const DISCRIMINATOR: usize = 8;
pub const PRECISION: u128 = 1_000_000;
pub const BASIS_POINTS: u128 = 10_000; // 1 basis point = 0.01%
pub const MIN_COLLATERAL: u64 = 10_000_000; // $10 minimum
pub const MAX_COLLATERAL: u64 = 1_000_000_000_000; // $1000,000 maximum
pub const MIN_POSITION_VALUE: u64 = 10_000_000; // $10
pub const MAX_POSITION_VALUE: u64 = 10_000_000_000_000; // $10,000,000

// Price safety limit to prevent overflow in calculations
pub const MAX_SAFE_PRICE: u64 = u64::MAX / 200;
// Solana produces blocks at approximately 400ms per slot
// This means: 2.5 slots per second, 150 slots per minute, 9000 slots per hour
pub const SLOTS_PER_HOUR: u64 = 9000;
pub const SLOTS_PER_8_HOURS: u64 = 72000; // Standard funding period

declare_id!("5iYSGPQLrbvdxnTz39AcTGgisRjBBWhtUnh7hLm1DFXf");

#[error_code]
pub enum ErrorCode {
    ProgramAlreadyStarted,
    ProgramPaused,
    Unauthorized,
    MathOverflow,
    NotEnoughBalance,
    InvalidInput,
    InvalidTargetPrice,
    FeeTooLow,
    InvalidPriceForShort,
    InvalidPriceForLong,
    InvalidPositionId,
    InvalidPositionSize,
    PositionValueTooHigh,
    PositionValueTooLow,
    CollateralTooLow,
    CollateralTooHigh,
    ExcessiveLeverage,
    PriceOverflow,
    PriceTooHigh,
    StalePrice,
    InvalidPrice,
    PriceConfidenceTooHigh,
    EffectiveCollateralTooLow,
    InsufficientCollateralForFees,
    InsufficientLiquidity,
    PositionAlreadyClosed,
}

#[program]
pub mod regret_market {
    use super::*;

    pub fn initialize(
        ctx: Context<Initialize>,
        max_leverage: u64,
        liquidation_fee: u64,
        maintainance_margin: u16,
        opening_fee: u16,
        closing_fee: u16,
        privacy_fee: u16,
        protocol_fee_share: u16,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        require!(config.bump == 0, ErrorCode::ProgramAlreadyStarted);
        ctx.accounts.config.set_inner(Config {
            last_updated: Clock::get()?.slot,
            is_paused: false,
            admin: ctx.accounts.signer.key(),
            bump: ctx.bumps.config,
            liquidation_fee,
            max_leverage,
            maintainance_margin,
            opening_fee,
            closing_fee,
            privacy_fee,
            protocol_fee_share,
        });
        Ok(())
    }

    pub fn register(ctx: Context<Register>, token_mint: String) -> Result<()> {
        require!(!ctx.accounts.config.is_paused, ErrorCode::ProgramPaused);
        ctx.accounts.trader.set_inner(Trader {
            owner: ctx.accounts.signer.key(),
            bump: ctx.bumps.trader,
            privacy: false,
            position_count: 0,
            active_position: 0,
        });
        ctx.accounts.trader_balance.set_inner(TraderPoolDetail {
            bump: ctx.bumps.trader_balance,
            token_mint,
            owner: ctx.accounts.signer.key(),
            balance: 100_000_000_000, // 100,000$
            locked_balance: 0,
        });
        Ok(())
    }

    pub fn claim_virtual_balance(
        ctx: Context<ClaimVirtualBalance>,
        _token_mint: String,
    ) -> Result<()> {
        require!(!ctx.accounts.config.is_paused, ErrorCode::ProgramPaused);
        let balance = &mut ctx.accounts.trader_balance;
        balance.balance = balance
            .balance
            .checked_add(10_000_000_000)
            .ok_or(ErrorCode::MathOverflow)?;
        Ok(())
    }

    pub fn create_pool(ctx: Context<CreatePool>, token_mint: String) -> Result<()> {
        require!(!ctx.accounts.config.is_paused, ErrorCode::ProgramPaused);
        ctx.accounts.pool.set_inner(Vault {
            bump: ctx.bumps.pool,
            is_paused: false,
            token_mint,
            lp_deposit: 100_000_000_000_000,
            total_lp_shares: 0,
            accumulated_lp_fees: 0,
            trader_deposit: 0,
            trader_collateral: 0,
            total_borrowed: 0,
            accumulated_fees: 0,
            accumulated_liquidation_rewards: 0,
        });
        Ok(())
    }

    pub fn fund_pool(ctx: Context<FundPool>, _token_mint: String) -> Result<()> {
        require!(!ctx.accounts.config.is_paused, ErrorCode::ProgramPaused);
        let pool = &mut ctx.accounts.pool;
        pool.lp_deposit = pool
            .lp_deposit
            .checked_add(1_000_000_000_000)
            .ok_or(ErrorCode::MathOverflow)?;
        Ok(())
    }

    pub fn open_market(
        ctx: Context<OpenMarket>,
        pair: String,
        decimals: u8,
        feed_id: String,
    ) -> Result<()> {
        require!(!ctx.accounts.config.is_paused, ErrorCode::ProgramPaused);
        ctx.accounts.market.set_inner(Market {
            bump: ctx.bumps.market,
            pair,
            decimals,
            feed_id,
            total_active_positions: 0,
            is_paused: false,
        });
        Ok(())
    }

    pub fn update_market(
        ctx: Context<UpdateMarket>,
        _pair: String,
        feed_id: Option<String>,
    ) -> Result<()> {
        require!(!ctx.accounts.config.is_paused, ErrorCode::ProgramPaused);
        require!(!ctx.accounts.market.is_paused, ErrorCode::ProgramPaused);
        require!(
            ctx.accounts.signer.key() == ctx.accounts.config.admin,
            ErrorCode::Unauthorized
        );
        let market = &mut ctx.accounts.market;
        feed_id.map(|id| {
            market.feed_id = id;
        });
        Ok(())
    }

    pub fn open_position(
        ctx: Context<OpenPosition>,
        token_mint: String,
        pair: String,
        position_id: u64,
        desired_size: u64,
        desired_entry_price: u64,
        collateral: u64,
        is_long: bool,
    ) -> Result<()> {
        require!(!ctx.accounts.config.is_paused, ErrorCode::ProgramPaused);
        require!(!ctx.accounts.market.is_paused, ErrorCode::ProgramPaused);
        require!(!ctx.accounts.pool.is_paused, ErrorCode::ProgramPaused);

        require_eq!(
            position_id,
            ctx.accounts.trader.position_count,
            ErrorCode::InvalidPositionId
        );

        // Validate inputs
        validate_collateral(collateral)?;
        validate_position_size(desired_size)?;
        validate_price(desired_entry_price)?;

        let config = &ctx.accounts.config;
        let pool = &mut ctx.accounts.pool;
        let market = &mut ctx.accounts.market;
        let trader = &mut ctx.accounts.trader;
        let trader_balance = &mut ctx.accounts.trader_balance;
        let position = &mut ctx.accounts.position;

        // Check balance
        if trader_balance.available_balance() < collateral {
            return err!(ErrorCode::NotEnoughBalance);
        }

        // Get current price from oracle
        let current_price =
            get_normalized_price(&ctx.accounts.price_update, &market.feed_id, &Clock::get()?)?;

        // Validate current price
        validate_price(current_price)?;

        // Calculate opening fee with precision
        let opening_fee_scaled = (collateral as u128)
            .checked_mul(config.opening_fee as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(PRECISION)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(BASIS_POINTS)
            .ok_or(ErrorCode::MathOverflow)?;

        let opening_fee = opening_fee_scaled
            .checked_div(PRECISION)
            .ok_or(ErrorCode::MathOverflow)?;

        let opening_fee = u64::try_from(opening_fee).map_err(|_| ErrorCode::MathOverflow)?;

        // Ensure minimum fee is collected
        require!(opening_fee > 0, ErrorCode::FeeTooLow);

        // Calculate effective collateral after fee
        let effective_collateral = collateral
            .checked_sub(opening_fee)
            .ok_or(ErrorCode::InsufficientCollateralForFees)?;

        // Ensure effective collateral is still reasonable (at least 50% of minimum)
        require!(
            effective_collateral >= MIN_COLLATERAL / 2,
            ErrorCode::EffectiveCollateralTooLow
        );

        // Calculate target price with precision (10% above for long, 10% below for short)
        let target_price = if is_long {
            let target_scaled = (current_price as u128)
                .checked_mul(110)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_mul(PRECISION)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(100)
                .ok_or(ErrorCode::MathOverflow)?;

            let target = target_scaled
                .checked_div(PRECISION)
                .ok_or(ErrorCode::MathOverflow)?;

            u64::try_from(target).map_err(|_| ErrorCode::MathOverflow)?
        } else {
            let target_scaled = (current_price as u128)
                .checked_mul(90)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_mul(PRECISION)
                .ok_or(ErrorCode::MathOverflow)?
                .checked_div(100)
                .ok_or(ErrorCode::MathOverflow)?;

            let target = target_scaled
                .checked_div(PRECISION)
                .ok_or(ErrorCode::MathOverflow)?;

            u64::try_from(target).map_err(|_| ErrorCode::MathOverflow)?
        };

        // Calculate position parameters with effective collateral
        let PositionParams {
            actual_size,
            leverage_bps,
            position_value,
            target_price: current_target_price,
        } = if is_long {
            calculate_long_position(
                desired_entry_price,
                desired_size,
                current_price,
                target_price,
                effective_collateral,
                market.decimals,
            )?
        } else {
            calculate_short_position(
                desired_entry_price,
                desired_size,
                current_price,
                target_price,
                effective_collateral,
                market.decimals,
            )?
        };

        // Validate position parameters
        validate_position_value(position_value)?;
        validate_position_size(actual_size)?;

        // Validate leverage is within limits
        require!(
            leverage_bps <= config.max_leverage,
            ErrorCode::ExcessiveLeverage
        );

        // Calculate borrowing amount
        let borrowing_amount = position_value
            .checked_sub(effective_collateral)
            .ok_or(ErrorCode::MathOverflow)?;

        // Check pool has sufficient liquidity
        if pool.available_liquidity() < borrowing_amount {
            return err!(ErrorCode::InsufficientLiquidity);
        }

        // Split opening fee between protocol and LPs with precision
        let protocol_fee_scaled = (opening_fee as u128)
            .checked_mul(config.protocol_fee_share as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(PRECISION)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(BASIS_POINTS)
            .ok_or(ErrorCode::MathOverflow)?;

        let protocol_fee = protocol_fee_scaled
            .checked_div(PRECISION)
            .ok_or(ErrorCode::MathOverflow)?;

        let protocol_fee = u64::try_from(protocol_fee).map_err(|_| ErrorCode::MathOverflow)?;

        let lp_fee = opening_fee
            .checked_sub(protocol_fee)
            .ok_or(ErrorCode::MathOverflow)?;

        // Update pool fee accumulators
        pool.accumulated_fees = pool
            .accumulated_fees
            .checked_add(protocol_fee)
            .ok_or(ErrorCode::MathOverflow)?;

        pool.accumulated_lp_fees = pool
            .accumulated_lp_fees
            .checked_add(lp_fee)
            .ok_or(ErrorCode::MathOverflow)?;

        // Deduct opening fee from trader's balance
        trader_balance.balance = trader_balance
            .balance
            .checked_sub(opening_fee)
            .ok_or(ErrorCode::MathOverflow)?;

        // Lock effective collateral
        trader_balance.locked_balance = trader_balance
            .locked_balance
            .checked_add(effective_collateral)
            .ok_or(ErrorCode::MathOverflow)?;

        // Update pool accounting
        pool.trader_collateral = pool
            .trader_collateral
            .checked_add(effective_collateral)
            .ok_or(ErrorCode::MathOverflow)?;

        pool.total_borrowed = pool
            .total_borrowed
            .checked_add(borrowing_amount)
            .ok_or(ErrorCode::MathOverflow)?;

        // Initialize position
        position.set_inner(Position {
            owner: ctx.accounts.signer.key(),
            bump: ctx.bumps.position,
            entered_at: Clock::get()?.slot,
            closed_at: 0,
            last_funding_slot: Clock::get()?.slot,
            cumulative_funding_paid: 0,
            position_id,
            is_long,
            token_mint,
            pair,
            current_target_price,
            desired_entry_price,
            desired_size,
            collateral: effective_collateral,
            actual_size,
            actual_entered_price: current_price,
            current_price,
            position_value,
            leverage: leverage_bps,
            last_updated: Clock::get()?.slot,
        });

        trader.position_count = trader
            .position_count
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;

        trader.active_position = trader
            .active_position
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;

        market.total_active_positions = market
            .total_active_positions
            .checked_add(1)
            .ok_or(ErrorCode::MathOverflow)?;
        Ok(())
    }

    pub fn update_position(
        ctx: Context<UpdatePosition>,
        token_mint: String,
        pair: String,
        position_id: u64,
    ) -> Result<()> {
        todo!()
    }

    pub fn close_position(
        ctx: Context<ClosePosition>,
        _token_mint: String,
        _pair: String,
        _position_id: u64,
    ) -> Result<()> {
        let position = &mut ctx.accounts.position;
        let pool = &mut ctx.accounts.pool;
        let trader_balance = &mut ctx.accounts.trader_balance;
        let trader = &mut ctx.accounts.trader;
        let market = &mut ctx.accounts.market;
        let config = &ctx.accounts.config;
        let clock = Clock::get()?;

        // Validate
        require!(position.closed_at == 0, ErrorCode::PositionAlreadyClosed);
        require!(!config.is_paused, ErrorCode::ProgramPaused);
        require!(!market.is_paused, ErrorCode::ProgramPaused);
        require!(!pool.is_paused, ErrorCode::ProgramPaused);

        // Get current price
        let current_price =
            get_normalized_price(&ctx.accounts.price_update, &market.feed_id, &clock)?;

        // Validate price
        validate_price(current_price)?;

        // Final funding update
        let funding_rate_bps = 10i64; // TODO: Get from oracle
        position.update_funding(clock.slot, current_price, funding_rate_bps, market.decimals)?;

        // Calculate PnL
        let pnl_result = calculate_pnl(position, current_price, market.decimals)?;

        // Calculate closing fee with precision
        let closing_fee_scaled = (position.position_value as u128)
            .checked_mul(config.closing_fee as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(PRECISION)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(BASIS_POINTS)
            .ok_or(ErrorCode::MathOverflow)?;

        let closing_fee = closing_fee_scaled
            .checked_div(PRECISION)
            .ok_or(ErrorCode::MathOverflow)?;

        let closing_fee = u64::try_from(closing_fee).map_err(|_| ErrorCode::MathOverflow)?;

        // Split fee between protocol and LPs with precision
        let protocol_fee_scaled = (closing_fee as u128)
            .checked_mul(config.protocol_fee_share as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_mul(PRECISION)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(BASIS_POINTS)
            .ok_or(ErrorCode::MathOverflow)?;

        let protocol_fee = protocol_fee_scaled
            .checked_div(PRECISION)
            .ok_or(ErrorCode::MathOverflow)?;

        let protocol_fee = u64::try_from(protocol_fee).map_err(|_| ErrorCode::MathOverflow)?;

        let lp_fee = closing_fee
            .checked_sub(protocol_fee)
            .ok_or(ErrorCode::MathOverflow)?;

        // Calculate amounts
        let collateral = position.collateral;
        let borrowed_amount = position
            .position_value
            .checked_sub(collateral)
            .ok_or(ErrorCode::MathOverflow)?;

        // Calculate final amount to return to trader
        let amount_to_return = if pnl_result.is_profit {
            // Profit: collateral + profit - fees
            let profit_after_fees = pnl_result.net_pnl.saturating_sub(closing_fee);
            collateral
                .checked_add(profit_after_fees)
                .ok_or(ErrorCode::MathOverflow)?
        } else {
            // Loss: collateral - loss - fees
            let total_deduction = pnl_result
                .net_pnl
                .checked_add(closing_fee)
                .ok_or(ErrorCode::MathOverflow)?;

            if total_deduction >= collateral {
                // Total loss exceeds collateral - trader gets nothing
                0
            } else {
                collateral
                    .checked_sub(total_deduction)
                    .ok_or(ErrorCode::MathOverflow)?
            }
        };

        // Update pool - release borrowed amount
        pool.total_borrowed = pool
            .total_borrowed
            .checked_sub(borrowed_amount)
            .ok_or(ErrorCode::MathOverflow)?;

        pool.trader_collateral = pool
            .trader_collateral
            .checked_sub(collateral)
            .ok_or(ErrorCode::MathOverflow)?;

        // Distribute fees
        pool.accumulated_fees = pool
            .accumulated_fees
            .checked_add(protocol_fee)
            .ok_or(ErrorCode::MathOverflow)?;

        pool.accumulated_lp_fees = pool
            .accumulated_lp_fees
            .checked_add(lp_fee)
            .ok_or(ErrorCode::MathOverflow)?;

        // Update trader balance - unlock collateral and add final amount
        trader_balance.locked_balance = trader_balance
            .locked_balance
            .checked_sub(collateral)
            .ok_or(ErrorCode::MathOverflow)?;

        trader_balance.balance = trader_balance
            .balance
            .checked_add(amount_to_return)
            .ok_or(ErrorCode::MathOverflow)?;

        // Close position
        position.closed_at = clock.slot;

        // Update counters
        trader.active_position = trader
            .active_position
            .checked_sub(1)
            .ok_or(ErrorCode::MathOverflow)?;

        market.total_active_positions = market
            .total_active_positions
            .checked_sub(1)
            .ok_or(ErrorCode::MathOverflow)?;

        // Convert PnL to signed integer for event
        let final_pnl = if pnl_result.is_profit {
            pnl_result.net_pnl as i64
        } else {
            -(pnl_result.net_pnl as i64)
        };
        Ok(())
    }

    pub fn rebalance_or_liquidate_position(
        ctx: Context<RebalanceOrLiquidatePosition>,
        token_mint: String,
        pair: String,
        owner: Pubkey,
        position_id: u64,
    ) -> Result<()> {
        todo!()
    }

    /*
        pub fn update_config(){}
    */
}
