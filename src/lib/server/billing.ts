import Stripe from 'stripe';
import type { SupabaseClient } from '@supabase/supabase-js';
import { AppError } from './domain';
import { track } from './analytics';
import { dbResult } from './provider';
export function stripeClient(env: Record<string, string | undefined>) {
 if (!env.STRIPE_SECRET_KEY || !env.STRIPE_PRICE_ID || !env.STRIPE_WEBHOOK_SECRET) throw new AppError(503, 'Paid hosting is not configured yet. Local recording and download remain available.');
 return new Stripe(env.STRIPE_SECRET_KEY, { timeout: 10000, maxNetworkRetries: 1 });
}
export async function requireHosting(admin: SupabaseClient, owner: string, mode: string | undefined) {
 if (!mode || mode === 'pilot') return;
 if (mode !== 'paid') throw new AppError(503, 'Hosting mode needs review. Download your local clip meanwhile.');
 const billing = dbResult(await admin.from('supaclip_billing').select('active_until').eq('owner_id', owner).maybeSingle());
 if (!billing || Date.parse(billing.active_until) <= Date.now()) throw new AppError(402, 'Hosted clips require an active subscription. Local recording, download and deletion remain available.');
}
export async function checkout(stripe: Stripe, env: Record<string, string | undefined>, owner: string, origin: string) {
 const price = await stripe.prices.retrieve(env.STRIPE_PRICE_ID!);
 if (price.unit_amount !== 800 || price.currency !== 'usd' || price.recurring?.interval !== 'month' || price.recurring.interval_count !== 1) throw new AppError(503, 'The configured price needs review. Expected USD 8 per month.');
 const session = await stripe.checkout.sessions.create({ mode: 'subscription', line_items: [{ price: price.id, quantity: 1 }],
 client_reference_id: owner, subscription_data: { metadata: { supaclip_user: owner, product: 'supaclip' } },
 success_url: `${origin}/?checkout=returned`, cancel_url: `${origin}/?checkout=cancelled` }, { idempotencyKey: `supaclip-checkout-${owner}-${Math.floor(Date.now()/3600000)}` });
 if (!session.url) throw new AppError(503, 'Checkout is unavailable. Try again later.');
 return { url: session.url };
}
export async function billingEvent(stripe: Stripe, admin: SupabaseClient, event: Stripe.Event, price: string, env: Record<string,string|undefined> = {}) {
 const object = event.data.object as any;
 let subscriptionId: string | null = null;
 if (event.type.startsWith('customer.subscription.')) subscriptionId = object.id;
 if (event.type.startsWith('invoice.')) subscriptionId = object.parent?.subscription_details?.subscription ?? object.subscription;
 if (event.type === 'checkout.session.completed') subscriptionId = object.subscription;
 if (!subscriptionId) return;
 const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ['latest_invoice'] });
 const owner = sub.metadata.supaclip_user;
 if (sub.metadata.product !== 'supaclip' || !owner || !sub.items.data.some(item => item.price.id === price)) return;
 const previous = dbResult(await admin.from('supaclip_billing').select('started_at').eq('owner_id',owner).maybeSingle());
 const invoice = sub.latest_invoice as Stripe.Invoice | null;
 const end = Math.min(...sub.items.data.map(item => item.current_period_end));
 const active = sub.status === 'active' && invoice?.status === 'paid' && Number.isFinite(end);
 dbResult(await admin.from('supaclip_billing').upsert({ owner_id: owner, customer_id: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
 subscription_id: sub.id, started_at: previous?.started_at ?? (active ? new Date().toISOString() : null), active_until: new Date(active ? end * 1000 : 0).toISOString() }));
 if(active&&!previous?.started_at)await track(env,'subscription_started',{mode:'real',visibility:'private'},owner);
}
