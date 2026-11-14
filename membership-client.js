(() => {
  const LIMITS = {
    free: { tier: "free", maxFileBytes: 10 * 1024 * 1024, maxFiles: 3 },
    plus: { tier: "plus", maxFileBytes: 50 * 1024 * 1024, maxFiles: 10 },
    pro: { tier: "pro", maxFileBytes: 100 * 1024 * 1024, maxFiles: 50 }
  };
  let clientPromise = null;
  let planPromise = null;
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.onload = resolve;
      script.onerror = () => reject(new Error("Could not load account services."));
      document.head.appendChild(script);
    });
  }
  async function getClient() {
    if (!clientPromise) clientPromise = (async () => {
      if (!window.supabase?.createClient) {
        await loadScript("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2");
      }
      const response = await fetch("/.netlify/functions/public-config", { cache: "no-store" });
      if (!response.ok) throw new Error("Account service is unavailable.");
      const config = await response.json();
      return window.supabase.createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
    })();
    return clientPromise;
  }
  async function getPlan(force = false) {
    if (force) planPromise = null;
    if (!planPromise) planPromise = (async () => {
      try {
        const client = await getClient();
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        const token = data?.session?.access_token;
        if (!token) return LIMITS.free;
        const response = await fetch("/.netlify/functions/membership-status", {
          headers: { authorization: `Bearer ${token}` }, cache: "no-store"
        });
        if (!response.ok) throw new Error("Could not verify your membership. Refresh and try again.");
        const result = await response.json();
        const tier = result?.status === "active" && LIMITS[result?.tier] ? result.tier : "free";
        return LIMITS[tier];
      } catch (error) {
        console.warn("Membership lookup failed; applying FREE limits.", error);
        return LIMITS.free;
      }
    })();
    return planPromise;
  }
  window.PinkMembership = { getPlan };
})();
