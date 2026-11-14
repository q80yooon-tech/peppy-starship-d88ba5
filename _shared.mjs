
const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "content-type": "application/json",
    "cache-control": "no-store",
  },
  body: JSON.stringify(body),
});

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function paypalBase() {
  const mode = required("PAYPAL_MODE").toLowerCase();

  if (mode === "sandbox") {
    return "https://api-m.sandbox.paypal.com";
  }

  if (mode === "live") {
    return "https://api-m.paypal.com";
  }

  throw new Error("PAYPAL_MODE must be sandbox or live");
}

async function paypalAccessToken() {
  const client = required("PAYPAL_CLIENT_ID");
  const secret = required("PAYPAL_CLIENT_SECRET");

  const credentials = Buffer.from(
    `${client}:${secret}`
  ).toString("base64");

  const response = await fetch(
    `${paypalBase()}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        authorization: `Basic ${credentials}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      `PayPal token request failed (${response.status})`
    );
  }

  return data.access_token;
}

async function supabaseUserFromRequest(event) {
  const auth =
    event.headers.authorization ||
    event.headers.Authorization ||
    "";

  if (!auth.startsWith("Bearer ")) {
    return null;
  }

  const token = auth.slice(7);

  const response = await fetch(
    `${required("SUPABASE_URL")}/auth/v1/user`,
    {
      headers: {
        apikey: required("SUPABASE_PUBLISHABLE_KEY"),
        authorization: `Bearer ${token}`,
      },
    }
  );

  if (!response.ok) {
    return null;
  }

  return response.json();
}

async function supabaseAdmin(path, options = {}) {
  const secretKey = required("SUPABASE_SECRET_KEY");

  const response = await fetch(
    `${required("SUPABASE_URL")}/rest/v1/${path}`,
    {
      ...options,
      headers: {
        apikey: secretKey,
        "content-type": "application/json",
        ...(options.headers || {}),
      },
    }
  );

  const body = await response.text();

  if (!response.ok) {
    throw new Error(
      `Supabase request failed (${response.status}): ${body}`
    );
  }

  return body ? JSON.parse(body) : null;
}

export {
  json,
  required,
  paypalBase,
  paypalAccessToken,
  supabaseUserFromRequest,
  supabaseAdmin,
};
