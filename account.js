
(() => {
  const $ = (id) => document.getElementById(id);
  const form = $('authForm'), recoveryForm = $('recoveryForm');
  const forms = $('authForms'), stateBox = $('accountState');
  const message = $('message'), submit = $('submitBtn'), emailInput = $('email'), passwordInput = $('password');
  let mode = 'signin', client = null, activeUser = null;

  function showMessage(text, type = 'info') {
    message.textContent = text;
    message.className = `message show ${type}`;
  }

  function setMode(next) {
    mode = next;
    $('tabSignin').classList.toggle('active', mode === 'signin');
    $('tabSignup').classList.toggle('active', mode === 'signup');
    submit.textContent = mode === 'signin' ? 'Sign in' : 'Create account';
    passwordInput.autocomplete = mode === 'signin' ? 'current-password' : 'new-password';
    message.className = 'message';
  }

  function renderSession(session) {
    activeUser = session?.user || null;
    if (activeUser) {
      forms.classList.add('hide');
      stateBox.classList.add('show');
      $('userEmail').textContent = activeUser.email || 'Signed-in user';
      loadMembership();
    } else {
      forms.classList.remove('hide');
      stateBox.classList.remove('show');
      $('membershipStatus').textContent = 'Sign in to view your membership.';
    }
  }

  async function loadMembership() {
    if (!activeUser || !client) return;

    $('membershipStatus').textContent = 'Checking your membership…';

    try {
      const { data: rows, error } = await client
        .from('membership_subscriptions')
        .select('tier,status,paypal_subscription_id,created_at,updated_at')
        .eq('user_id', activeUser.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const records = Array.isArray(rows) ? rows : [];
      const activeRecord = records.find((row) =>
        String(row.status || '').toLowerCase() === 'active' &&
        ['plus', 'pro'].includes(String(row.tier || '').toLowerCase())
      );
      const data = activeRecord || records[0] || null;
      const statusEl = $('membershipStatus');
      const planChoices = $('planChoices');
      const freePlanLink = $('freePlanLink');

      if (!data) {
        statusEl.textContent = 'FREE PLAN — No paid membership yet.';
        statusEl.className = 'free';
        planChoices.hidden = false;
        freePlanLink.textContent = 'Continue with Free Plan';
        return;
      }

      const status = String(data.status || 'pending').toLowerCase();
      const tier = String(data.tier || '').toUpperCase();
      const isActive = status === 'active' && ['PLUS', 'PRO'].includes(tier);

      statusEl.textContent = isActive
        ? `${tier} MEMBERSHIP ACTIVE`
        : `${tier || 'PAID'} membership status: ${status.replace('_', ' ')}.`;
      statusEl.className = isActive ? 'active' : 'inactive';

      // An active paid member should not be offered another paid checkout.
      planChoices.hidden = isActive;
      freePlanLink.textContent = isActive ? 'Continue to Tools' : 'Continue with Free Plan';
    } catch (error) {
      $('membershipStatus').textContent =
        'Could not load membership status. Please refresh and try again.';
      showMessage(error.message || 'Could not load membership status.', 'error');
    }
  }

  async function startSubscription(tier, button) {
    if (!client) return;

    const { data: { session } } = await client.auth.getSession();

    if (!session?.access_token) {
      showMessage('Please sign in again before choosing a plan.', 'error');
      return;
    }

    button.disabled = true;
    const oldText = button.textContent;
    button.textContent = 'Connecting to PayPal…';

    try {
      const response = await fetch(
        '/.netlify/functions/paypal-create-subscription',
        {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${session.access_token}`
          },
          body: JSON.stringify({ tier })
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Could not start PayPal subscription.');
      }

      if (!result.approval_url) {
        throw new Error('PayPal did not return an approval link.');
      }

      location.assign(result.approval_url);
    } catch (error) {
      showMessage(error.message || 'Could not connect to PayPal.', 'error');
      button.disabled = false;
      button.textContent = oldText;
    }
  }

  async function init() {
    try {
      const configResponse = await fetch(
        '/.netlify/functions/public-config',
        { cache: 'no-store' }
      );

      if (!configResponse.ok) {
        throw new Error(
          'Account service is not configured yet. Please try again later.'
        );
      }

      const config = await configResponse.json();

      if (!window.supabase?.createClient) {
        throw new Error(
          'The account library could not load. Refresh the page and try again.'
        );
      }

      client = window.supabase.createClient(
        config.url,
        config.publishableKey,
        {
          auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
          }
        }
      );

      const { data, error } = await client.auth.getSession();
      if (error) throw error;

      renderSession(data.session);

      client.auth.onAuthStateChange((event, session) => {
        renderSession(session);

        if (event === 'PASSWORD_RECOVERY') {
          forms.classList.remove('hide');
          stateBox.classList.remove('show');
          form.hidden = true;
          recoveryForm.hidden = false;
          showMessage('Choose a new password for your account.', 'info');
        }
      });

      // Handle cancellation messages without displaying stale PayPal errors.
      const params = new URLSearchParams(location.search);

      if (params.get('subscription') === 'cancelled') {
        showMessage(
          'PayPal approval was cancelled. No subscription was started.',
          'info'
        );
      }

      // Remove old error parameters from the address bar.
      if (params.has('error_description')) {
        params.delete('error_description');
        params.delete('subscription_id');

        const cleanUrl =
          `${location.pathname}${params.toString() ? `?${params}` : ''}`;

        history.replaceState({}, '', cleanUrl);
      }

    } catch (error) {
      showMessage(
        error.message || 'Could not initialize account services.',
        'error'
      );
      submit.disabled = true;
    }
  }

  $('tabSignin').addEventListener('click', () => setMode('signin'));
  $('tabSignup').addEventListener('click', () => setMode('signup'));

  document.querySelectorAll('.plan-button').forEach((button) => {
    button.addEventListener('click', () =>
      startSubscription(button.dataset.tier, button)
    );
  });

  recoveryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!client) return;

    try {
      const { error } = await client.auth.updateUser({
        password: $('newPassword').value
      });

      if (error) throw error;

      recoveryForm.hidden = true;
      form.hidden = false;

      showMessage(
        'Your password has been updated. You are signed in.',
        'success'
      );
    } catch (error) {
      showMessage(
        error.message || 'Could not update your password.',
        'error'
      );
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!client) return;

    submit.disabled = true;
    submit.textContent = 'Please wait…';
    message.className = 'message';

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
      if (mode === 'signup') {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${location.origin}/account.html`
          }
        });

        if (error) throw error;

        if (data.session) {
          showMessage(
            'Your account is ready and you are signed in.',
            'success'
          );
        } else {
          showMessage(
            'Account created. Check your email and click the confirmation link before signing in.',
            'success'
          );
        }
      } else {
        const { error } = await client.auth.signInWithPassword({
          email,
          password
        });

        if (error) throw error;

        showMessage('Signed in successfully.', 'success');
      }
    } catch (error) {
      showMessage(
        error.message || 'Something went wrong. Please try again.',
        'error'
      );
    } finally {
      submit.disabled = false;
      submit.textContent = mode === 'signin' ? 'Sign in' : 'Create account';
    }
  });

  $('forgotBtn').addEventListener('click', async () => {
    if (!client) return;

    const email = emailInput.value.trim();

    if (!email) {
      showMessage(
        'Enter your email address first, then choose Forgot password.',
        'info'
      );
      return;
    }

    try {
      const { error } = await client.auth.resetPasswordForEmail(
        email,
        { redirectTo: `${location.origin}/account.html` }
      );

      if (error) throw error;

      showMessage(
        'If an account exists for this email, a password reset link has been sent.',
        'success'
      );
    } catch (error) {
      showMessage(
        error.message || 'Could not send the reset email.',
        'error'
      );
    }
  });

  $('signoutBtn').addEventListener('click', async () => {
    if (!client) return;

    const { error } = await client.auth.signOut();

    if (error) {
      showMessage(error.message, 'error');
    } else {
      showMessage('You have signed out.', 'success');
    }
  });

  init();
})();
