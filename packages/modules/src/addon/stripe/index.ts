import type { PluginDefinition } from "@systemlabs/foundation-plugin-sdk";

// ── File templates ────────────────────────────────────────────────────────────

const STRIPE_CLIENT = `\
import Stripe from "stripe";

if (!process.env["STRIPE_SECRET_KEY"]) {
  throw new Error("STRIPE_SECRET_KEY is not set in environment variables.");
}

export const stripe = new Stripe(process.env["STRIPE_SECRET_KEY"], {
  apiVersion: "2024-04-10",
  typescript: true,
});

/**
 * Creates a payment intent for the given amount.
 *
 * @param amountCents  Amount in the smallest currency unit (e.g. cents for USD).
 * @param currency     ISO 4217 currency code. Defaults to "usd".
 * @param metadata     Optional key-value metadata attached to the intent.
 */
export async function createPaymentIntent(
  amountCents: number,
  currency = "usd",
  metadata: Record<string, string> = {},
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.create({
    amount: amountCents,
    currency,
    metadata,
    automatic_payment_methods: { enabled: true },
  });
}

/**
 * Retrieves a payment intent by its id.
 */
export async function getPaymentIntent(
  paymentIntentId: string,
): Promise<Stripe.PaymentIntent> {
  return stripe.paymentIntents.retrieve(paymentIntentId);
}
`;

const STRIPE_WEBHOOKS = `\
import type { Request, Response } from "express";
import { stripe } from "./stripe.js";
import Stripe from "stripe";

const WEBHOOK_SECRET = process.env["STRIPE_WEBHOOK_SECRET"] ?? "";

/**
 * Express handler that verifies and processes incoming Stripe webhook events.
 *
 * Mount with: app.post("/webhooks/stripe", express.raw({ type: "application/json" }), stripeWebhookHandler)
 */
export async function stripeWebhookHandler(
  req: Request,
  res: Response,
): Promise<void> {
  const sig = req.headers["stripe-signature"];

  if (!sig) {
    res.status(400).json({ error: "Missing stripe-signature header." });
    return;
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      req.body as Buffer,
      sig,
      WEBHOOK_SECRET,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Webhook error";
    res.status(400).json({ error: \`Webhook signature verification failed: \${message}\` });
    return;
  }

  switch (event.type) {
    case "payment_intent.succeeded": {
      const intent = event.data.object as Stripe.PaymentIntent;
      console.log(\`PaymentIntent succeeded: \${intent.id}\`);
      // TODO: fulfil order, send confirmation email, etc.
      break;
    }
    case "payment_intent.payment_failed": {
      const intent = event.data.object as Stripe.PaymentIntent;
      console.error(\`PaymentIntent failed: \${intent.id}\`);
      break;
    }
    default:
      console.log(\`Unhandled Stripe event type: \${event.type}\`);
  }

  res.json({ received: true });
}
`;

const STRIPE_TYPES = `\
/**
 * Shared types for Stripe-related operations.
 * Import from here rather than directly from "stripe" to keep consumer code
 * decoupled from the SDK version.
 */
export type {
  PaymentIntent,
  Customer,
  Price,
  Product,
  Subscription,
  Invoice,
  Event as StripeEvent,
} from "stripe";

export interface CreateCheckoutOptions {
  readonly priceId: string;
  readonly customerId?: string;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly metadata?: Record<string, string>;
}
`;

// ── Hooks source (stored as string — executed in vm.Script sandbox) ───────────

/**
 * Hook source code string for the afterWrite lifecycle hook.
 *
 * Informs the developer about required Stripe CLI setup.
 * Safe: only uses console (injected by sandbox).
 */
export const STRIPE_AFTER_WRITE_HOOK = `\
async function hook(ctx) {
  console.log("Stripe plugin installed.");
  console.log("Next steps:");
  console.log("  1. Add your Stripe keys to .env");
  console.log("  2. Install the Stripe CLI: https://stripe.com/docs/stripe-cli");
  console.log("  3. Run: stripe listen --forward-to localhost:3001/webhooks/stripe");
}
hook
`;

// ── PluginDefinition ──────────────────────────────────────────────────────────

export const stripePlugin: PluginDefinition = {
  manifest: {
    id: "plugin-stripe",
    name: "Stripe Payments",
    version: "1.0.0",
    description:
      "Stripe payment processing integration with webhook support and type-safe API helpers",
    category: "tooling",
    runtime: "node",
    dependencies: [
      { name: "stripe", version: "^15.7.0", scope: "dependencies" },
      { name: "@types/stripe", version: "^8.0.417", scope: "devDependencies" },
    ],
    files: [
      { relativePath: "src/payments/stripe.ts", content: STRIPE_CLIENT },
      {
        relativePath: "src/payments/stripe-webhooks.ts",
        content: STRIPE_WEBHOOKS,
      },
      { relativePath: "src/payments/stripe-types.ts", content: STRIPE_TYPES },
    ],
    configPatches: [
      {
        targetFile: ".env.example",
        merge: {
          STRIPE_SECRET_KEY: "sk_test_...",
          STRIPE_PUBLISHABLE_KEY: "pk_test_...",
          STRIPE_WEBHOOK_SECRET: "whsec_...",
        },
      },
    ],
    compatibility: {
      requires: [],
      conflicts: [],
    },
    tags: ["payments", "stripe", "billing", "webhooks"],
  },
};
