// The seller's own systems: storefront listing, customer inbox, shipping label
// provider. In a production install these would come from Shopify/Etsy/ShipStation;
// for the demo shop they come from the scenario data.

import { scenarioByKey } from "./demo/scenarios";
import { paypal } from "./paypal";

export async function getStoreRecords(invoiceId: string) {
  const s = scenarioByKey(invoiceId);
  if (!s) return { error: `No store records for invoice ${invoiceId}` };
  return {
    invoice_id: invoiceId,
    paypal_order_id: await paypal().orderIdForInvoice(invoiceId),
    ship_to: { name: s.buyer.name, address: s.buyer.address },
    ...s.store,
  };
}

export const STORE_RECORDS_TOOL = {
  name: "get_store_records",
  description:
    "Look up the shop's own records for an order by its invoice number (the dispute's invoice_number): the PayPal order ID that paid it, the listing text the buyer saw, the customer message history outside PayPal, and fulfillment details from the shipping label provider including carrier scan events and signature.",
  input_schema: {
    type: "object" as const,
    properties: { invoice_id: { type: "string", description: "Invoice number, e.g. JK-1042" } },
    required: ["invoice_id"],
    additionalProperties: false,
  },
};
