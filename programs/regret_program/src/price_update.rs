use crate::ErrorCode;
use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{get_feed_id_from_hex, PriceUpdateV2};

/// Your protocol's standard price precision (6 decimals for USD prices)
/// This means: $150.00 = 150_000_000
pub const PRICE_DECIMALS: u32 = 6;
pub const PRICE_PRECISION: u64 = 1_000_000; // 10^6

/// Maximum allowed confidence interval as percentage of price (in basis points)
/// Example: 100 bps = 1% maximum confidence
pub const MAX_CONFIDENCE_BPS: u64 = 100; // 1%

/// Maximum age for price updates in seconds
pub const MAX_PRICE_AGE_SECONDS: u64 = 60;

/// Safely extract and normalize Pyth price to your protocol's precision
///
/// # Safety Checks:
/// 1. Price must not be negative
/// 2. Confidence interval must be acceptable
/// 3. Price must be normalized to your protocol's decimals
/// 4. Handle the exponent correctly
///
/// # Arguments:
/// * `price_update` - The Pyth price update account
/// * `feed_id` - The price feed ID
/// * `max_age` - Maximum acceptable price age in seconds
///
/// # Returns:
/// Normalized price in your protocol's precision (6 decimals)
pub fn get_normalized_price(
    price_update: &PriceUpdateV2,
    feed_id: &str,
    clock: &Clock,
) -> Result<u64> {
    // Get the price with staleness check
    let feed_id = get_feed_id_from_hex(feed_id)?;
    let price_data = price_update
        .get_price_no_older_than(clock, MAX_PRICE_AGE_SECONDS, &feed_id)
        .map_err(|_| ErrorCode::StalePrice)?;

    // CRITICAL: Check if price is negative
    // Negative prices should never happen for assets, but Pyth returns i64
    require!(price_data.price > 0, ErrorCode::InvalidPrice);

    // Check confidence interval
    validate_confidence(&price_data)?;

    // Normalize price to your protocol's decimals
    normalize_price_to_protocol_precision(&price_data)
}

/// Validate that the confidence interval is acceptable
///
/// Confidence should be a small percentage of the price.
/// If conf is too high, the price is too uncertain to use safely.
fn validate_confidence(price_data: &pyth_solana_receiver_sdk::price_update::Price) -> Result<()> {
    let price_abs = price_data.price.unsigned_abs();

    // Calculate confidence as percentage of price (in basis points)
    // confidence_bps = (conf / price) × 10000
    let confidence_bps = (price_data.conf as u128)
        .checked_mul(10_000)
        .ok_or(ErrorCode::MathOverflow)?
        .checked_div(price_abs as u128)
        .ok_or(ErrorCode::MathOverflow)?;

    require!(
        confidence_bps <= MAX_CONFIDENCE_BPS as u128,
        ErrorCode::PriceConfidenceTooHigh
    );

    msg!(
        "Price confidence: {}% ({}bps)",
        confidence_bps as f64 / 100.0,
        confidence_bps
    );

    Ok(())
}

/// Convert Pyth price to your protocol's precision
///
/// Pyth returns: actual_price = price × 10^exponent
///
/// Examples:
/// - price=15000000000, exponent=-8 → $150.00000000 → normalize to $150.000000 (6 decimals)
/// - price=150, exponent=0 → $150 → normalize to $150.000000
/// - price=15000, exponent=-2 → $150.00 → normalize to $150.000000
fn normalize_price_to_protocol_precision(
    price_data: &pyth_solana_receiver_sdk::price_update::Price,
) -> Result<u64> {
    let price_raw = price_data.price as u128; // Safe because we checked > 0
    let exponent = price_data.exponent;

    msg!("Raw price: {}, exponent: {}", price_raw, exponent);

    // Calculate the actual price in your protocol's decimals
    // Formula: normalized = price × 10^(PRICE_DECIMALS + exponent)

    let exponent_diff = (PRICE_DECIMALS as i32) + exponent;

    let normalized_price = if exponent_diff >= 0 {
        // Need to multiply
        let multiplier = 10u128.pow(exponent_diff as u32);
        price_raw
            .checked_mul(multiplier)
            .ok_or(ErrorCode::MathOverflow)?
    } else {
        // Need to divide
        let divisor = 10u128.pow((-exponent_diff) as u32);
        price_raw
            .checked_div(divisor)
            .ok_or(ErrorCode::MathOverflow)?
    };

    // Ensure it fits in u64
    require!(
        normalized_price <= u64::MAX as u128,
        ErrorCode::PriceOverflow
    );

    let final_price = normalized_price as u64;

    msg!(
        "Normalized price: ${}",
        final_price as f64 / PRICE_PRECISION as f64
    );

    Ok(final_price)
}
