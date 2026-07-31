/**
 * PayHere's checkout flow is a form POST redirect (the browser navigates to
 * PayHere's hosted checkout page carrying the signed fields), not a "here's
 * a URL, navigate to it" GET redirect the way Stripe Checkout worked. This
 * builds and submits a real hidden HTML form to achieve that — the browser
 * leaves this page and lands on PayHere's own payment page, exactly the
 * same end-user experience as the Stripe redirect, just POST instead of GET.
 */
export function submitPayHereCheckout(actionUrl: string, fields: Record<string, string>): void {
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = actionUrl;
  form.style.display = 'none';

  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}
