const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
  try {
    const { amountInCents, riderEmail, pickupAddress, dropoffAddress } = JSON.parse(event.body);
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Hope Rideshare Transit Fare',
            description: 'From: ' + pickupAddress + ' To: ' + dropoffAddress,
          },
          unit_amount: amountInCents,
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_email: riderEmail,
      success_url: (process.env.URL || 'https://hope-rideshare.netlify.app') + '?payment_success=true',
      cancel_url: (process.env.URL || 'https://hope-rideshare.netlify.app') + '?payment_cancelled=true',
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ id: session.id, url: session.url }),
    };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
