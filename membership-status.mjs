import { json, required, supabaseAdmin } from './_shared.mjs';

export const handler = async (event) => {
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method not allowed' });
  try {
    const auth = event.headers.authorization || event.headers.Authorization || '';
    if (!auth.startsWith('Bearer ')) return json(401, { error: 'Sign in to check membership.' });
    const token = auth.slice(7);
    const userResponse = await fetch(`${required('SUPABASE_URL')}/auth/v1/user`, {
      headers: {
        apikey: required('SUPABASE_PUBLISHABLE_KEY'),
        authorization: `Bearer ${token}`
      }
    });
    if (!userResponse.ok) return json(401, { error: 'Your session is invalid. Please sign in again.' });
    const user = await userResponse.json();
    if (!user?.id) return json(401, { error: 'Could not identify the signed-in user.' });

    const rows = await supabaseAdmin(
      `membership_subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=tier,status,created_at,updated_at,paypal_subscription_id&order=created_at.desc&limit=50`
    );
    const records = Array.isArray(rows) ? rows : [];
    const active = records.find((row) =>
      String(row.status || '').toLowerCase() === 'active' &&
      ['plus', 'pro'].includes(String(row.tier || '').toLowerCase())
    );
    const selected = active || records[0] || null;

    if (!selected) return json(200, { tier: 'free', status: 'none' });

    const status = String(selected.status || 'pending').toLowerCase();
    const tier = String(selected.tier || '').toLowerCase();
    const isActive = status === 'active' && ['plus', 'pro'].includes(tier);
    return json(200, {
      tier: isActive ? tier : 'free',
      status,
      subscription_status: status
    });
  } catch (error) {
    return json(500, { error: error.message || 'Could not check membership.' });
  }
};
