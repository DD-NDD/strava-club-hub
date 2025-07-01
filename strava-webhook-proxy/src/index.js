/**
 * @fileoverview Cloudflare Worker to act as a secure proxy for Strava webhooks.
 * It handles subscription validation and forwards events to a Google Apps Script backend.
 * This is the optimized and final version.
 */

/**
 * @typedef {object} Env
 * @property {string} GAS_WEB_APP_URL - The secret URL of the Google Apps Script web app.
 * @property {string} STRAVA_VERIFY_TOKEN - The secret token used for the Strava subscription handshake.
 * @property {string} WORKER_SHARED_SECRET - A secret shared between this worker and the Apps Script.
 */

export default {
  /**
   * Main fetch handler to route incoming Strava requests.
   * @param {Request} request The incoming request.
   * @param {Env} env The environment variables and secrets.
   * @param {ExecutionContext} ctx The execution context.
   * @returns {Promise<Response>}
   */
  async fetch(request, env, ctx) {
    // Route GET requests to the subscription handler for webhook validation.
    if (request.method === 'GET') {
      return handleSubscriptionValidation(request, env);
    }

    // Route POST requests to the event forwarder.
    if (request.method === 'POST') {
      try {
        // First, read the JSON body from the request. This avoids stream-reading errors.
        const stravaPayload = await request.json();

        // Schedule the background task to forward the event.
        // We pass the parsed data, not the original request object.
        ctx.waitUntil(forwardEvent(stravaPayload, env));

        // Immediately respond to Strava to prevent timeouts.
        return new Response('EVENT_RECEIVED', { status: 200 });
        
      } catch (error) {
        // Catch errors if the request body is not valid JSON.
        console.error("Error parsing request body:", error);
        return new Response('Bad Request: Invalid JSON', { status: 400 });
      }
    }

    // Reject all other HTTP methods.
    return new Response('Method Not Allowed', { status: 405 });
  },
};

/**
 * Handles Strava's GET request for webhook subscription validation.
 * @param {Request} request The incoming GET request.
 * @param {Env} env The environment variables.
 * @returns {Response}
 */
function handleSubscriptionValidation(request, env) {
  const url = new URL(request.url);
  const params = url.searchParams;

  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  // Verify that the request is a valid subscription handshake from Strava.
  if (mode === 'subscribe' && token === env.STRAVA_VERIFY_TOKEN) {
    console.log('Webhook validation successful.');
    // Respond with the challenge token in the required JSON format.
    return new Response(JSON.stringify({ 'hub.challenge': challenge }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });
  } else {
    // If validation fails, return a forbidden error.
    console.error('Webhook validation failed: Invalid mode or token.');
    return new Response('Forbidden', { status: 403 });
  }
}

/**
 * Asynchronously forwards the event payload to the Google Apps Script backend.
 * This function is non-blocking and uses the standard fetch(url, options) pattern for reliability.
 * @param {object} stravaPayload The parsed JSON object from the original Strava webhook event.
 * @param {Env} env The environment variables.
 */
async function forwardEvent(stravaPayload, env) {
  try {
    // Create the new, secure payload for our backend.
    // This includes the shared secret for authentication.
    const gasPayload = {
      secret: env.WORKER_SHARED_SECRET,
      strava_payload: stravaPayload,
    };

    // Use the direct fetch(url, options) pattern for robustness.
    const response = await fetch(env.GAS_WEB_APP_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gasPayload),
      redirect: 'follow', // Explicitly follow redirects, similar to curl's -L flag.
    });

    // Log the response from Google Apps Script for better debugging.
    const responseText = await response.text();
    console.log(`Forwarding completed. Response from GAS: "${responseText}" (Status: ${response.status})`);

  } catch (error) {
    // Log any errors that occur during the forwarding process.
    console.error('Error forwarding event to GAS:', error);
  }
}