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
      `membership_subscriptions?user_id=eq.${encodeURIComponent(user.id)}&select=tier,status,created_at&order=created_at.desc&limit=1`
    );
    const latest = Array.isArray(rows) ? rows[0] : null;
    if (!latest) return json(200, { tier: 'free', status: 'none' });
    const active = latest.status === 'active' && ['plus', 'pro'].includes(latest.tier);
    return json(200, {
      tier: active ? latest.tier : 'free',
      status: latest.status || 'pending'
    });
  } catch (error) {
    return json(500, { error: error.message || 'Could not check membership.' });
  }
};
