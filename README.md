# Complete Draft Order — Shopify POS UI Extension

A Shopify POS UI extension that lets retail staff browse draft orders, load them into the POS cart, and complete the sale through the standard POS checkout flow. After checkout, the draft order is automatically tagged as completed.

## How It Works

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   POS Home Tile  │────▶│   Draft Order    │────▶│  Draft Order    │
│  "Complete Draft │     │   List (Open /   │     │    Details      │
│    Order"        │     │   Activity tabs) │     │                 │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                 "Load into Cart"
                                                          │
                                                          ▼
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Draft order     │◀────│  POS Checkout    │◀────│  Loading Screen │
│  tagged          │     │  (native POS)    │     │  (clears cart,  │
│  completed-via-  │     │                  │     │   adds items,   │
│  pos             │     │                  │     │   sets customer)│
└─────────────────┘     └──────────────────┘     └─────────────────┘
       ▲                         │
       │                         │
       └─── orders/create ───────┘
             webhook
```

### User Flow

1. Staff taps the **Complete Draft Order** tile on the POS home screen
2. The modal opens showing open draft orders in two tabs:
   - **Open** — draft orders available to process
   - **Activity** — draft orders that are in progress or already completed via POS
3. Staff selects a draft order and taps **Continue** to view its details (line items, customer, discounts, notes, totals)
4. Staff taps **Load into Cart** — the extension:
   - Tags the draft order as `pos-processing` (prevents other terminals from loading it)
   - Releases any inventory reservation on the draft order
   - Clears the current POS cart
   - Sets the order note, customer, line items, discounts, and cart properties
   - Dismisses the modal
5. Staff completes the sale through the normal POS checkout
6. An `orders/create` webhook fires and tags the draft order as `completed-via-pos`
7. If the webhook doesn't fire (e.g. during development), staff can manually tap **Mark Completed** from the Activity tab

### Concurrency Protection

- When a draft order is loaded into a cart, it's tagged `pos-processing` so other terminals see it as "In Progress"
- Staff can view in-progress orders on the Activity tab and either:
  - **Mark Completed** — if the sale went through
  - **Release Draft Order** — if the checkout was cancelled and the draft order should be made available again

### Inventory Safety

Before loading items into the POS cart, the extension releases any inventory reservation on the draft order (`reserveInventoryUntil` set to `null`). POS then handles inventory natively when the sale completes, preventing double-counting.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| POS Extension | [Preact](https://preactjs.com/) + [Shopify POS UI Extensions](https://shopify.dev/docs/api/pos-ui-extensions) |
| Admin API | [Shopify Admin GraphQL API](https://shopify.dev/docs/api/admin-graphql) via Direct API (`fetch('shopify:admin/api/graphql.json')`) |
| App Backend | [React Router](https://reactrouter.com/) (v7) + [Shopify App React Router](https://www.npmjs.com/package/@shopify/shopify-app-react-router) |
| Database | SQLite via [Prisma](https://www.prisma.io/) (session storage only) |
| Localization | English + French (`locales/en.default.json`, `locales/fr.json`) |

### API Versions

- **Shopify Admin API**: 2026-04 (webhooks), 2026-01 (extension)
- **POS UI Extensions SDK**: `@shopify/ui-extensions` 2025.10.x

## Project Structure

```
draft-order-pos-complete/
├── app/
│   ├── shopify.server.js          # Shopify app config, auth, session storage
│   ├── db.server.js               # Prisma client singleton
│   ├── entry.server.jsx           # SSR entry point
│   ├── root.jsx                   # Root layout
│   └── routes/
│       ├── app.jsx                # App layout (admin UI)
│       ├── app._index.jsx         # Admin landing page
│       ├── webhooks.orders.create.jsx   # ← orders/create webhook handler
│       ├── webhooks.app.uninstalled.jsx
│       └── webhooks.app.scopes_update.jsx
├── extensions/
│   └── complete-draft-order/
│       ├── src/
│       │   ├── Tile.jsx           # POS home screen tile
│       │   └── Modal.jsx          # Main extension logic (3 screens)
│       ├── locales/
│       │   ├── en.default.json    # English strings
│       │   └── fr.json            # French strings
│       ├── shopify.extension.toml # Extension config
│       └── package.json           # Extension dependencies
├── prisma/
│   └── schema.prisma              # Session model (SQLite)
├── shopify.app.toml               # App config (scopes, webhooks)
├── package.json
└── README.md
```

## Access Scopes

The app requires the following Shopify access scopes:

| Scope | Purpose |
|-------|---------|
| `read_draft_orders` | Fetch draft order list and details |
| `write_draft_orders` | Tag draft orders (`pos-processing`, `completed-via-pos`), release inventory reservations |
| `read_orders` | Process `orders/create` webhook payload |
| `read_customers` | Read customer data attached to draft orders |
| `write_products` | Default scope from app template |

## Shopify Partner Dashboard Setup

Before the extension can function, configure the following in the [Partner Dashboard](https://partners.shopify.com):

1. **Protected customer data access** — The `orders/create` webhook and draft order queries include customer data. Go to your app > API access > Protected customer data and enable:
   - Protected customer data access
   - Customer name, email fields
2. **Access scopes** — Ensure all scopes listed above are configured

## Setup & Development

### Prerequisites

- [Node.js](https://nodejs.org/) v20.19+ or v22.12+
- [Shopify CLI](https://shopify.dev/docs/api/shopify-cli) (`npm install -g @shopify/cli`)
- A [Shopify Partner](https://partners.shopify.com/) account
- A development store with POS enabled

### Install

```bash
git clone https://github.com/peterwalker-svg/draft-order-pos-complete.git
cd draft-order-pos-complete
npm install
```

### Run in development

```bash
shopify app dev
```

This starts the app server, builds the POS extension, and creates a cloudflare tunnel. On first run:

1. The CLI will ask you to connect to your Partner app and dev store
2. Open the app URL in your browser to trigger OAuth and approve the access scopes
3. Open the Shopify POS app on a device connected to your dev store
4. The "Complete Draft Order" tile should appear on the POS home screen

### Verify scopes are granted

If the extension shows "Failed to load draft orders", check that the scopes were approved:

```bash
sqlite3 prisma/dev.sqlite "SELECT scope FROM Session LIMIT 1;"
```

Should show: `write_products,read_draft_orders,write_draft_orders,read_orders,read_customers`

If only `write_products` appears, clear sessions and re-authenticate:

```bash
sqlite3 prisma/dev.sqlite "DELETE FROM Session;"
```

Then open the app in your browser to trigger a fresh OAuth flow.

### Deploy

```bash
shopify app deploy
```

## GraphQL Queries

The extension uses three Admin GraphQL operations via the Direct API:

- **DraftOrders** — Lists open draft orders with name, customer, total, tags, and dates
- **DraftOrderDetails** — Fetches full draft order details including line items, variants, discounts, customer, and notes
- **DraftOrderUpdate** — Mutation to update tags and release inventory reservations

The webhook handler uses:

- **DraftOrderMarkCompleted** — Mutation to tag draft orders as `completed-via-pos` when a POS order is created

## POS Cart API Usage

The extension uses the following Cart API methods to replicate draft order data into the POS cart:

| Method | Purpose |
|--------|---------|
| `clearCart()` | Clear any existing cart items |
| `bulkCartUpdate({ note })` | Set the order note (called on empty cart to avoid state reset) |
| `setCustomer({ id })` | Attach the draft order's customer |
| `addLineItem(variantId, quantity)` | Add variant-based line items |
| `addCustomSale({ title, price, quantity, taxable })` | Add custom/non-variant line items |
| `setLineItemDiscount(uuid, type, title, amount)` | Apply line-item discounts |
| `applyCartDiscount(type, title, amount)` | Apply cart-level discounts |
| `addCartProperties({ _draft_order_id, _draft_order_name })` | Track which draft order this cart came from (carries through to order `note_attributes`) |

## Known Limitations

- **Development webhook reliability** — The `orders/create` webhook uses a cloudflare tunnel URL during `shopify app dev` which can change on restart, causing missed webhooks. Use the manual "Mark Completed" button as a fallback. This is not an issue in production with a stable URL.
- **Protected customer data** — The app must be approved for protected customer data access in the Partner Dashboard. Without this, the `orders/create` webhook subscription will fail to register.
- **Draft order status** — Shopify doesn't allow programmatically setting a draft order's status to "Completed" without using `draftOrderComplete` (which creates a duplicate order). Instead, we use tags (`completed-via-pos`) and filter them from the Open tab.
- **50 draft order limit** — The list query fetches up to 50 open draft orders. No pagination is implemented.
- **`bulkCartUpdate` ordering** — The `bulkCartUpdate` method replaces the entire cart state. It must be called on an empty cart (immediately after `clearCart`) to avoid wiping line items.

## License

UNLICENSED — Private prototype.
