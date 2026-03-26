---
title: Tutorial - E-commerce
description: Build an e-commerce store with Next.js, ShadCN, Zustand, and Stripe
---



Build a complete e-commerce application with modern frontend and payment integration.

## Goal

Create an e-commerce store with:
- Next.js frontend
- ShadCN/UI components
- Zustand state management
- Stripe payments
- PostgreSQL + Prisma

## Step 1: Create the Project

```bash
npx @systemlabs/foundation-cli create my-store --preset ecommerce
```

This preset includes:
- Next.js + ShadCN + Zustand + Stripe

## Step 2: Start Development

```bash
cd my-store
npm run dev
```

## Step 3: Generate Product Models

```bash
foundation generate model Product
# Fields: name, description, price, image, category

foundation generate model Category
# Fields: name, slug

foundation generate model Order
# Fields: total, status, userId
```

## Step 4: Add Cart Logic

Zustand is pre-configured. Extend `src/store/`:

```typescript
import { create } from 'zustand';

interface CartItem {
  id: string;
  product: Product;
  quantity: number;
}

interface CartStore {
  items: CartItem[];
  addItem: (product: Product) => void;
  removeItem: (id: string) => void;
  clear: () => void;
}

export const useCart = create<CartStore>((set) => ({
  items: [],
  addItem: (product) => set((state) => ({
    items: [...state.items, { id: crypto.randomUUID(), product, quantity: 1 }]
  })),
  removeItem: (id) => set((state) => ({
    items: state.items.filter(item => item.id !== id)
  })),
  clear: () => set({ items: [] }),
}));
```

## Step 5: Configure Stripe

The ecommerce preset already includes Stripe. Set your keys:

```bash
# .env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

## Step 6: Deploy

```bash
docker-compose up --build
```

## Related

- [CLI: generate](/cli/generate/)
- [Modules: UI](/modules/ui/)
- [Modules: State](/modules/state/)
- [Modules: Add-ons](/modules/addons/)
