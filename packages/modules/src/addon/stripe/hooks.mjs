/**
 * Stripe plugin lifecycle hooks.
 *
 * This file is the on-disk representation of hooks that will be loaded
 * into the vm.Script sandbox by the plugin installer.
 *
 * Restrictions:
 *   - No require('fs'), require('net'), require('child_process')
 *   - Only require('crypto') and require('path') are available
 *   - ctx is frozen — do not attempt to mutate it
 *
 * The file must evaluate to the afterWrite hook function as its last expression.
 */
async function afterWrite(ctx) {
  console.log("Stripe plugin installed.");
  console.log("Next steps:");
  console.log("  1. Add your Stripe keys to .env (see .env.example)");
  console.log("  2. Install the Stripe CLI: https://stripe.com/docs/stripe-cli");
  console.log(
    "  3. Forward webhooks: stripe listen --forward-to localhost:3001/webhooks/stripe",
  );
}

afterWrite;