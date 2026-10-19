// The bug lives here on purpose. After the build this file is minified into
// one line, the uploaded source map is what brings this code back in Sentry.

const coupons = { WELCOME10: 0.1, SUMMER: 0.2 };

export function applyCoupon(basket, code) {
  const rate = coupons[code];
  // nobody checks for unknown codes, so rate.toFixed blows up
  const label = `-${(rate * 100).toFixed(0)}%`;
  return { total: basket.total * (1 - rate), label: label + rate.toFixed(2) };
}

export function checkout(run) {
  const basket = { items: 3, total: 4999 };
  return applyCoupon(basket, `EXPIRED-${run}`);
}
