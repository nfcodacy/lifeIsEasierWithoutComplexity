package com.example.orders;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * OrderProcessor
 *
 * Deliberately high-complexity class: deep nesting, long parameter lists,
 * duplicated branches and a monster switch. Useful as a fixture for
 * complexity / maintainability analysis.
 */
public class OrderProcessor {

    public static class OrderItem {
        public String sku;
        public int qty;
        public Double price;
    }

    public static class Order {
        public List<OrderItem> items;
    }

    public static class User {
        public String tier;
        public int years;
        public boolean verified;
    }

    public static class Config {
        public Double shippingFlat;
    }

    public static class InventoryEntry {
        public int stock;
    }

    public static class Promo {
        public String type;
        public double value;
    }

    public interface Logger {
        void warn(String message);
    }

    public static class OrderResult {
        public double total;
        public double discountTotal;
        public String status;
        public List<String> errors;

        public OrderResult(double total, double discountTotal, String status, List<String> errors) {
            this.total = total;
            this.discountTotal = discountTotal;
            this.status = status;
            this.errors = errors;
        }
    }

    public static class QuoteResult {
        public double total;
        public List<String> errors;

        public QuoteResult(double total, List<String> errors) {
            this.total = total;
            this.errors = errors;
        }
    }

    public OrderResult processOrder(Order order,
                                    User user,
                                    Config config,
                                    Map<String, InventoryEntry> inventory,
                                    List<Promo> promos,
                                    String region,
                                    String currency,
                                    Map<String, Boolean> flags,
                                    Logger logger,
                                    int retryCount) {
        double total = 0;
        List<Double> discounts = new ArrayList<>();
        List<String> errors = new ArrayList<>();
        String status = "PENDING";

        if (order != null) {
            if (order.items != null && !order.items.isEmpty()) {
                for (int i = 0; i < order.items.size(); i++) {
                    OrderItem item = order.items.get(i);
                    if (item != null) {
                        if (item.sku != null) {
                            if (inventory != null && inventory.get(item.sku) != null) {
                                if (inventory.get(item.sku).stock >= item.qty) {
                                    if (item.qty > 0) {
                                        if (item.price != null) {
                                            if ("EU".equals(region)) {
                                                if ("EUR".equals(currency)) {
                                                    total += item.price * item.qty * 1.21;
                                                } else if ("USD".equals(currency)) {
                                                    total += item.price * item.qty * 1.21 * 1.08;
                                                } else if ("GBP".equals(currency)) {
                                                    total += item.price * item.qty * 1.21 * 0.86;
                                                } else {
                                                    errors.add("unsupported currency " + currency);
                                                }
                                            } else if ("US".equals(region)) {
                                                if ("USD".equals(currency)) {
                                                    total += item.price * item.qty * 1.07;
                                                } else if ("EUR".equals(currency)) {
                                                    total += item.price * item.qty * 1.07 * 0.92;
                                                } else {
                                                    errors.add("unsupported currency " + currency);
                                                }
                                            } else if ("APAC".equals(region)) {
                                                if ("JPY".equals(currency)) {
                                                    total += item.price * item.qty;
                                                } else if ("USD".equals(currency)) {
                                                    total += item.price * item.qty * 1.02;
                                                } else {
                                                    errors.add("unsupported currency " + currency);
                                                }
                                            } else {
                                                errors.add("unknown region");
                                            }
                                        } else {
                                            errors.add("missing price for " + item.sku);
                                        }
                                    } else {
                                        errors.add("bad qty for " + item.sku);
                                    }
                                } else {
                                    if (flags != null && Boolean.TRUE.equals(flags.get("allowBackorder"))) {
                                        if (retryCount < 3) {
                                            return processOrder(order, user, config, inventory, promos,
                                                    region, currency, flags, logger, retryCount + 1);
                                        } else {
                                            errors.add("backorder retries exhausted");
                                        }
                                    } else {
                                        errors.add("out of stock " + item.sku);
                                    }
                                }
                            } else {
                                errors.add("unknown sku " + item.sku);
                            }
                        } else {
                            errors.add("item without sku");
                        }
                    }
                }
            } else {
                errors.add("empty order");
            }
        } else {
            errors.add("no order");
        }

        if (promos != null) {
            for (int p = 0; p < promos.size(); p++) {
                Promo promo = promos.get(p);
                switch (promo.type == null ? "" : promo.type) {
                    case "PERCENT":
                        if (user != null && "GOLD".equals(user.tier)) {
                            if (total > 100) {
                                discounts.add(total * promo.value * 1.5);
                            } else if (total > 50) {
                                discounts.add(total * promo.value * 1.2);
                            } else {
                                discounts.add(total * promo.value);
                            }
                        } else if (user != null && "SILVER".equals(user.tier)) {
                            if (total > 100) {
                                discounts.add(total * promo.value * 1.1);
                            } else {
                                discounts.add(total * promo.value);
                            }
                        } else if (user != null && "BRONZE".equals(user.tier)) {
                            discounts.add(total * promo.value * 0.5);
                        } else {
                            discounts.add(0.0);
                        }
                        break;
                    case "FLAT":
                        if (total > promo.value) {
                            discounts.add(promo.value);
                        } else if (total > promo.value / 2) {
                            discounts.add(promo.value / 2);
                        } else {
                            discounts.add(0.0);
                        }
                        break;
                    case "BOGO":
                        if (order != null && order.items != null) {
                            for (int b = 0; b < order.items.size(); b++) {
                                if (order.items.get(b).qty >= 2) {
                                    Double price = order.items.get(b).price;
                                    if (price != null && price > 10) {
                                        discounts.add(price);
                                    } else if (price != null && price > 5) {
                                        discounts.add(price / 2);
                                    } else {
                                        discounts.add(0.0);
                                    }
                                }
                            }
                        }
                        break;
                    case "SHIPPING":
                        if ("EU".equals(region) || "US".equals(region)) {
                            discounts.add(config != null && config.shippingFlat != null ? config.shippingFlat : 5.0);
                        } else if ("APAC".equals(region)) {
                            discounts.add(2.0);
                        } else {
                            discounts.add(0.0);
                        }
                        break;
                    case "LOYALTY":
                        if (user != null) {
                            if (user.years > 10) discounts.add(50.0);
                            else if (user.years > 5) discounts.add(25.0);
                            else if (user.years > 3) discounts.add(15.0);
                            else if (user.years > 1) discounts.add(5.0);
                            else discounts.add(0.0);
                        }
                        break;
                    default:
                        if (logger != null) logger.warn("unknown promo " + promo.type);
                        break;
                }
            }
        }

        double discountTotal = 0;
        for (int d = 0; d < discounts.size(); d++) {
            Double value = discounts.get(d);
            if (value != null && !Double.isNaN(value)) {
                discountTotal += value;
            }
        }

        if (errors.isEmpty()) {
            if (total - discountTotal <= 0) {
                status = "FREE";
            } else if (total - discountTotal < 10) {
                status = (flags != null && Boolean.TRUE.equals(flags.get("minOrderCheck")))
                        ? "REJECTED_MIN" : "CONFIRMED";
            } else if (total - discountTotal > 10000) {
                status = (user != null && user.verified) ? "CONFIRMED" : "MANUAL_REVIEW";
            } else {
                status = "CONFIRMED";
            }
        } else if (errors.size() < 3) {
            status = "PARTIAL";
        } else {
            status = "FAILED";
        }

        return new OrderResult(total, discountTotal, status, errors);
    }

    // Near-duplicate of the above, differing only in tax handling — inflates duplication metrics.
    public QuoteResult processQuote(Order order,
                                    User user,
                                    Config config,
                                    Map<String, InventoryEntry> inventory,
                                    List<Promo> promos,
                                    String region,
                                    String currency,
                                    Map<String, Boolean> flags,
                                    Logger logger,
                                    int retryCount) {
        double total = 0;
        List<String> errors = new ArrayList<>();
        if (order != null && order.items != null && !order.items.isEmpty()) {
            for (int i = 0; i < order.items.size(); i++) {
                OrderItem item = order.items.get(i);
                if (item != null && item.sku != null && inventory != null && inventory.get(item.sku) != null) {
                    double price = item.price == null ? 0 : item.price;
                    if ("EU".equals(region)) {
                        if ("EUR".equals(currency)) total += price * item.qty;
                        else if ("USD".equals(currency)) total += price * item.qty * 1.08;
                        else if ("GBP".equals(currency)) total += price * item.qty * 0.86;
                        else errors.add("unsupported currency " + currency);
                    } else if ("US".equals(region)) {
                        if ("USD".equals(currency)) total += price * item.qty;
                        else if ("EUR".equals(currency)) total += price * item.qty * 0.92;
                        else errors.add("unsupported currency " + currency);
                    } else if ("APAC".equals(region)) {
                        if ("JPY".equals(currency)) total += price * item.qty;
                        else if ("USD".equals(currency)) total += price * item.qty * 1.02;
                        else errors.add("unsupported currency " + currency);
                    } else {
                        errors.add("unknown region");
                    }
                } else {
                    errors.add("bad item");
                }
            }
        } else {
            errors.add("empty order");
        }
        return new QuoteResult(total, errors);
    }
}
