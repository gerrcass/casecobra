import OrderReceivedEmail from "@/components/emails/OrderReceivedEmail";
import { db } from "@/db";
import { stripe } from "@/lib/stripe";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import Stripe from "stripe";
import { Resend } from "resend";

interface ExtendedSession extends Stripe.Checkout.Session {
  shipping?: {
    address: Stripe.Address;
    name?: string | null;
  };
}

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  try {
    const signature = headers().get("stripe-signature");
    if (!signature) {
      return new Response("Invalid signature", { status: 400 });
    }

    const body = await req.text();
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    );

    if (event.type === "checkout.session.completed") {
      if (!event.data.object.customer_details?.email) {
        throw new Error("Missing user email");
      }

      const session = event.data.object as ExtendedSession;

      const { userId, orderId } = session.metadata || {
        userId: null,
        orderId: null,
      };

      if (!userId || !orderId) {
        throw new Error("Invalid request metadata");
      }

      const billingAddress = session.customer_details!.address;
      const shippingAddress = session.shipping!.address;

      const updatedOrder = await db.order.update({
        where: {
          id: orderId,
        },
        data: {
          isPaid: true,
          shippingAddress: {
            create: {
              name: session.customer_details!.name!,
              city: shippingAddress!.city!,
              country: shippingAddress!.country!,
              postalCode: shippingAddress!.postal_code!,
              street: shippingAddress!.line1!,
              state: shippingAddress!.state,
            },
          },
          billingAddress: {
            create: {
              name: session.customer_details!.name!,
              city: billingAddress!.city!,
              country: billingAddress!.country!,
              postalCode: billingAddress!.postal_code!,
              street: billingAddress!.line1!,
              state: billingAddress!.state,
            },
          },
        },
      });

      await resend.emails.send({
        from: "CaseCobra <gerrcass@gmail>",
        to: [event.data.object.customer_details.email],
        subject: `Thanks for your order! (#${orderId})`,
        react: OrderReceivedEmail({
          orderId,
          orderDate: updatedOrder.createdAt.toLocaleDateString(),
          // @ts-ignore
          shippingAddress: {
            name: session.customer_details!.name!,
            city: shippingAddress!.city!,
            country: shippingAddress!.country!,
            postalCode: shippingAddress!.postal_code!,
            street: shippingAddress!.line1!,
            state: shippingAddress!.state,
          },
        }),
      });
    }

    return NextResponse.json({ result: event, ok: true });
  } catch (err) {
    console.error(err);

    return NextResponse.json(
      { message: "Something went wrong", ok: false },
      { status: 500 }
    );
  }
}

// const requestBodyExample = {
//   id: "cs_test_a17mmM8HOuPL8iOOkgrKBD965CunYB99Hd9UsEn2IHF0e415sqAMyipE4S",
//   object: "checkout.session",
//   after_expiration: null,
//   allow_promotion_codes: null,
//   amount_subtotal: 2299,
//   amount_total: 2299,
//   automatic_tax: { enabled: false, liability: null, status: null },
//   billing_address_collection: null,
//   cancel_url:
//     "http://localhost:3000/configure/preview?id=clyrsoo2c0000a20xdmkzdlo5",
//   client_reference_id: null,
//   client_secret: null,
//   consent: null,
//   consent_collection: null,
//   created: 1721338875,
//   currency: "usd",
//   currency_conversion: null,
//   custom_fields: [],
//   custom_text: {
//     after_submit: null,
//     shipping_address: null,
//     submit: null,
//     terms_of_service_acceptance: null,
//   },
//   customer: null,
//   customer_creation: "if_required",
//   customer_details: {
//     address: {
//       city: "Thousand Oaks",
//       country: "US",
//       line1: "No street here2",
//       line2: "My second line2",
//       postal_code: "91360",
//       state: "CA",
//     },
//     email: "me2@gerardo.com",
//     name: "St Nobody2",
//     phone: null,
//     tax_exempt: "none",
//     tax_ids: [],
//   },
//   customer_email: null,
//   expires_at: 1721425275,
//   invoice: null,
//   invoice_creation: {
//     enabled: false,
//     invoice_data: {
//       account_tax_ids: null,
//       custom_fields: null,
//       description: null,
//       footer: null,
//       issuer: null,
//       metadata: {},
//       rendering_options: null,
//     },
//   },
//   livemode: false,
//   locale: null,
//   metadata: {
//     orderId: "clyrsq00q0002a20x5sxkhi9h",
//     userId: "kp_0f68a92f262c487899906c300a8526c6",
//   },
//   mode: "payment",
//   payment_intent: "pi_3Pe25UGNhgkHb9n00y0Nby8Z",
//   payment_link: null,
//   payment_method_collection: "if_required",
//   payment_method_configuration_details: null,
//   payment_method_options: { card: { request_three_d_secure: "automatic" } },
//   payment_method_types: ["card"],
//   payment_status: "paid",
//   phone_number_collection: { enabled: false },
//   recovered_from: null,
//   saved_payment_method_options: null,
//   setup_intent: null,
//   shipping: {
//     address: {
//       city: "Thousand Oaks",
//       country: "US",
//       line1: "No street here2",
//       line2: "My second line2",
//       postal_code: "91360",
//       state: "CA",
//     },
//     name: "St Nobody2",
//   },
//   shipping_address_collection: { allowed_countries: ["DE", "US"] },
//   shipping_options: [],
//   shipping_rate: null,
//   status: "complete",
//   submit_type: null,
//   subscription: null,
//   success_url:
//     "http://localhost:3000/thank-you?orderId=clyrsq00q0002a20x5sxkhi9h",
//   total_details: { amount_discount: 0, amount_shipping: 0, amount_tax: 0 },
//   ui_mode: "hosted",
//   url: null,
// };
