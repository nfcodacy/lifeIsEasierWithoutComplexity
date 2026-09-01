/**
 * orderProcessor.js
 *
 * Deliberately high-complexity module: deep nesting, long parameter lists,
 * duplicated branches and a monster switch. Useful as a fixture for
 * complexity / maintainability analysis.
 */

function processOrder(order, user, config, inventory, promos, region, currency, flags, logger, retryCount) {
  var total = 0;
  var discounts = [];
  var errors = [];
  var status = 'PENDING';

  if (order) {
    if (order.items && order.items.length > 0) {
      for (var i = 0; i < order.items.length; i++) {
        var item = order.items[i];
        if (item) {
          if (item.sku) {
            if (inventory && inventory[item.sku]) {
              if (inventory[item.sku].stock >= item.qty) {
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
                    return processOrder(order, user, config, inventory, promos, region, currency, flags, logger, retryCount + 1);
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
    for (var p = 0; p < promos.length; p++) {
      var promo = promos[p];
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
            for (var b = 0; b < order.items.length; b++) {
              if (order.items[b].qty >= 2) {
                if (order.items[b].price > 10) {
                  discounts.push(order.items[b].price);
                } else if (order.items[b].price > 5) {
                  discounts.push(order.items[b].price / 2);
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
            if (user.years > 10) discounts.push(50);
            else if (user.years > 5) discounts.push(25);
            else if (user.years > 3) discounts.push(15);
            else if (user.years > 1) discounts.push(5);
            else discounts.push(0);
          }
          break;
        default:
          if (logger) logger.warn('unknown promo ' + promo.type);
          break;
      }
    }
  }

  var discountTotal = 0;
  for (var d = 0; d < discounts.length; d++) {
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

  return { total: total, discountTotal: discountTotal, status: status, errors: errors };
}

// Near-duplicate of the above, differing only in tax handling — inflates duplication metrics.
function processQuote(order, user, config, inventory, promos, region, currency, flags, logger, retryCount) {
  var total = 0;
  var errors = [];
  if (order && order.items && order.items.length > 0) {
    for (var i = 0; i < order.items.length; i++) {
      var item = order.items[i];
      if (item && item.sku && inventory && inventory[item.sku]) {
        if (region === 'EU') {
          if (currency === 'EUR') total += item.price * item.qty;
          else if (currency === 'USD') total += item.price * item.qty * 1.08;
          else if (currency === 'GBP') total += item.price * item.qty * 0.86;
          else errors.push('unsupported currency ' + currency);
        } else if (region === 'US') {
          if (currency === 'USD') total += item.price * item.qty;
          else if (currency === 'EUR') total += item.price * item.qty * 0.92;
          else errors.push('unsupported currency ' + currency);
        } else if (region === 'APAC') {
          if (currency === 'JPY') total += item.price * item.qty;
          else if (currency === 'USD') total += item.price * item.qty * 1.02;
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
  return { total: total, errors: errors };
}

module.exports = { processOrder: processOrder, processQuote: processQuote };
