import "@shopify/ui-extensions/preact";
import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

// ---------------------------------------------------------------------------
// GraphQL
// ---------------------------------------------------------------------------

const SHOP_QUERY = `{ shop { currencyCode } }`;

const PRODUCT_VARIANTS_QUERY = `
  query ProductVariantSearch($query: String!) {
    productVariants(first: 10, query: $query) {
      nodes {
        id
        displayName
        sku
        price
        product { title }
      }
    }
  }
`;

const CUSTOMERS_QUERY = `
  query CustomerSearch($query: String!) {
    customers(first: 10, query: $query) {
      nodes {
        id
        displayName
        email
        phone
        defaultAddress {
          address1
          address2
          city
          province
          provinceCode
          zip
          countryCodeV2
        }
      }
    }
  }
`;

const LOCATIONS_QUERY = `
  query Locations {
    locations(first: 50, query: "active:true") {
      nodes {
        id
        name
        address {
          address1
          city
          province
          countryCode
        }
      }
    }
  }
`;

const DRAFT_ORDER_CREATE_MUTATION = `
  mutation DraftOrderCreate($input: DraftOrderInput!) {
    draftOrderCreate(input: $input) {
      draftOrder {
        id
        name
        reserveInventoryUntil
      }
      userErrors {
        field
        message
      }
    }
  }
`;

// ---------------------------------------------------------------------------
// Shared utilities
// ---------------------------------------------------------------------------

async function fetchGraphQL(query, variables = {}) {
  const response = await fetch('shopify:admin/api/graphql.json', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({query, variables}),
  });

  if (!response.ok) {
    throw new Error(`HTTP error: ${response.status}`);
  }

  const result = await response.json();

  if (result.errors && !result.data) {
    throw new Error(result.errors[0]?.message || 'GraphQL error');
  }

  return result;
}

function formatCurrency(amount, currencyCode) {
  if (amount == null) return '';
  const num = parseFloat(amount);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: currencyCode || 'USD',
    }).format(num);
  } catch {
    return `${currencyCode || '$'}${num.toFixed(2)}`;
  }
}

const EMPTY_ADDRESS = {address1: '', address2: '', city: '', provinceCode: '', zip: '', countryCode: ''};

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [screen, setScreen] = useState('Products');
  const [currencyCode, setCurrencyCode] = useState('USD');
  const [order, setOrder] = useState({
    lineItems: [],
    customer: null,
    fulfilmentType: 'ship',
    locationId: null,
    locationName: null,
    shippingAddress: {...EMPTY_ADDRESS},
    createdDraftOrder: null,
  });

  useEffect(() => {
    fetchGraphQL(SHOP_QUERY)
      .then(r => { if (r.data?.shop?.currencyCode) setCurrencyCode(r.data.shop.currencyCode); })
      .catch(() => {});
  }, []);

  function updateOrder(updates) {
    setOrder(prev => ({...prev, ...updates}));
  }

  switch (screen) {
    case 'Customer':
      return <CustomerScreen order={order} updateOrder={updateOrder} onBack={() => setScreen('Products')} onContinue={() => setScreen('Fulfilment')} />;
    case 'Fulfilment':
      return <FulfilmentScreen order={order} updateOrder={updateOrder} onBack={() => setScreen('Customer')} onContinue={() => setScreen('Creating')} />;
    case 'Creating':
      return (
        <CreatingScreen
          order={order}
          currencyCode={currencyCode}
          onBack={() => setScreen('Fulfilment')}
          onSuccess={(draftOrder) => { updateOrder({createdDraftOrder: draftOrder}); setScreen('Done'); }}
        />
      );
    case 'Done':
      return <DoneScreen order={order} />;
    default:
      return <ProductsScreen order={order} updateOrder={updateOrder} currencyCode={currencyCode} onContinue={() => setScreen('Customer')} />;
  }
}

// ---------------------------------------------------------------------------
// Screen 1 — Add products
// ---------------------------------------------------------------------------

function ProductsScreen({order, updateOrder, currencyCode, onContinue}) {
  const {i18n} = shopify;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetchGraphQL(PRODUCT_VARIANTS_QUERY, {query: query.trim()});
        setResults(r.data?.productVariants?.nodes || []);
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function addVariant(variant) {
    const existing = order.lineItems.find(li => li.variantId === variant.id);
    if (existing) {
      updateOrder({lineItems: order.lineItems.map(li => li.variantId === variant.id ? {...li, quantity: li.quantity + 1} : li)});
    } else {
      updateOrder({lineItems: [...order.lineItems, {variantId: variant.id, displayName: variant.displayName, price: variant.price, quantity: 1}]});
    }
    shopify.toast.show(`${variant.displayName} added`);
  }

  function adjustQty(variantId, delta) {
    const updated = order.lineItems
      .map(li => li.variantId === variantId ? {...li, quantity: li.quantity + delta} : li)
      .filter(li => li.quantity > 0);
    updateOrder({lineItems: updated});
  }

  return (
    <s-page heading={i18n.translate('modal_heading')}>
      <s-scroll-box>
        <s-stack direction="block" gap="base" padding="base">

          <s-search-field
            placeholder={i18n.translate('search_products_placeholder')}
            value={query}
            onInput={(e) => setQuery(e.currentTarget.value)}
          />

          {searching && (
            <s-stack direction="block" alignItems="center" padding="base">
              <s-spinner accessibilityLabel={i18n.translate('searching')} />
            </s-stack>
          )}

          {!searching && query.trim() && results.length === 0 && (
            <s-empty-state
              heading={i18n.translate('no_products_found')}
              subheading={i18n.translate('search_products_placeholder')}
            />
          )}

          {!searching && results.length > 0 && (
            <s-stack direction="block" gap="small">
              {results.map(v => (
                <s-clickable key={v.id} onClick={() => addVariant(v)}>
                  <s-section>
                    <s-stack direction="inline" gap="base" alignItems="center">
                      <s-stack direction="block" gap="small-200">
                        <s-text type="strong">{v.displayName}</s-text>
                        {v.sku && <s-badge tone="neutral">SKU: {v.sku}</s-badge>}
                      </s-stack>
                      <s-text color="subdued">{formatCurrency(v.price, currencyCode)}</s-text>
                    </s-stack>
                  </s-section>
                </s-clickable>
              ))}
            </s-stack>
          )}

          {order.lineItems.length > 0 && (
            <s-section heading={String(i18n.translate('order_items', {count: order.lineItems.length}))}>
              <s-stack direction="block" gap="small">
                {order.lineItems.map(item => (
                  <s-stack key={item.variantId} direction="inline" gap="base" alignItems="center">
                    <s-stack direction="block" gap="small-200">
                      <s-text type="strong">{item.displayName}</s-text>
                      <s-text type="small" color="subdued">{formatCurrency(item.price, currencyCode)} {i18n.translate('each')}</s-text>
                    </s-stack>
                    <s-stack direction="inline" gap="small" alignItems="center">
                      <s-button onClick={() => adjustQty(item.variantId, -1)}>-</s-button>
                      <s-text type="strong">{item.quantity}</s-text>
                      <s-button onClick={() => adjustQty(item.variantId, 1)}>+</s-button>
                    </s-stack>
                  </s-stack>
                ))}
              </s-stack>
            </s-section>
          )}

        </s-stack>
      </s-scroll-box>
      <s-footer>
        <s-footer-actions>
          <s-button onClick={() => window.close()}>{i18n.translate('cancel')}</s-button>
          <s-button variant="primary" disabled={order.lineItems.length === 0} onClick={onContinue}>
            {i18n.translate('continue')}
          </s-button>
        </s-footer-actions>
      </s-footer>
    </s-page>
  );
}

// ---------------------------------------------------------------------------
// Screen 2 — Customer
// ---------------------------------------------------------------------------

function CustomerScreen({order, updateOrder, onBack, onContinue}) {
  const {i18n} = shopify;
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await fetchGraphQL(CUSTOMERS_QUERY, {query: query.trim()});
        setResults(r.data?.customers?.nodes || []);
      } catch {
        // ignore
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  function selectCustomer(customer) {
    const d = customer.defaultAddress;
    updateOrder({
      customer,
      shippingAddress: d ? {
        address1: d.address1 || '',
        address2: d.address2 || '',
        city: d.city || '',
        provinceCode: d.provinceCode || '',
        zip: d.zip || '',
        countryCode: d.countryCodeV2 || '',
      } : {...EMPTY_ADDRESS},
    });
    setQuery('');
    setResults([]);
  }

  return (
    <s-page heading={i18n.translate('customer_screen_heading')}>
      <s-scroll-box>
        <s-stack direction="block" gap="base" padding="base">

          {order.customer ? (
            <s-section heading={i18n.translate('customer')}>
              <s-stack direction="block" gap="small-200">
                <s-text type="strong">{order.customer.displayName}</s-text>
                {order.customer.email && <s-text type="small" color="subdued">{order.customer.email}</s-text>}
                {order.customer.phone && <s-text type="small" color="subdued">{order.customer.phone}</s-text>}
                <s-button onClick={() => updateOrder({customer: null, shippingAddress: {...EMPTY_ADDRESS}})}>
                  {i18n.translate('change_customer')}
                </s-button>
              </s-stack>
            </s-section>
          ) : (
            <>
              <s-search-field
                placeholder={i18n.translate('search_customer_placeholder')}
                value={query}
                onInput={(e) => setQuery(e.currentTarget.value)}
              />

              {searching && (
                <s-stack direction="block" alignItems="center" padding="base">
                  <s-spinner accessibilityLabel={i18n.translate('searching')} />
                </s-stack>
              )}

              {!searching && query.trim() && results.length === 0 && (
                <s-empty-state
                  heading={i18n.translate('no_customers_found')}
                  subheading={i18n.translate('search_customer_placeholder')}
                />
              )}

              {!searching && results.length > 0 && (
                <s-stack direction="block" gap="small">
                  {results.map(c => (
                    <s-clickable key={c.id} onClick={() => selectCustomer(c)}>
                      <s-section>
                        <s-stack direction="block" gap="small-200">
                          <s-text type="strong">{c.displayName}</s-text>
                          <s-stack direction="inline" gap="small">
                            {c.email && <s-text type="small" color="subdued">{c.email}</s-text>}
                            {c.phone && <s-text type="small" color="subdued">{c.phone}</s-text>}
                          </s-stack>
                        </s-stack>
                      </s-section>
                    </s-clickable>
                  ))}
                </s-stack>
              )}

              <s-banner heading={i18n.translate('no_customer_ok')} tone="info" />
            </>
          )}

        </s-stack>
      </s-scroll-box>
      <s-footer>
        <s-footer-actions>
          <s-button onClick={onBack}>{i18n.translate('back')}</s-button>
          <s-button variant="primary" onClick={onContinue}>{i18n.translate('continue')}</s-button>
        </s-footer-actions>
      </s-footer>
    </s-page>
  );
}

// ---------------------------------------------------------------------------
// Screen 3 — Fulfilment (location + type + shipping address)
// ---------------------------------------------------------------------------

function FulfilmentScreen({order, updateOrder, onBack, onContinue}) {
  const {i18n} = shopify;
  const [locations, setLocations] = useState([]);
  const [locationsLoading, setLocationsLoading] = useState(true);
  const [locationsError, setLocationsError] = useState(null);

  useEffect(() => {
    async function load() {
      try {
        const r = await fetchGraphQL(LOCATIONS_QUERY);
        setLocations(r.data?.locations?.nodes || []);
      } catch (err) {
        setLocationsError(err.message);
      } finally {
        setLocationsLoading(false);
      }
    }
    load();
  }, []);

  function pickLocation(id) {
    if (id === 'auto') {
      updateOrder({locationId: null, locationName: null});
    } else {
      const loc = locations.find(l => l.id === id);
      updateOrder({locationId: id, locationName: loc?.name || id});
    }
  }

  function updateAddress(field, value) {
    updateOrder({shippingAddress: {...order.shippingAddress, [field]: value}});
  }

  return (
    <s-page heading={i18n.translate('fulfilment_screen_heading')}>
      <s-scroll-box>
        <s-stack direction="block" gap="base" padding="base">

          <s-section heading={i18n.translate('fulfilment_type')}>
            <s-choice-list values={[order.fulfilmentType]} onChange={(e) => updateOrder({fulfilmentType: e.currentTarget.values[0]})}>
              <s-choice value="ship">
                {i18n.translate('ship_to_customer')}
              </s-choice>
              <s-choice value="pickup">
                {i18n.translate('in_store_pickup')}
              </s-choice>
            </s-choice-list>
          </s-section>

          <s-section heading={i18n.translate('fulfilment_location')}>
            {locationsLoading ? (
              <s-stack direction="block" alignItems="center" padding="base">
                <s-spinner accessibilityLabel={i18n.translate('loading')} />
              </s-stack>
            ) : locationsError ? (
              <s-banner heading={i18n.translate('error_loading_locations')} tone="critical" />
            ) : (
              <s-stack direction="block" gap="small">
                <s-clickable onClick={() => pickLocation('auto')}>
                  <s-stack direction="block" gap="small-200" padding="small">
                    <s-text type="strong">{i18n.translate('auto_route_label')}</s-text>
                    <s-text type="small" color="subdued">{i18n.translate('auto_route_description')}</s-text>
                    {!order.locationId && <s-badge tone="success">{i18n.translate('selected')}</s-badge>}
                  </s-stack>
                </s-clickable>
                <s-divider />
                {locations.map(loc => (
                  <s-clickable key={loc.id} onClick={() => pickLocation(loc.id)}>
                    <s-stack direction="inline" gap="base" alignItems="center" padding="small">
                      <s-stack direction="block" gap="small-200">
                        <s-text type="strong">{loc.name}</s-text>
                        <s-text type="small" color="subdued">
                          {[loc.address?.city, loc.address?.province].filter(Boolean).join(', ')}
                        </s-text>
                      </s-stack>
                      {order.locationId === loc.id && <s-badge tone="success">{i18n.translate('selected')}</s-badge>}
                    </s-stack>
                  </s-clickable>
                ))}
              </s-stack>
            )}
          </s-section>

          {order.fulfilmentType === 'ship' && (
            <s-section heading={i18n.translate('shipping_address')}>
              <s-stack direction="block" gap="small">
                {!order.shippingAddress.address1 && (
                  <s-banner heading={i18n.translate('no_default_address')} tone="warning" />
                )}
                <s-text-field
                  label={i18n.translate('address1')}
                  value={order.shippingAddress.address1}
                  onChange={(e) => updateAddress('address1', e.currentTarget.value)}
                />
                <s-text-field
                  label={i18n.translate('address2')}
                  value={order.shippingAddress.address2}
                  onChange={(e) => updateAddress('address2', e.currentTarget.value)}
                />
                <s-text-field
                  label={i18n.translate('city')}
                  value={order.shippingAddress.city}
                  onChange={(e) => updateAddress('city', e.currentTarget.value)}
                />
                <s-text-field
                  label={i18n.translate('province_code')}
                  value={order.shippingAddress.provinceCode}
                  onChange={(e) => updateAddress('provinceCode', e.currentTarget.value)}
                />
                <s-text-field
                  label={i18n.translate('zip')}
                  value={order.shippingAddress.zip}
                  onChange={(e) => updateAddress('zip', e.currentTarget.value)}
                />
                <s-text-field
                  label={i18n.translate('country_code')}
                  value={order.shippingAddress.countryCode}
                  onChange={(e) => updateAddress('countryCode', e.currentTarget.value)}
                />
              </s-stack>
            </s-section>
          )}

          {order.fulfilmentType === 'pickup' && order.locationId && (
            <s-banner
              heading={String(i18n.translate('pickup_at', {location: order.locationName}))}
              tone="success"
            />
          )}

        </s-stack>
      </s-scroll-box>
      <s-footer>
        <s-footer-actions>
          <s-button onClick={onBack}>{i18n.translate('back')}</s-button>
          <s-button variant="primary" disabled={locationsLoading} onClick={onContinue}>
            {i18n.translate('create_order')}
          </s-button>
        </s-footer-actions>
      </s-footer>
    </s-page>
  );
}

// ---------------------------------------------------------------------------
// Screen 4 — Creating (calls draftOrderCreate)
// ---------------------------------------------------------------------------

function CreatingScreen({order, onBack, onSuccess}) {
  const {i18n} = shopify;
  const [status, setStatus] = useState(i18n.translate('preparing'));
  const [error, setError] = useState(null);

  async function create() {
    try {
      setError(null);
      setStatus(i18n.translate('creating_draft_order'));

      const reserveUntil = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

      const tags = ['central-fulfilment', order.fulfilmentType === 'ship' ? 'central-ship' : 'central-pickup'];
      if (order.locationId) {
        tags.push(`location:${order.locationId.split('/').pop()}`);
      }

      const locationNote = order.locationId
        ? `Requested location: ${order.locationName}.`
        : 'Location: auto-routed by Shopify.';
      const typeNote = order.fulfilmentType === 'ship' ? 'Ship to customer.' : 'In-store pickup.';
      const note = `Central fulfilment order created via POS. ${typeNote} ${locationNote}`;

      const input = {
        lineItems: order.lineItems.map(li => ({variantId: li.variantId, quantity: li.quantity})),
        reserveInventoryUntil: reserveUntil,
        tags,
        note,
      };

      if (order.customer?.id) {
        input.customerId = order.customer.id;
      }

      const hasAddress = order.fulfilmentType === 'ship' && order.shippingAddress?.address1;
      if (hasAddress) {
        const a = order.shippingAddress;
        input.shippingAddress = {
          address1: a.address1,
          ...(a.address2 && {address2: a.address2}),
          city: a.city,
          ...(a.provinceCode && {provinceCode: a.provinceCode}),
          zip: a.zip,
          ...(a.countryCode && {countryCode: a.countryCode}),
        };
        input.shippingLine = {title: 'Standard Shipping', price: '0.00'};
      } else if (order.fulfilmentType === 'pickup') {
        input.shippingLine = {title: 'In-Store Pickup', price: '0.00'};
      }

      setStatus(i18n.translate('submitting'));
      const r = await fetchGraphQL(DRAFT_ORDER_CREATE_MUTATION, {input});

      const userErrors = r.data?.draftOrderCreate?.userErrors || [];
      if (userErrors.length > 0) throw new Error(userErrors[0].message);

      const draftOrder = r.data?.draftOrderCreate?.draftOrder;
      if (!draftOrder) throw new Error(i18n.translate('error_creating'));

      shopify.toast.show(String(i18n.translate('order_created', {name: draftOrder.name})));
      onSuccess(draftOrder);
    } catch (err) {
      setError(err.message || i18n.translate('error_creating'));
    }
  }

  useEffect(() => {
    create();
  }, []);

  if (error) {
    return (
      <s-page heading={i18n.translate('creating_heading')}>
        <s-scroll-box>
          <s-stack direction="block" padding="base" gap="base">
            <s-banner heading={i18n.translate('error_creating')} tone="critical" />
            <s-text color="subdued">{error}</s-text>
          </s-stack>
        </s-scroll-box>
        <s-footer>
          <s-footer-actions>
            <s-button onClick={onBack}>{i18n.translate('back')}</s-button>
            <s-button variant="primary" onClick={() => { setError(null); create(); }}>
              {i18n.translate('retry')}
            </s-button>
          </s-footer-actions>
        </s-footer>
      </s-page>
    );
  }

  return (
    <s-page heading={i18n.translate('creating_heading')}>
      <s-scroll-box>
        <s-stack direction="block" alignItems="center" gap="base" padding="large">
          <s-spinner accessibilityLabel={status} />
          <s-text color="subdued">{status}</s-text>
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}

// ---------------------------------------------------------------------------
// Screen 5 — Done
// ---------------------------------------------------------------------------

function DoneScreen({order}) {
  const {i18n} = shopify;
  const draftOrder = order.createdDraftOrder;

  return (
    <s-page heading={i18n.translate('done_heading')}>
      <s-scroll-box>
        <s-stack direction="block" gap="base" padding="base">
          <s-banner
            heading={String(i18n.translate('order_created', {name: draftOrder?.name || ''}))}
            tone="success"
          />

          <s-section heading={i18n.translate('order_summary')}>
            <s-stack direction="block" gap="small-200">
              <s-stack direction="inline" gap="base">
                <s-text color="subdued">{i18n.translate('fulfilment_type')}</s-text>
                <s-text>{order.fulfilmentType === 'ship' ? i18n.translate('ship_to_customer') : i18n.translate('in_store_pickup')}</s-text>
              </s-stack>
              <s-stack direction="inline" gap="base">
                <s-text color="subdued">{i18n.translate('fulfilment_location')}</s-text>
                <s-text>{order.locationName || i18n.translate('auto_route_label')}</s-text>
              </s-stack>
              {order.customer && (
                <s-stack direction="inline" gap="base">
                  <s-text color="subdued">{i18n.translate('customer')}</s-text>
                  <s-text>{order.customer.displayName}</s-text>
                </s-stack>
              )}
              {draftOrder?.reserveInventoryUntil && (
                <s-stack direction="inline" gap="base">
                  <s-text color="subdued">{i18n.translate('inventory_reserved_until')}</s-text>
                  <s-text>{new Date(draftOrder.reserveInventoryUntil).toLocaleString()}</s-text>
                </s-stack>
              )}
            </s-stack>
          </s-section>
        </s-stack>
      </s-scroll-box>
      <s-footer>
        <s-footer-actions>
          <s-button variant="primary" onClick={() => window.close()}>{i18n.translate('done')}</s-button>
        </s-footer-actions>
      </s-footer>
    </s-page>
  );
}
