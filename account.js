(() => {
  const $ = (id) => document.getElementById(id);
  const form = $("authForm"), recoveryForm = $("recoveryForm");
  const forms = $("authForms"), stateBox = $("accountState");
  const message = $("message"), submit = $("submitBtn"), emailInput = $("email"), passwordInput = $("password");
  let mode = "signin", client = null;

  function showMessage(text, type = "info") {
    message.textContent = text;
    message.className = `message show ${type}`;
  }
  function setMode(next) {
    mode = next;
    $("tabSignin").classList.toggle("active", mode === "signin");
    $("tabSignup").classList.toggle("active", mode === "signup");
    submit.textContent = mode === "signin" ? "Sign in" : "Create account";
    passwordInput.autocomplete = mode === "signin" ? "current-password" : "new-password";
    $("forgotBtn").style.display = mode === "signin" ? "inline-block" : "none";
    message.className = "message";
  }
  async function init() {
    try {
      const configResponse = await fetch("/.netlify/functions/public-config", { cache: "no-store" });
      if (!configResponse.ok) throw new Error("Account service is not configured yet. Please try again later.");
      const config = await configResponse.json();
      if (!window.supabase?.createClient) throw new Error("The account library could not load. Refresh the page and try again.");
      client = window.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const { data, error } = await client.auth.getSession();
      if (error) throw error;
      renderSession(data.session);
      client.auth.onAuthStateChange((event, session) => {
        renderSession(session);
        if (event === "PASSWORD_RECOVERY") {
          forms.classList.remove("hide");
          stateBox.classList.remove("show");
          form.hidden = true;
          recoveryForm.hidden = false;
          showMessage("Choose a new password for your account.", "info");
        }
      });
      const params = new URLSearchParams(location.search);
      if (params.get("error_description")) showMessage(params.get("error_description"), "error");
    } catch (error) {
      showMessage(error.message || "Could not initialize account services.", "error");
      submit.disabled = true;
    }
  }
  function renderSession(session) {
    if (session?.user) {
      forms.classList.add("hide"); stateBox.classList.add("show");
      $("userEmail").textContent = session.user.email || "Signed-in user";
    } else {
      forms.classList.remove("hide"); stateBox.classList.remove("show");
    }
  }
  $("tabSignin").addEventListener("click", () => setMode("signin"));
  $("tabSignup").addEventListener("click", () => setMode("signup"));
  recoveryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!client) return;
    const newPassword = $("newPassword").value;
    try {
      const { error } = await client.auth.updateUser({ password: newPassword });
      if (error) throw error;
      recoveryForm.hidden = true;
      form.hidden = false;
      showMessage("Your password has been updated. You are signed in.", "success");
    } catch (error) {
      showMessage(error.message || "Could not update your password.", "error");
    }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault(); if (!client) return;
    submit.disabled = true; submit.textContent = "Please wait…"; message.className = "message";
    const email = emailInput.value.trim(); const password = passwordInput.value;
    try {
      if (mode === "signup") {
        const { data, error } = await client.auth.signUp({
          email, password,
          options: { emailRedirectTo: `${location.origin}/account.html` }
        });
        if (error) throw error;
        if (data.session) showMessage("Your account is ready and you are signed in.", "success");
        else showMessage("Account created. Check your email and click the confirmation link before signing in.", "success");
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password });
        if (error) throw error;
        showMessage("Signed in successfully.", "success");
      }
    } catch (error) { showMessage(error.message || "Something went wrong. Please try again.", "error"); }
    finally { submit.disabled = false; submit.textContent = mode === "signin" ? "Sign in" : "Create account"; }
  });
  $("forgotBtn").addEventListener("click", async () => {
    if (!client) return;
    const email = emailInput.value.trim();
    if (!email) { showMessage("Enter your email address first, then choose Forgot password.", "info"); return; }
    try {
      const { error } = await client.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/account.html` });
      if (error) throw error;
      showMessage("If an account exists for this email, a password reset link has been sent.", "success");
    } catch (error) { showMessage(error.message || "Could not send the reset email.", "error"); }
  });
  $("signoutBtn").addEventListener("click", async () => {
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) showMessage(error.message, "error"); else showMessage("You have signed out.", "success");
  });
  init();
})();
