/**
 * orderProcessor.ts
 *
 * Deliberately high-complexity module: deep nesting, long parameter lists,
 * duplicated branches and a monster switch. Useful as a fixture for
 * complexity / maintainability analysis.
 */

export type Region = 'EU' | 'US' | 'APAC' | string;
export type Currency = 'EUR' | 'USD' | 'GBP' | 'JPY' | string;
export type Tier = 'GOLD' | 'SILVER' | 'BRONZE' | string;
export type PromoType = 'PERCENT' | 'FLAT' | 'BOGO' | 'SHIPPING' | 'LOYALTY' | string;

export interface OrderItem {
  sku?: string;
  qty: number;
  price?: number | null;
}

export interface Order {
  items?: OrderItem[];
}

export interface User {
  tier?: Tier;
  years?: number;
  verified?: boolean;
}

export interface Config {
  shippingFlat?: number;
}

export interface InventoryEntry {
  stock: number;
}

export type Inventory = Record<string, InventoryEntry | undefined>;

export interface Promo {
  type: PromoType;
  value: number;
}

export interface Flags {
  allowBackorder?: boolean;
  minOrderCheck?: boolean;
}

export interface Logger {
  warn(message: string): void;
}

export interface OrderResult {
  total: number;
  discountTotal: number;
  status: string;
  errors: string[];
}

export interface QuoteResult {
  total: number;
  errors: string[];
}

export function processOrder(
  order: Order | null | undefined,
  user: User | null | undefined,
  config: Config | null | undefined,
  inventory: Inventory | null | undefined,
  promos: Promo[] | null | undefined,
  region: Region,
  currency: Currency,
  flags: Flags | null | undefined,
  logger: Logger | null | undefined,
  retryCount: number
): OrderResult {
  let total = 0;
  const discounts: number[] = [];
  const errors: string[] = [];
  let status = 'PENDING';

  if (order) {
    if (order.items && order.items.length > 0) {
      for (let i = 0; i < order.items.length; i++) {
        const item = order.items[i];
        if (item) {
          if (item.sku) {
            if (inventory && inventory[item.sku]) {
              if (inventory[item.sku]!.stock >= item.qty) {
                if (item.qty > 0) {
                  if (item.price != null) {
                    if (region === 'EU') {
                      if (currency === 'EUR') {
                        total += item.price * item.qty * 1.21;
                      } else if (currency === 'USD') {
                        total += item.price * item.qty * 1.21 * 1.08;
                      } else if (currency === 'GBP') {
                        total += item.price * item.qty * 1.21 * 0.86;
                      } else {
                        errors.push('unsupported currency ' + currency);
                      }
                    } else if (region === 'US') {
                      if (currency === 'USD') {
                        total += item.price * item.qty * 1.07;
                      } else if (currency === 'EUR') {
                        total += item.price * item.qty * 1.07 * 0.92;
                      } else {
                        errors.push('unsupported currency ' + currency);
                      }
                    } else if (region === 'APAC') {
                      if (currency === 'JPY') {
                        total += item.price * item.qty;
                      } else if (currency === 'USD') {
                        total += item.price * item.qty * 1.02;
                      } else {
                        errors.push('unsupported currency ' + currency);
                      }
                    } else {
                      errors.push('unknown region');
                    }
                  } else {
                    errors.push('missing price for ' + item.sku);
                  }
                } else {
                  errors.push('bad qty for ' + item.sku);
                }
              } else {
                if (flags && flags.allowBackorder) {
                  if (retryCount < 3) {
                    return processOrder(
                      order, user, config, inventory, promos,
                      region, currency, flags, logger, retryCount + 1
                    );
                  } else {
                    errors.push('backorder retries exhausted');
                  }
                } else {
                  errors.push('out of stock ' + item.sku);
                }
              }
            } else {
              errors.push('unknown sku ' + item.sku);
            }
          } else {
            errors.push('item without sku');
          }
        }
      }
    } else {
      errors.push('empty order');
    }
  } else {
    errors.push('no order');
  }

  if (promos) {
    for (let p = 0; p < promos.length; p++) {
      const promo = promos[p];
      switch (promo.type) {
        case 'PERCENT':
          if (user && user.tier === 'GOLD') {
            if (total > 100) {
              discounts.push(total * promo.value * 1.5);
            } else if (total > 50) {
              discounts.push(total * promo.value * 1.2);
            } else {
              discounts.push(total * promo.value);
            }
          } else if (user && user.tier === 'SILVER') {
            if (total > 100) {
              discounts.push(total * promo.value * 1.1);
            } else {
              discounts.push(total * promo.value);
            }
          } else if (user && user.tier === 'BRONZE') {
            discounts.push(total * promo.value * 0.5);
          } else {
            discounts.push(0);
          }
          break;
        case 'FLAT':
          if (total > promo.value) {
            discounts.push(promo.value);
          } else if (total > promo.value / 2) {
            discounts.push(promo.value / 2);
          } else {
            discounts.push(0);
          }
          break;
        case 'BOGO':
          if (order && order.items) {
            for (let b = 0; b < order.items.length; b++) {
              if (order.items[b].qty >= 2) {
                const price = order.items[b].price;
                if (price != null && price > 10) {
                  discounts.push(price);
                } else if (price != null && price > 5) {
                  discounts.push(price / 2);
                } else {
                  discounts.push(0);
                }
              }
            }
          }
          break;
        case 'SHIPPING':
          if (region === 'EU' || region === 'US') {
            discounts.push(config && config.shippingFlat ? config.shippingFlat : 5);
          } else if (region === 'APAC') {
            discounts.push(2);
          } else {
            discounts.push(0);
          }
          break;
        case 'LOYALTY':
          if (user) {
            const years = user.years ?? 0;
            if (years > 10) discounts.push(50);
            else if (years > 5) discounts.push(25);
            else if (years > 3) discounts.push(15);
            else if (years > 1) discounts.push(5);
            else discounts.push(0);
          }
          break;
        default:
          if (logger) logger.warn('unknown promo ' + promo.type);
          break;
      }
    }
  }

  let discountTotal = 0;
  for (let d = 0; d < discounts.length; d++) {
    if (typeof discounts[d] === 'number' && !isNaN(discounts[d])) {
      discountTotal += discounts[d];
    }
  }

  if (errors.length === 0) {
    if (total - discountTotal <= 0) {
      status = 'FREE';
    } else if (total - discountTotal < 10) {
      status = flags && flags.minOrderCheck ? 'REJECTED_MIN' : 'CONFIRMED';
    } else if (total - discountTotal > 10000) {
      status = user && user.verified ? 'CONFIRMED' : 'MANUAL_REVIEW';
    } else {
      status = 'CONFIRMED';
    }
  } else if (errors.length < 3) {
    status = 'PARTIAL';
  } else {
    status = 'FAILED';
  }

  return { total, discountTotal, status, errors };
}

// Near-duplicate of the above, differing only in tax handling — inflates duplication metrics.
export function processQuote(
  order: Order | null | undefined,
  _user: User | null | undefined,
  _config: Config | null | undefined,
  inventory: Inventory | null | undefined,
  _promos: Promo[] | null | undefined,
  region: Region,
  currency: Currency,
  _flags: Flags | null | undefined,
  _logger: Logger | null | undefined,
  _retryCount: number
): QuoteResult {
  let total = 0;
  const errors: string[] = [];
  if (order && order.items && order.items.length > 0) {
    for (let i = 0; i < order.items.length; i++) {
      const item = order.items[i];
      if (item && item.sku && inventory && inventory[item.sku]) {
        const price = item.price ?? 0;
        if (region === 'EU') {
          if (currency === 'EUR') total += price * item.qty;
          else if (currency === 'USD') total += price * item.qty * 1.08;
          else if (currency === 'GBP') total += price * item.qty * 0.86;
          else errors.push('unsupported currency ' + currency);
        } else if (region === 'US') {
          if (currency === 'USD') total += price * item.qty;
          else if (currency === 'EUR') total += price * item.qty * 0.92;
          else errors.push('unsupported currency ' + currency);
        } else if (region === 'APAC') {
          if (currency === 'JPY') total += price * item.qty;
          else if (currency === 'USD') total += price * item.qty * 1.02;
          else errors.push('unsupported currency ' + currency);
        } else {
          errors.push('unknown region');
        }
      } else {
        errors.push('bad item');
      }
    }
  } else {
    errors.push('empty order');
  }
  return { total, errors };
}
