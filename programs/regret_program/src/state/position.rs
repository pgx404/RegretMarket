use crate::{
    ErrorCode, BASIS_POINTS, MAX_COLLATERAL, MAX_POSITION_VALUE, MAX_SAFE_PRICE, MIN_COLLATERAL,
    MIN_POSITION_VALUE, PRECISION, SLOTS_PER_8_HOURS,
};
use anchor_lang::prelude::*;

use super::Config;

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub bump: u8,
    pub owner: Pubkey,
    pub entered_at: u64,
    pub closed_at: u64, // 0 means position is active
    pub last_funding_slot: u64,
    pub cumulative_funding_paid: u64,
    pub position_id: u64,
    pub is_long: bool,
    #[max_len(20)]
    pub pair: String,
    #[max_len(10)]
    pub token_mint: String,
    pub current_target_price: u64,
    pub desired_size: u64,
    pub desired_entry_price: u64,
    pub actual_entered_price: u64,
    pub collateral: u64,
    pub actual_size: u64,
    pub current_price: u64,
    pub position_value: u64,
    pub leverage: u64,
    pub last_updated: u64,
}

impl Position {
    pub fn update_funding(
        &mut self,
        current_slot: u64,
        current_price: u64,
        funding_rate_bps: i64,
        token_decimals: u8,
    ) -> Result<FundingPayment> {
        let slots_elapsed = current_slot.saturating_sub(self.last_funding_slot);

        let funding = calculate_funding_payment(
            self.actual_size,
            current_price,
            funding_rate_bps,
            slots_elapsed,
            token_decimals,
        )?;

        // Update position state
        self.last_funding_slot = current_slot;

        if funding.is_payment {
            self.cumulative_funding_paid = self
                .cumulative_funding_paid
                .checked_add(funding.funding_amount)
                .ok_or(ErrorCode::MathOverflow)?;
        } else {
            // User receives funding (negative rate)
            self.cumulative_funding_paid = self
                .cumulative_funding_paid
                .saturating_sub(funding.funding_amount);
        }

        Ok(funding)
    }
}

pub struct FundingPayment {
    pub funding_amount: u64,
    pub is_payment: bool,
}

pub struct PositionParams {
    pub actual_size: u64,
    pub leverage_bps: u64,
    pub position_value: u64,
    pub target_price: u64,
}

pub struct RebalanceResult {
    pub should_rebalance: bool,
    pub new_actual_size: u64,
    pub new_target_price: u64,
    pub new_leverage_bps: u64,
    pub profit_realized: u64,
    pub excess_to_insurance: u64,
}

pub struct PnLResult {
    pub gross_pnl: u64,
    pub net_pnl: u64,
    pub is_profit: bool,
}

// Calculate funding payment based on position size and slots elapsed
//
// # Arguments
// * `actual_size` - Position size in token's smallest units (e.g., 100_000_000 = 1 BTC with 8 decimals)
// * `current_price` - Current asset price in USD with 6 decimals (e.g., 50_000_000_000 = $50k)
// * `funding_rate_bps` - Funding rate in basis points per 8 hours (e.g., 10 = 0.1%)
// * `slots_elapsed` - Number of slots elapsed since last funding update
// * `token_decimals` - Number of decimals for the token
//
// # Returns
// * `FundingPayment` - Contains funding amount in USD with 6 decimals and whether user pays or receives
pub fn calculate_funding_payment(
    actual_size: u64,
    current_price: u64,
    funding_rate_bps: i64,
    slots_elapsed: u64,
    token_decimals: u8,
) -> Result<FundingPayment> {
    // Handle edge cases
    if actual_size == 0 || current_price == 0 || funding_rate_bps == 0 || slots_elapsed == 0 {
        return Ok(FundingPayment {
            funding_amount: 0,
            is_payment: funding_rate_bps > 0,
        });
    }

    // Calculate notional value with increased precision
    // notional_value = (actual_size * current_price * PRECISION) / 10^token_decimals
    let notional_value_scaled = (actual_size as u128)
        .checked_mul(current_price as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(10_u128.pow(token_decimals as u32))
        .ok_or(ErrorCode::MathOverflow)?;

    // Calculate funding periods with precision
    // funding_periods = (slots_elapsed * PRECISION) / SLOTS_PER_8_HOURS
    let funding_periods_scaled = (slots_elapsed as u128)
        .checked_mul(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(SLOTS_PER_8_HOURS as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    // Get absolute value of funding rate
    let funding_rate_abs = funding_rate_bps.unsigned_abs();

    // Calculate funding amount with all precision maintained
    // Formula: (notional_value_scaled * funding_rate_abs * funding_periods_scaled) / (BASIS_POINTS * PRECISION²)
    let funding_amount_scaled = notional_value_scaled
        .checked_mul(funding_rate_abs as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(funding_periods_scaled)
        .ok_or(ErrorCode::MathOverflow)?;

    // Calculate divisor: basis_points * precision²
    let divisor = BASIS_POINTS
        .checked_mul(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?;

    let funding_amount = funding_amount_scaled
        .checked_div(divisor)
        .ok_or(ErrorCode::MathOverflow)?;

    // Ensure the result fits in u64
    let funding_amount = u64::try_from(funding_amount).map_err(|_| ErrorCode::MathOverflow)?;

    Ok(FundingPayment {
        funding_amount,
        is_payment: funding_rate_bps > 0,
    })
}

/// Calculate long position with dynamic leverage
///
/// The key insight: We need to amplify the position so that when price moves from
/// current_price to target_price, the profit equals what the user would have made
/// if they bought at desired_entry_price.
///
/// Formula derivation:
/// Target profit at target_price = desired_size × (target_price - desired_entry_price)
/// Actual profit = actual_size × (target_price - current_price)
///
/// Setting them equal:
/// actual_size × (target_price - current_price) = desired_size × (target_price - desired_entry_price)
///
/// Therefore:
/// actual_size = desired_size × (target_price - desired_entry_price) / (target_price - current_price)
///
/// # Arguments
/// * `desired_entry_price` - USD per token with 6 decimals (e.g., 50_000_000_000 = $50k)
/// * `desired_size` - Token amount in smallest units (e.g., 100_000_000 = 1 BTC with 8 decimals)
/// * `current_price` - USD per token with 6 decimals
/// * `target_price` - USD per token with 6 decimals
/// * `collateral` - USD with 6 decimals (e.g., 100_000_000 = $100)
/// * `token_decimals` - Number of decimals for the token (8 for BTC, 18 for ETH)
pub fn calculate_long_position(
    desired_entry_price: u64,
    desired_size: u64,
    current_price: u64,
    target_price: u64,
    collateral: u64,
    token_decimals: u8,
) -> Result<PositionParams> {
    require!(
        current_price > desired_entry_price,
        ErrorCode::InvalidPriceForLong
    );
    require!(target_price > current_price, ErrorCode::InvalidTargetPrice);

    // Handle edge cases
    if desired_size == 0 || collateral == 0 {
        return err!(ErrorCode::InvalidInput);
    }

    // Calculate the profit target at target_price
    let target_profit_range = (target_price as u128)
        .checked_sub(desired_entry_price as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    // Calculate the price movement from current to target
    let price_movement = (target_price as u128)
        .checked_sub(current_price as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    if price_movement == 0 {
        return err!(ErrorCode::InvalidTargetPrice);
    }

    // Calculate required position size with higher precision
    // actual_size = desired_size × (target_price - desired_entry) / (target_price - current_price)
    let actual_size_scaled = (desired_size as u128)
        .checked_mul(target_profit_range)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(price_movement)
        .ok_or(ErrorCode::MathOverflow)?;

    // Remove precision
    let actual_size = actual_size_scaled
        .checked_div(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?;

    let actual_size = u64::try_from(actual_size).map_err(|_| ErrorCode::MathOverflow)?;

    let token_divisor = 10_u128.pow(token_decimals as u32);

    // Calculate position value in USD with 6 decimals using precision
    // Formula: (actual_size × current_price) / 10^token_decimals
    let position_value_scaled = (actual_size as u128)
        .checked_mul(current_price as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(token_divisor)
        .ok_or(ErrorCode::MathOverflow)?;

    let position_value = position_value_scaled
        .checked_div(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?;

    let position_value = u64::try_from(position_value).map_err(|_| ErrorCode::MathOverflow)?;

    // Leverage in basis points (1x = 10000)
    let leverage_bps = position_value_scaled
        .checked_mul(BASIS_POINTS)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(collateral as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?;

    let leverage_bps = u64::try_from(leverage_bps).map_err(|_| ErrorCode::MathOverflow)?;

    Ok(PositionParams {
        actual_size,
        leverage_bps,
        position_value,
        target_price,
    })
}

/// Calculate short position with dynamic leverage
///
/// For shorts:
/// Target profit at target_price = desired_size × (desired_entry_price - target_price)
/// Actual profit = actual_size × (current_price - target_price)
///
/// Setting them equal:
/// actual_size = desired_size × (desired_entry_price - target_price) / (current_price - target_price)
///
/// # Arguments
/// * `desired_entry_price` - USD per token with 6 decimals
/// * `desired_size` - Token amount in smallest units
/// * `current_price` - USD per token with 6 decimals
/// * `target_price` - USD per token with 6 decimals (10-20% below current)
/// * `collateral` - USD with 6 decimals
/// * `token_decimals` - Number of decimals for the token
pub fn calculate_short_position(
    desired_entry_price: u64,
    desired_size: u64,
    current_price: u64,
    target_price: u64,
    collateral: u64,
    token_decimals: u8,
) -> Result<PositionParams> {
    require!(
        current_price < desired_entry_price,
        ErrorCode::InvalidPriceForShort
    );

    require!(
        target_price < desired_entry_price,
        ErrorCode::InvalidTargetPrice
    );

    // Handle edge cases
    if desired_size == 0 || collateral == 0 {
        return Err(ErrorCode::InvalidInput.into());
    }

    // Calculate the profit target at target_price
    let target_profit_range = (desired_entry_price as u128)
        .checked_sub(target_price as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    // Calculate the price movement from current to target
    let price_movement = (current_price as u128)
        .checked_sub(target_price as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    if price_movement == 0 {
        return err!(ErrorCode::InvalidTargetPrice);
    }

    // Calculate required position size with higher precision
    let actual_size_scaled = (desired_size as u128)
        .checked_mul(target_profit_range)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(price_movement)
        .ok_or(ErrorCode::MathOverflow)?;

    // Remove precision
    let actual_size = actual_size_scaled
        .checked_div(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?;

    let actual_size = u64::try_from(actual_size).map_err(|_| ErrorCode::MathOverflow)?;

    let token_divisor = 10_u128.pow(token_decimals as u32);

    // Calculate position value in USD with 6 decimals using precision
    let position_value_scaled = (actual_size as u128)
        .checked_mul(current_price as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(token_divisor)
        .ok_or(ErrorCode::MathOverflow)?;

    let position_value = position_value_scaled
        .checked_div(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?;

    let position_value = u64::try_from(position_value).map_err(|_| ErrorCode::MathOverflow)?;

    // Leverage in basis points
    let leverage_bps = position_value_scaled
        .checked_mul(BASIS_POINTS)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(collateral as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?;

    let leverage_bps = u64::try_from(leverage_bps).map_err(|_| ErrorCode::MathOverflow)?;

    Ok(PositionParams {
        actual_size,
        leverage_bps,
        position_value,
        target_price,
    })
}

/// Calculate new target price and rebalance when current target is reached
///
/// # Arguments
/// * `position` - The position to potentially rebalance
/// * `current_price` - USD per token with 6 decimals
/// * `target_percentage_bps` - Target percentage in basis points (e.g., 1000 = 10%)
/// * `token_decimals` - Number of decimals for the token
pub fn calculate_rebalance_with_new_target(
    position: Position,
    current_price: u64,
    target_percentage_bps: u64,
    token_decimals: u8,
) -> Result<RebalanceResult> {
    let is_long = position.is_long;

    // Check if current target is reached
    let target_reached = if is_long {
        current_price >= position.current_target_price
    } else {
        current_price <= position.current_target_price
    };

    if !target_reached {
        return Ok(RebalanceResult {
            should_rebalance: false,
            new_actual_size: position.actual_size,
            new_target_price: position.current_target_price,
            new_leverage_bps: 0,
            profit_realized: 0,
            excess_to_insurance: 0,
        });
    }

    // Handle edge cases
    if position.actual_size == 0 || current_price == 0 {
        return Ok(RebalanceResult {
            should_rebalance: false,
            new_actual_size: position.actual_size,
            new_target_price: position.current_target_price,
            new_leverage_bps: 0,
            profit_realized: 0,
            excess_to_insurance: 0,
        });
    }

    let token_divisor = 10_u128.pow(token_decimals as u32);

    // Calculate actual profit from the leveraged position in USD with 6 decimals
    let actual_profit = if is_long {
        let current_value = (position.actual_size as u128)
            .checked_mul(current_price as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(token_divisor)
            .ok_or(ErrorCode::MathOverflow)?;

        let entry_value = (position.actual_size as u128)
            .checked_mul(position.actual_entered_price as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(token_divisor)
            .ok_or(ErrorCode::MathOverflow)?;

        let profit_u128 = current_value.saturating_sub(entry_value);
        u64::try_from(profit_u128).map_err(|_| ErrorCode::MathOverflow)?
    } else {
        let entry_value = (position.actual_size as u128)
            .checked_mul(position.actual_entered_price as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(token_divisor)
            .ok_or(ErrorCode::MathOverflow)?;

        let current_value = (position.actual_size as u128)
            .checked_mul(current_price as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(token_divisor)
            .ok_or(ErrorCode::MathOverflow)?;

        let profit_u128 = entry_value.saturating_sub(current_value);
        u64::try_from(profit_u128).map_err(|_| ErrorCode::MathOverflow)?
    };

    // Calculate virtual profit (what user expects to see) in USD with 6 decimals
    let virtual_profit = if is_long {
        let price_diff = current_price.saturating_sub(position.desired_entry_price);
        let profit_u128 = (position.desired_size as u128)
            .checked_mul(price_diff as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(token_divisor)
            .ok_or(ErrorCode::MathOverflow)?;
        u64::try_from(profit_u128).map_err(|_| ErrorCode::MathOverflow)?
    } else {
        let price_diff = position.desired_entry_price.saturating_sub(current_price);
        let profit_u128 = (position.desired_size as u128)
            .checked_mul(price_diff as u128)
            .ok_or(ErrorCode::MathOverflow)?
            .checked_div(token_divisor)
            .ok_or(ErrorCode::MathOverflow)?;
        u64::try_from(profit_u128).map_err(|_| ErrorCode::MathOverflow)?
    };

    // Excess profit goes to insurance fund
    let excess_to_insurance = actual_profit.saturating_sub(virtual_profit);

    // Calculate new target price (10-20% from current) with precision
    let price_change_scaled = (current_price as u128)
        .checked_mul(target_percentage_bps as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(BASIS_POINTS)
        .ok_or(ErrorCode::MathOverflow)?;

    let price_change = price_change_scaled
        .checked_div(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?;

    let price_change = u64::try_from(price_change).map_err(|_| ErrorCode::MathOverflow)?;

    let new_target_price = if is_long {
        current_price
            .checked_add(price_change)
            .ok_or(ErrorCode::MathOverflow)?
    } else {
        current_price
            .checked_sub(price_change)
            .ok_or(ErrorCode::MathOverflow)?
    };

    // Calculate new position size for the next cycle
    let new_params = if is_long {
        calculate_long_position(
            position.desired_entry_price,
            position.desired_size,
            current_price,
            new_target_price,
            position.collateral,
            token_decimals,
        )?
    } else {
        calculate_short_position(
            position.desired_entry_price,
            position.desired_size,
            current_price,
            new_target_price,
            position.collateral,
            token_decimals,
        )?
    };

    Ok(RebalanceResult {
        should_rebalance: true,
        new_actual_size: new_params.actual_size,
        new_target_price,
        new_leverage_bps: new_params.leverage_bps,
        profit_realized: actual_profit,
        excess_to_insurance,
    })
}

/// Calculate PnL for a position
///
/// # Arguments
/// * `position` - The position to calculate PnL for
/// * `current_price` - USD per token with 6 decimals
/// * `token_decimals` - Number of decimals for the token
///
/// # Returns
/// * `PnLResult` - Contains gross PnL, net PnL (after funding), and profit flag
pub fn calculate_pnl(
    position: &Position,
    current_price: u64,
    token_decimals: u8,
) -> Result<PnLResult> {
    // Handle edge cases
    if position.actual_size == 0 {
        return Ok(PnLResult {
            gross_pnl: 0,
            net_pnl: 0,
            is_profit: false,
        });
    }

    let token_divisor = 10_u128.pow(token_decimals as u32);

    // Calculate position values in USD with 6 decimals
    let current_value = (position.actual_size as u128)
        .checked_mul(current_price as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(token_divisor)
        .ok_or(ErrorCode::MathOverflow)?;

    let entry_value = (position.actual_size as u128)
        .checked_mul(position.actual_entered_price as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(token_divisor)
        .ok_or(ErrorCode::MathOverflow)?;

    let (gross_pnl_u128, is_profit) = if position.is_long {
        if current_value >= entry_value {
            (current_value - entry_value, true)
        } else {
            (entry_value - current_value, false)
        }
    } else {
        if entry_value >= current_value {
            (entry_value - current_value, true)
        } else {
            (current_value - entry_value, false)
        }
    };

    // Convert to u64 safely
    let gross_pnl = u64::try_from(gross_pnl_u128).map_err(|_| ErrorCode::MathOverflow)?;

    let net_pnl = if is_profit {
        gross_pnl.saturating_sub(position.cumulative_funding_paid)
    } else {
        gross_pnl
            .checked_add(position.cumulative_funding_paid)
            .ok_or(ErrorCode::MathOverflow)?
    };

    Ok(PnLResult {
        gross_pnl,
        net_pnl,
        is_profit: if is_profit { net_pnl > 0 } else { false },
    })
}

/// Calculate health ratio for a position
///
/// Health ratio = (equity / required_margin) × 100%
/// If health < 100%, position should be liquidated
///
/// # Arguments
/// * `position` - The position to check
/// * `current_price` - USD per token with 6 decimals
/// * `config` - Protocol configuration
/// * `token_decimals` - Number of decimals for the token
///
/// # Returns
/// * Health ratio in basis points (10000 = 100%)
pub fn calculate_health_ratio(
    position: &Position,
    current_price: u64,
    config: &Config,
    token_decimals: u8,
) -> Result<u64> {
    // Handle edge cases
    if position.actual_size == 0 || current_price == 0 {
        return Ok(u64::MAX);
    }

    let pnl_result = calculate_pnl(position, current_price, token_decimals)?;

    // Calculate equity in USD with 6 decimals
    let equity = if pnl_result.is_profit {
        (position.collateral as u128)
            .checked_add(pnl_result.net_pnl as u128)
            .ok_or(ErrorCode::MathOverflow)?
    } else {
        (position.collateral as u128).saturating_sub(pnl_result.net_pnl as u128)
    };

    // If equity is 0 or negative, position is already liquidatable
    if equity == 0 {
        return Ok(0);
    }

    let token_divisor = 10_u128.pow(token_decimals as u32);

    // Calculate position value in USD with 6 decimals using higher precision
    let position_value_scaled = (position.actual_size as u128)
        .checked_mul(current_price as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_mul(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(token_divisor)
        .ok_or(ErrorCode::MathOverflow)?;

    // Calculate required margin with precision maintained
    let required_margin_scaled = position_value_scaled
        .checked_mul(config.maintainance_margin as u128)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(BASIS_POINTS)
        .ok_or(ErrorCode::MathOverflow)?;

    // Remove precision from required_margin
    let required_margin = required_margin_scaled
        .checked_div(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?;

    if required_margin == 0 {
        return Ok(u64::MAX);
    }

    // Health ratio in basis points with precision
    // Scale equity up to match precision level
    let equity_scaled = equity
        .checked_mul(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?;

    let health_ratio_scaled = equity_scaled
        .checked_mul(BASIS_POINTS)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(required_margin_scaled)
        .ok_or(ErrorCode::MathOverflow)?;

    // Remove precision
    let health_ratio = health_ratio_scaled
        .checked_div(PRECISION)
        .ok_or(ErrorCode::MathOverflow)?;

    let health_ratio = u64::try_from(health_ratio).map_err(|_| ErrorCode::MathOverflow)?;

    Ok(health_ratio)
}

// Validate if position value is within acceptable range
//
// # Arguments
// * `position_value` - Position value in USD with 6 decimals
//
// # Returns
// * `Result<()>` - Ok if valid, error otherwise
pub fn validate_position_value(position_value: u64) -> Result<()> {
    require!(
        position_value >= MIN_POSITION_VALUE,
        ErrorCode::PositionValueTooLow
    );

    require!(
        position_value <= MAX_POSITION_VALUE,
        ErrorCode::PositionValueTooHigh
    );

    Ok(())
}

/// Validate if collateral is within acceptable range
///
/// # Arguments
/// * `collateral` - Collateral in USD with 6 decimals
///
/// # Returns
/// * `Result<()>` - Ok if valid, error otherwise
pub fn validate_collateral(collateral: u64) -> Result<()> {
    require!(collateral >= MIN_COLLATERAL, ErrorCode::CollateralTooLow);

    require!(collateral <= MAX_COLLATERAL, ErrorCode::CollateralTooHigh);

    Ok(())
}

/// Validate if price is safe for calculations
///
/// # Arguments
/// * `price` - Price in USD with 6 decimals
///
/// # Returns
/// * `Result<()>` - Ok if valid, error otherwise
pub fn validate_price(price: u64) -> Result<()> {
    require!(price > 0, ErrorCode::InvalidPrice);

    require!(price <= MAX_SAFE_PRICE, ErrorCode::PriceTooHigh);

    Ok(())
}

/// Validate position size is non-zero
///
/// # Arguments
/// * `size` - Position size in token's smallest units
///
/// # Returns
/// * `Result<()>` - Ok if valid, error otherwise
pub fn validate_position_size(size: u64) -> Result<()> {
    require!(size > 0, ErrorCode::InvalidPositionSize);

    Ok(())
}
