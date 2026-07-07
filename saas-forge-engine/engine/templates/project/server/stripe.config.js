'use strict';

// Configuração estática do Stripe — injetada e validada pelo SaaS-Forge.
// A rota de checkout (routes/checkout.js) consome getStripe() e PRICING.

const Stripe = require('stripe');

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || '';
const APP_URL = process.env.APP_URL || 'http://localhost:5173';

const PRICING = {
  productName: '{{PROJECT_NAME}} — Assinatura Mensal',
  currency: 'brl',
  unitAmount: 4990, // R$ 49,90 em centavos
  interval: 'month',
  successUrl: `${APP_URL}/settings?checkout=success`,
  cancelUrl: `${APP_URL}/settings?checkout=cancel`,
};

let stripeInstance = null;

/**
 * Retorna o cliente Stripe, ou null quando STRIPE_SECRET_KEY não está
 * configurada (modo simulado — o checkout responde a URL de sucesso).
 */
function getStripe() {
  if (!STRIPE_SECRET_KEY) return null;
  if (!stripeInstance) stripeInstance = new Stripe(STRIPE_SECRET_KEY);
  return stripeInstance;
}

module.exports = { getStripe, PRICING };
