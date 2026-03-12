import { authenticate } from "../shopify.server";

const DRAFT_ORDER_MARK_COMPLETED_MUTATION = `
  mutation DraftOrderMarkCompleted($id: ID!, $input: DraftOrderInput!) {
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

export const action = async ({ request }) => {
  const { shop, topic, payload, admin } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  const noteAttributes = payload.note_attributes || [];
  const draftOrderAttr = noteAttributes.find(
    (attr) => attr.name === "_draft_order_id",
  );

  if (!draftOrderAttr?.value) {
    return new Response();
  }

  const draftOrderId = draftOrderAttr.value;
  const posOrderName = payload.name || payload.order_number;
  console.log(`POS order ${posOrderName} created from draft order ${draftOrderId}, tagging as completed…`);

  try {
    const response = await admin.graphql(DRAFT_ORDER_MARK_COMPLETED_MUTATION, {
      variables: {
        id: draftOrderId,
        input: {
          tags: ["completed-via-pos"],
          note: `Completed via POS — Order ${posOrderName || ""}`.trim(),
        },
      },
    });

    const result = await response.json();
    const userErrors = result.data?.draftOrderUpdate?.userErrors || [];

    if (userErrors.length > 0) {
      console.error("Failed to mark draft order as completed:", userErrors);
    } else {
      console.log(`Draft order ${draftOrderId} tagged as completed-via-pos`);
    }
  } catch (err) {
    console.error(`Error updating draft order ${draftOrderId}:`, err);
  }

  return new Response();
};
