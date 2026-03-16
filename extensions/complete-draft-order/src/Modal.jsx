import "@shopify/ui-extensions/preact";
import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

const DRAFT_ORDERS_QUERY = `
  query DraftOrders {
    draftOrders(first: 50, query: "status:open", sortKey: UPDATED_AT, reverse: true) {
      nodes {
        id
        name
        status
        note2
        createdAt
        updatedAt
        tags
        reserveInventoryUntil
        totalPriceSet {
          shopMoney {
            amount
            currencyCode
          }
        }
        customer {
          id
          displayName
        }
      }
    }
  }
`;

const DRAFT_ORDER_DETAILS_QUERY = `
  query DraftOrderDetails($id: ID!) {
    draftOrder(id: $id) {
      id
      name
      status
      note2
      tags
      reserveInventoryUntil
      totalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      subtotalPriceSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      totalTaxSet {
        shopMoney {
          amount
          currencyCode
        }
      }
      customer {
        id
        displayName
        email
        phone
      }
      lineItems(first: 50) {
        nodes {
          id
          name
          quantity
          custom
          originalUnitPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          discountedUnitPriceSet {
            shopMoney {
              amount
              currencyCode
            }
          }
          variant {
            id
            title
            sku
          }
          product {
            id
            title
          }
          appliedDiscount {
            title
            value
            valueType
            amountV2 {
              amount
              currencyCode
            }
          }
        }
      }
      appliedDiscount {
        title
        value
        valueType
        amountV2 {
          amount
          currencyCode
        }
      }
    }
  }
`;

const DRAFT_ORDER_UPDATE_MUTATION = `
  mutation DraftOrderUpdate($id: ID!, $input: DraftOrderInput!) {
    draftOrderUpdate(id: $id, input: $input) {
      draftOrder {
        id
        tags
      }
      userErrors {
        field
        message
      }
    }
  }
`;

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

function extractNumericId(gid) {
  if (!gid) return null;
  const match = gid.match(/\/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
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

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [screen, setScreen] = useState('DraftOrderList');
  const [screenData, setScreenData] = useState({
    draftOrderId: null,
    draftOrderName: null,
  });

  const navigateTo = (newScreen, data = {}) => {
    setScreenData(prev => ({...prev, ...data}));
    setScreen(newScreen);
  };

  switch (screen) {
    case 'DraftOrderDetails':
      return (
        <DraftOrderDetails
          draftOrderId={screenData.draftOrderId}
          draftOrderName={screenData.draftOrderName}
          navigateTo={navigateTo}
          goBack={() => setScreen('DraftOrderList')}
        />
      );
    case 'LoadingScreen':
      return (
        <LoadingScreen
          draftOrderId={screenData.draftOrderId}
          draftOrderName={screenData.draftOrderName}
          goBack={() => setScreen('DraftOrderDetails')}
        />
      );
    default:
      return <DraftOrderList navigateTo={navigateTo} />;
  }
}

// ---------------------------------------------------------------------------
// Screen 1 — Browse open draft orders
// ---------------------------------------------------------------------------

function DraftOrderList({navigateTo}) {
  const {i18n} = shopify;
  const [allDraftOrders, setAllDraftOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('open');
  const [filter, setFilter] = useState('');

  useEffect(() => {
    loadDraftOrders();
  }, []);

  async function loadDraftOrders() {
    try {
      setLoading(true);
      const result = await fetchGraphQL(DRAFT_ORDERS_QUERY);
      setAllDraftOrders(result.data?.draftOrders?.nodes || []);
      setError(null);
    } catch (err) {
      setError(err.message);
      shopify.toast.show(i18n.translate('error_loading_draft_orders'));
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(d) {
    navigateTo('DraftOrderDetails', {
      draftOrderId: d.id,
      draftOrderName: d.name,
    });
  }

  const openOrders = allDraftOrders.filter(
    d => !d.tags?.includes('pos-processing') && !d.tags?.includes('completed-via-pos'),
  );
  const activityOrders = allDraftOrders.filter(
    d => d.tags?.includes('pos-processing') || d.tags?.includes('completed-via-pos'),
  );
  const visibleOrders = tab === 'open' ? openOrders : activityOrders;

  const lowerFilter = filter.toLowerCase();
  const filteredOrders = lowerFilter
    ? visibleOrders.filter(d =>
        d.name?.toLowerCase().includes(lowerFilter) ||
        d.customer?.displayName?.toLowerCase().includes(lowerFilter),
      )
    : visibleOrders;

  function statusBadge(d) {
    if (d.tags?.includes('completed-via-pos')) return <s-badge tone="success">{i18n.translate('completed_tag')}</s-badge>;
    if (d.tags?.includes('pos-processing')) return <s-badge tone="warning">{i18n.translate('processing_tag')}</s-badge>;
    return null;
  }

  return (
    <s-page heading={i18n.translate('modal_heading')}>
      <s-scroll-box>
        <s-stack direction="block" gap="base" padding="base">

          <s-tabs value={tab} onChange={(e) => { setTab(e.currentTarget.value); setFilter(''); }}>
            <s-tab-list>
              <s-tab controls="open">{i18n.translate('tab_open')} ({openOrders.length})</s-tab>
              <s-tab controls="activity">{i18n.translate('tab_activity')} ({activityOrders.length})</s-tab>
            </s-tab-list>
            <s-tab-panel id="open" />
            <s-tab-panel id="activity" />
          </s-tabs>

          <s-search-field
            placeholder={i18n.translate('search_placeholder')}
            value={filter}
            onInput={(e) => setFilter(e.currentTarget.value)}
          />

          {loading ? (
            <s-stack direction="block" alignItems="center" gap="base" padding="large">
              <s-spinner accessibilityLabel={i18n.translate('loading')} />
              <s-text color="subdued">{i18n.translate('loading')}</s-text>
            </s-stack>
          ) : error ? (
            <s-banner heading={i18n.translate('error_loading_draft_orders')} tone="critical" />
          ) : filteredOrders.length === 0 ? (
            <s-empty-state
              heading={tab === 'open' ? i18n.translate('no_draft_orders') : i18n.translate('no_activity')}
              subheading={filter ? i18n.translate('try_different_search') : ''}
            />
          ) : (
            <s-stack direction="block" gap="small">
              {filteredOrders.map(d => {
                const money = d.totalPriceSet?.shopMoney;
                return (
                  <s-clickable key={d.id} onClick={() => handleSelect(d)}>
                    <s-section>
                      <s-stack direction="inline" gap="base" alignItems="center">
                        <s-stack direction="block" gap="small-200">
                          <s-text type="strong">{d.name}</s-text>
                          <s-stack direction="inline" gap="small">
                            {d.customer?.displayName && (
                              <s-text type="small" color="subdued">{d.customer.displayName}</s-text>
                            )}
                            {money && (
                              <s-text type="small">{formatCurrency(money.amount, money.currencyCode)}</s-text>
                            )}
                            <s-text type="small" color="subdued">{formatDate(d.updatedAt)}</s-text>
                          </s-stack>
                        </s-stack>
                        {statusBadge(d)}
                      </s-stack>
                    </s-section>
                  </s-clickable>
                );
              })}
            </s-stack>
          )}

        </s-stack>
      </s-scroll-box>
      <s-footer>
        <s-footer-actions>
          <s-button onClick={() => window.close()}>
            {i18n.translate('cancel')}
          </s-button>
        </s-footer-actions>
      </s-footer>
    </s-page>
  );
}

// ---------------------------------------------------------------------------
// Screen 2 — Draft order details
// ---------------------------------------------------------------------------

function DraftOrderDetails({draftOrderId, draftOrderName, navigateTo, goBack}) {
  const {i18n} = shopify;
  const [draftOrder, setDraftOrder] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [cartHasItems, setCartHasItems] = useState(false);
  const [tapped, setTapped] = useState(false);
  const [releasing, setReleasing] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const result = await fetchGraphQL(DRAFT_ORDER_DETAILS_QUERY, {id: draftOrderId});
        setDraftOrder(result.data?.draftOrder);
        setError(null);

        const currentCart = shopify.cart.current?.value;
        if (currentCart?.lineItems?.length > 0) {
          setCartHasItems(true);
        }
      } catch (err) {
        setError(err.message);
        shopify.toast.show(i18n.translate('error_loading_details'));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [draftOrderId]);

  const isProcessing = draftOrder?.tags?.includes('pos-processing');
  const isCompleted = draftOrder?.tags?.includes('completed-via-pos');

  function handleLoadIntoCart() {
    if (tapped) return;
    setTapped(true);
    navigateTo('LoadingScreen', {
      draftOrderId,
      draftOrderName: draftOrder?.name || draftOrderName,
    });
  }

  async function handleRelease() {
    if (releasing) return;
    setReleasing(true);
    try {
      const currentTags = (draftOrder.tags || []).filter(t => t !== 'pos-processing');
      await fetchGraphQL(DRAFT_ORDER_UPDATE_MUTATION, {
        id: draftOrderId,
        input: {tags: currentTags},
      });
      shopify.toast.show(i18n.translate('draft_order_released'));
      goBack();
    } catch {
      shopify.toast.show(i18n.translate('error_releasing'));
      setReleasing(false);
    }
  }

  async function handleMarkCompleted() {
    if (releasing) return;
    setReleasing(true);
    try {
      await fetchGraphQL(DRAFT_ORDER_UPDATE_MUTATION, {
        id: draftOrderId,
        input: {tags: ['completed-via-pos']},
      });
      shopify.toast.show(i18n.translate('marked_completed'));
      goBack();
    } catch {
      shopify.toast.show(i18n.translate('error_marking_completed'));
      setReleasing(false);
    }
  }

  if (loading) {
    return (
      <s-page heading={draftOrderName || i18n.translate('draft_order_details')}>
        <s-scroll-box>
          <s-stack direction="block" alignItems="center" gap="base" padding="large">
            <s-spinner accessibilityLabel={i18n.translate('loading')} />
          </s-stack>
        </s-scroll-box>
      </s-page>
    );
  }

  if (error || !draftOrder) {
    return (
      <s-page heading={draftOrderName || i18n.translate('draft_order_details')}>
        <s-scroll-box>
          <s-stack direction="block" padding="base">
            <s-banner heading={i18n.translate('error_loading_details')} tone="critical" />
          </s-stack>
        </s-scroll-box>
        <s-footer>
          <s-footer-actions>
            <s-button onClick={goBack}>{i18n.translate('back')}</s-button>
          </s-footer-actions>
        </s-footer>
      </s-page>
    );
  }

  const lineItems = draftOrder.lineItems?.nodes || [];
  const subtotal = draftOrder.subtotalPriceSet?.shopMoney;
  const tax = draftOrder.totalTaxSet?.shopMoney;
  const total = draftOrder.totalPriceSet?.shopMoney;
  const discount = draftOrder.appliedDiscount;
  const currency = total?.currencyCode || 'USD';

  return (
    <s-page heading={draftOrder.name}>
      <s-scroll-box>
        <s-stack direction="block" gap="base" padding="base">

          {isCompleted && (
            <s-banner heading={i18n.translate('completed_detail_info')} tone="info" />
          )}

          {isProcessing && !isCompleted && (
            <s-banner heading={i18n.translate('processing_detail_warning')} tone="warning" />
          )}

          {!isProcessing && !isCompleted && cartHasItems && (
            <s-banner heading={i18n.translate('cart_not_empty_warning')} tone="warning" />
          )}

          {draftOrder.customer && (
            <s-section heading={i18n.translate('customer')}>
              <s-stack direction="block" gap="small-200">
                <s-text type="strong">{draftOrder.customer.displayName}</s-text>
                {draftOrder.customer.email && (
                  <s-text type="small" color="subdued">{draftOrder.customer.email}</s-text>
                )}
                {draftOrder.customer.phone && (
                  <s-text type="small" color="subdued">{draftOrder.customer.phone}</s-text>
                )}
              </s-stack>
            </s-section>
          )}

          <s-section heading={i18n.translate('line_items')}>
            <s-stack direction="block" gap="small">
              {lineItems.map(item => {
                const unitPrice =
                  item.discountedUnitPriceSet?.shopMoney ||
                  item.originalUnitPriceSet?.shopMoney;
                return (
                  <s-stack key={item.id} direction="inline" gap="base" alignItems="center">
                    <s-stack direction="block" gap="small-200">
                      <s-text type="strong">{item.name} x {item.quantity}</s-text>
                      {item.variant?.sku && (
                        <s-badge tone="neutral">SKU: {item.variant.sku}</s-badge>
                      )}
                      {item.custom && (
                        <s-badge tone="info">{i18n.translate('custom_item')}</s-badge>
                      )}
                      {item.appliedDiscount && (
                        <s-text type="small" color="subdued">
                          {item.appliedDiscount.title} (-{formatCurrency(item.appliedDiscount.amountV2?.amount, currency)})
                        </s-text>
                      )}
                    </s-stack>
                    {unitPrice && (
                      <s-text>{formatCurrency(unitPrice.amount, unitPrice.currencyCode)}</s-text>
                    )}
                  </s-stack>
                );
              })}
            </s-stack>
          </s-section>

          {draftOrder.note2 && (
            <s-section heading={i18n.translate('note')}>
              <s-text color="subdued">{draftOrder.note2}</s-text>
            </s-section>
          )}

          <s-section heading={i18n.translate('totals')}>
            <s-stack direction="block" gap="small-200">
              {subtotal && (
                <s-stack direction="inline" gap="base">
                  <s-text color="subdued">{i18n.translate('subtotal')}</s-text>
                  <s-text>{formatCurrency(subtotal.amount, subtotal.currencyCode)}</s-text>
                </s-stack>
              )}
              {discount && (
                <s-stack direction="inline" gap="base">
                  <s-text color="subdued">{i18n.translate('discount')}</s-text>
                  <s-text>-{formatCurrency(discount.amountV2?.amount, currency)} ({discount.title})</s-text>
                </s-stack>
              )}
              {tax && parseFloat(tax.amount) > 0 && (
                <s-stack direction="inline" gap="base">
                  <s-text color="subdued">{i18n.translate('tax')}</s-text>
                  <s-text>{formatCurrency(tax.amount, tax.currencyCode)}</s-text>
                </s-stack>
              )}
              {total && (
                <>
                  <s-divider />
                  <s-stack direction="inline" gap="base">
                    <s-text type="strong">{i18n.translate('total')}</s-text>
                    <s-text type="strong">{formatCurrency(total.amount, total.currencyCode)}</s-text>
                  </s-stack>
                </>
              )}
            </s-stack>
          </s-section>

        </s-stack>
      </s-scroll-box>
      <s-footer>
        <s-footer-actions>
          {isCompleted ? (
            <s-button onClick={goBack}>{i18n.translate('back')}</s-button>
          ) : isProcessing ? (
            <>
              <s-button disabled={releasing} onClick={handleRelease}>
                {i18n.translate('release_and_unlock')}
              </s-button>
              <s-button variant="primary" disabled={releasing} onClick={handleMarkCompleted}>
                {i18n.translate('mark_completed')}
              </s-button>
            </>
          ) : (
            <>
              <s-button onClick={goBack}>{i18n.translate('back')}</s-button>
              <s-button variant="primary" disabled={tapped} onClick={handleLoadIntoCart}>
                {i18n.translate('load_into_cart')}
              </s-button>
            </>
          )}
        </s-footer-actions>
      </s-footer>
    </s-page>
  );
}

// ---------------------------------------------------------------------------
// Screen 3 — Load draft order into POS cart
// ---------------------------------------------------------------------------

function LoadingScreen({draftOrderId, draftOrderName, goBack}) {
  const {i18n} = shopify;
  const cart = shopify.cart;
  const [status, setStatus] = useState(i18n.translate('preparing'));
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  async function loadDraftOrderIntoCart() {
    try {
      setError(null);

      setStatus(i18n.translate('loading_draft_order'));
      const result = await fetchGraphQL(DRAFT_ORDER_DETAILS_QUERY, {id: draftOrderId});
      const draftOrder = result.data?.draftOrder;
      if (!draftOrder) throw new Error(i18n.translate('draft_order_not_found'));

      setStatus(i18n.translate('releasing_inventory'));
      const currentTags = [...(draftOrder.tags || [])];
      if (!currentTags.includes('pos-processing')) {
        currentTags.push('pos-processing');
      }
      const updateInput = {tags: currentTags};
      if (draftOrder.reserveInventoryUntil) {
        updateInput.reserveInventoryUntil = null;
      }
      const updateResult = await fetchGraphQL(DRAFT_ORDER_UPDATE_MUTATION, {
        id: draftOrderId,
        input: updateInput,
      });
      const updateErrors = updateResult.data?.draftOrderUpdate?.userErrors || [];
      if (updateErrors.length > 0) {
        throw new Error(updateErrors[0].message || 'Failed to update draft order');
      }

      setStatus(i18n.translate('clearing_cart'));
      await cart.clearCart();

      if (draftOrder.note2) {
        setStatus(i18n.translate('setting_note'));
        try {
          await cart.bulkCartUpdate({note: draftOrder.note2});
        } catch {
          // note-only bulkCartUpdate may be rejected on some API versions
        }
      }

      if (draftOrder.customer?.id) {
        setStatus(i18n.translate('setting_customer'));
        const numericId = extractNumericId(draftOrder.customer.id);
        if (numericId) {
          await cart.setCustomer({id: numericId});
        }
      }

      const lineItems = draftOrder.lineItems?.nodes || [];
      setStatus(String(i18n.translate('adding_line_items', {count: lineItems.length})));
      const failedItems = [];

      for (const item of lineItems) {
        try {
          let uuid;

          if (item.custom) {
            const price = item.originalUnitPriceSet?.shopMoney?.amount || '0';
            uuid = await cart.addCustomSale({
              title: item.name,
              price,
              quantity: item.quantity,
              taxable: true,
            });
          } else if (item.variant?.id) {
            const numericVariantId = extractNumericId(item.variant.id);
            if (numericVariantId) {
              uuid = await cart.addLineItem(numericVariantId, item.quantity);
            }
          }

          if (uuid && item.appliedDiscount) {
            const discType =
              item.appliedDiscount.valueType === 'PERCENTAGE'
                ? 'Percentage'
                : 'FixedAmount';
            await cart.setLineItemDiscount(
              uuid,
              discType,
              item.appliedDiscount.title || i18n.translate('discount'),
              String(item.appliedDiscount.value),
            );
          }
        } catch (itemErr) {
          failedItems.push(item.name);
        }
      }

      if (failedItems.length > 0 && failedItems.length === lineItems.length) {
        throw new Error(`None of the ${lineItems.length} line items could be added to the cart. Ensure products are available on the POS channel.`);
      }
      if (failedItems.length > 0) {
        shopify.toast.show(`${failedItems.length} item(s) skipped (not available on POS)`);
      }

      setStatus(i18n.translate('setting_properties'));
      await cart.addCartProperties({
        _draft_order_id: draftOrderId,
        _draft_order_name: draftOrder.name,
      });

      if (draftOrder.appliedDiscount) {
        setStatus(i18n.translate('applying_discount'));
        const disc = draftOrder.appliedDiscount;
        const discType =
          disc.valueType === 'PERCENTAGE' ? 'Percentage' : 'FixedAmount';
        await cart.applyCartDiscount(
          discType,
          disc.title || i18n.translate('discount'),
          String(disc.value),
        );
      }

      setDone(true);
      shopify.toast.show(
        String(i18n.translate('cart_loaded', {name: draftOrder.name})),
      );

      setTimeout(() => window.close(), 800);
    } catch (err) {
      setError(err.message || i18n.translate('error_loading_cart'));
    }
  }

  useEffect(() => {
    loadDraftOrderIntoCart();
  }, []);

  if (error) {
    return (
      <s-page heading={draftOrderName || i18n.translate('loading_cart')}>
        <s-scroll-box>
          <s-stack direction="block" padding="base" gap="base">
            <s-banner heading={i18n.translate('error_loading_cart')} tone="critical" />
            <s-text color="subdued">{error}</s-text>
          </s-stack>
        </s-scroll-box>
        <s-footer>
          <s-footer-actions>
            <s-button onClick={goBack}>{i18n.translate('back')}</s-button>
            <s-button
              variant="primary"
              onClick={() => {
                setError(null);
                loadDraftOrderIntoCart();
              }}
            >
              {i18n.translate('retry')}
            </s-button>
          </s-footer-actions>
        </s-footer>
      </s-page>
    );
  }

  return (
    <s-page heading={draftOrderName || i18n.translate('loading_cart')}>
      <s-scroll-box>
        <s-stack direction="block" alignItems="center" gap="base" padding="large">
          {done ? (
            <s-text type="strong" color="subdued">{i18n.translate('done')}</s-text>
          ) : (
            <>
              <s-spinner accessibilityLabel={status} />
              <s-text color="subdued">{status}</s-text>
            </>
          )}
        </s-stack>
      </s-scroll-box>
    </s-page>
  );
}
