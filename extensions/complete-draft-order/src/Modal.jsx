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
  const operationName = query.match(/(?:query|mutation)\s+(\w+)/)?.[1] || 'unknown';
  console.log(`[fetchGraphQL] ${operationName} — sending request`, {variables});

  let response;
  try {
    response = await fetch('shopify:admin/api/graphql.json', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({query, variables}),
    });
  } catch (fetchErr) {
    console.error(`[fetchGraphQL] ${operationName} — network/fetch error:`, fetchErr);
    throw fetchErr;
  }

  console.log(`[fetchGraphQL] ${operationName} — response status: ${response.status}`);

  if (!response.ok) {
    const body = await response.text().catch(() => '(could not read body)');
    console.error(`[fetchGraphQL] ${operationName} — HTTP error ${response.status}:`, body);
    throw new Error(`HTTP error: ${response.status}`);
  }

  const result = await response.json();
  console.log(`[fetchGraphQL] ${operationName} — response:`, JSON.stringify(result, null, 2));

  if (result.errors && !result.data) {
    console.error(`[fetchGraphQL] ${operationName} — GraphQL errors (no data):`, result.errors);
    throw new Error(result.errors[0]?.message || 'GraphQL error');
  }

  if (result.errors) {
    console.warn(`[fetchGraphQL] ${operationName} — partial errors (data present):`, result.errors);
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
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState('open');

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
      console.error('[DraftOrderList] loadDraftOrders failed:', err);
      setError(err.message);
      shopify.toast.show(i18n.translate('error_loading_draft_orders'));
    } finally {
      setLoading(false);
    }
  }

  function handleContinue() {
    if (!selected) return;
    const draftOrder = allDraftOrders.find(d => d.id === selected);
    if (!draftOrder) return;
    navigateTo('DraftOrderDetails', {
      draftOrderId: draftOrder.id,
      draftOrderName: draftOrder.name,
    });
  }

  function switchTab(newTab) {
    setTab(newTab);
    setSelected(null);
  }

  function choiceLabel(d) {
    const money = d.totalPriceSet?.shopMoney;
    const parts = [d.name];
    if (d.tags?.includes('pos-processing')) parts.push(`⚠ ${i18n.translate('processing_tag')}`);
    if (d.tags?.includes('completed-via-pos')) parts.push(`✓ ${i18n.translate('completed_tag')}`);
    if (d.customer?.displayName) parts.push(d.customer.displayName);
    if (money) parts.push(formatCurrency(money.amount, money.currencyCode));
    parts.push(formatDate(d.updatedAt));
    return parts.join(' · ');
  }

  const openOrders = allDraftOrders.filter(
    d => !d.tags?.includes('pos-processing') && !d.tags?.includes('completed-via-pos'),
  );
  const activityOrders = allDraftOrders.filter(
    d => d.tags?.includes('pos-processing') || d.tags?.includes('completed-via-pos'),
  );
  const visibleOrders = tab === 'open' ? openOrders : activityOrders;

  return (
    <s-page heading={i18n.translate('modal_heading')}>
      <s-scroll-box>
        <s-box padding="base">
          <s-box paddingBlockEnd="base">
            <s-segmented-button-group>
              <s-button
                variant={tab === 'open' ? 'primary' : undefined}
                onClick={() => switchTab('open')}
              >
                {i18n.translate('tab_open')} ({openOrders.length})
              </s-button>
              <s-button
                variant={tab === 'activity' ? 'primary' : undefined}
                onClick={() => switchTab('activity')}
              >
                {i18n.translate('tab_activity')} ({activityOrders.length})
              </s-button>
            </s-segmented-button-group>
          </s-box>

          {loading ? (
            <s-text>{i18n.translate('loading')}</s-text>
          ) : error ? (
            <s-banner heading={i18n.translate('error_loading_draft_orders')} tone="critical" />
          ) : visibleOrders.length === 0 ? (
            <s-banner
              heading={tab === 'open' ? i18n.translate('no_draft_orders') : i18n.translate('no_activity')}
              tone="warning"
            />
          ) : (
            <s-section heading={tab === 'open' ? i18n.translate('select_draft_order') : i18n.translate('activity_heading')}>
              <s-box paddingBlockStart="base">
                <s-choice-list
                  onChange={(event) => setSelected(event.currentTarget.values[0])}
                >
                  {visibleOrders.map(d => (
                    <s-choice key={d.id} value={d.id}>
                      {choiceLabel(d)}
                    </s-choice>
                  ))}
                </s-choice-list>
              </s-box>
            </s-section>
          )}
        </s-box>
      </s-scroll-box>
      <s-footer>
        <s-footer-actions>
          <s-button onClick={() => window.close()}>
            {i18n.translate('cancel')}
          </s-button>
          <s-button variant="primary" disabled={!selected} onClick={handleContinue}>
            {i18n.translate('continue')}
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
          <s-box padding="base">
            <s-text>{i18n.translate('loading')}</s-text>
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  if (error || !draftOrder) {
    return (
      <s-page heading={draftOrderName || i18n.translate('draft_order_details')}>
        <s-scroll-box>
          <s-box padding="base">
            <s-banner heading={i18n.translate('error_loading_details')} tone="critical" />
          </s-box>
        </s-scroll-box>
        <s-footer>
          <s-footer-actions>
            <s-button onClick={goBack}>
              {i18n.translate('back')}
            </s-button>
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
        <s-box padding="base">
          {isCompleted && (
            <s-box paddingBlockEnd="base">
              <s-banner heading={i18n.translate('completed_detail_info')} tone="info" />
            </s-box>
          )}

          {isProcessing && !isCompleted && (
            <s-box paddingBlockEnd="base">
              <s-banner heading={i18n.translate('processing_detail_warning')} tone="warning" />
            </s-box>
          )}

          {!isProcessing && !isCompleted && cartHasItems && (
            <s-box paddingBlockEnd="base">
              <s-banner heading={i18n.translate('cart_not_empty_warning')} tone="warning" />
            </s-box>
          )}

          {draftOrder.customer && (
            <s-section heading={i18n.translate('customer')}>
              <s-box paddingBlockStart="small">
                <s-text>{draftOrder.customer.displayName}</s-text>
                {draftOrder.customer.email && (
                  <s-text>{draftOrder.customer.email}</s-text>
                )}
                {draftOrder.customer.phone && (
                  <s-text>{draftOrder.customer.phone}</s-text>
                )}
              </s-box>
            </s-section>
          )}

          <s-section heading={i18n.translate('line_items')}>
            <s-box paddingBlockStart="small">
              {lineItems.map(item => {
                const unitPrice =
                  item.discountedUnitPriceSet?.shopMoney ||
                  item.originalUnitPriceSet?.shopMoney;
                return (
                  <s-box key={item.id} paddingBlockEnd="small">
                    <s-text>
                      {item.name} × {item.quantity}
                    </s-text>
                    {unitPrice && (
                      <s-text>
                        {formatCurrency(unitPrice.amount, unitPrice.currencyCode)} {i18n.translate('each')}
                      </s-text>
                    )}
                    {item.variant?.sku && (
                      <s-text>SKU: {item.variant.sku}</s-text>
                    )}
                    {item.custom && (
                      <s-text>({i18n.translate('custom_item')})</s-text>
                    )}
                    {item.appliedDiscount && (
                      <s-text>
                        {i18n.translate('discount')}: {item.appliedDiscount.title}{' '}
                        (-{formatCurrency(item.appliedDiscount.amountV2?.amount, currency)})
                      </s-text>
                    )}
                  </s-box>
                );
              })}
            </s-box>
          </s-section>

          {draftOrder.note2 && (
            <s-section heading={i18n.translate('note')}>
              <s-box paddingBlockStart="small">
                <s-text>{draftOrder.note2}</s-text>
              </s-box>
            </s-section>
          )}

          <s-section heading={i18n.translate('totals')}>
            <s-box paddingBlockStart="small">
              {subtotal && (
                <s-text>
                  {i18n.translate('subtotal')}: {formatCurrency(subtotal.amount, subtotal.currencyCode)}
                </s-text>
              )}
              {discount && (
                <s-text>
                  {i18n.translate('discount')}: -{formatCurrency(discount.amountV2?.amount, currency)}{' '}
                  ({discount.title})
                </s-text>
              )}
              {tax && parseFloat(tax.amount) > 0 && (
                <s-text>
                  {i18n.translate('tax')}: {formatCurrency(tax.amount, tax.currencyCode)}
                </s-text>
              )}
              {total && (
                <s-text>
                  {i18n.translate('total')}: {formatCurrency(total.amount, total.currencyCode)}
                </s-text>
              )}
            </s-box>
          </s-section>
        </s-box>
      </s-scroll-box>
      <s-footer>
        <s-footer-actions>
          {isCompleted ? (
            <s-button onClick={goBack}>
              {i18n.translate('back')}
            </s-button>
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
              <s-button onClick={goBack}>
                {i18n.translate('back')}
              </s-button>
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

      // Release inventory reservation + tag as pos-processing
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

      // Clear current cart
      setStatus(i18n.translate('clearing_cart'));
      await cart.clearCart();

      // Set note immediately after clearing — bulkCartUpdate replaces the entire
      // cart state, so it must run while the cart is still empty to avoid wiping
      // line items added later.
      if (draftOrder.note2) {
        setStatus(i18n.translate('setting_note'));
        // @ts-ignore -- partial update; API accepts note-only despite types requiring full CartUpdateInput
        await cart.bulkCartUpdate({note: draftOrder.note2});
      }

      // Set customer
      if (draftOrder.customer?.id) {
        setStatus(i18n.translate('setting_customer'));
        const numericId = extractNumericId(draftOrder.customer.id);
        if (numericId) {
          await cart.setCustomer({id: numericId});
        }
      }

      // Add line items
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
          console.warn(`[LoadingScreen] Failed to add "${item.name}":`, itemErr);
          failedItems.push(item.name);
        }
      }

      if (failedItems.length > 0 && failedItems.length === lineItems.length) {
        throw new Error(`None of the ${lineItems.length} line items could be added to the cart. Ensure products are available on the POS channel.`);
      }
      if (failedItems.length > 0) {
        shopify.toast.show(`${failedItems.length} item(s) skipped (not available on POS)`);
      }

      // Track draft order in cart properties → becomes order note_attributes
      setStatus(i18n.translate('setting_properties'));
      await cart.addCartProperties({
        _draft_order_id: draftOrderId,
        _draft_order_name: draftOrder.name,
      });

      // Apply cart-level discount
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
      console.error('Error loading draft order into cart:', err);
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
          <s-box padding="base">
            <s-banner heading={i18n.translate('error_loading_cart')} tone="critical">
              <s-text>{error}</s-text>
            </s-banner>
          </s-box>
        </s-scroll-box>
        <s-footer>
          <s-footer-actions>
            <s-button onClick={goBack}>
              {i18n.translate('back')}
            </s-button>
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
        <s-box padding="base">
          <s-text>{done ? i18n.translate('done') : status}</s-text>
        </s-box>
      </s-scroll-box>
    </s-page>
  );
}
