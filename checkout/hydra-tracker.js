/*!
 * HYDRA Visitor Tracker â€” vanilla JS, zero deps
 * Gera cookie _hyd_v + envia pageview pra Hydra a cada navegacao.
 * Fire-and-forget â€” nunca bloqueia a pagina.
 *
 * Template: substituir hyd_f7f12a2da22c9bc44007777e32bb58a3 pelo SITE_TOKEN do site.
 * Servido como /checkout/hydra-tracker.js
 */
(function () {
  "use strict";

  var HYDRA_TOKEN = "hyd_f7f12a2da22c9bc44007777e32bb58a3";
  var HYDRA_URL = "https://hydra-saas.vercel.app";

  if (!HYDRA_TOKEN || HYDRA_TOKEN.indexOf("{{") === 0) return; // token nao configurado

  // ===== Cookie _hyd_v (visitor_id persistente 30 dias) =====
  function getCookie(name) {
    var m = document.cookie.match(
      new RegExp("(?:^|;\\s*)" + name + "=([^;]+)")
    );
    return m ? decodeURIComponent(m[1]) : null;
  }

  function setCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 86400000).toUTCString();
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; expires=" +
      expires +
      "; path=/; SameSite=Lax" +
      (location.protocol === "https:" ? "; Secure" : "");
  }

  function genId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    // Fallback simples (nÃ£o cripto, mas Ãºnico o suficiente)
    return (
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).substring(2, 10) +
      Math.random().toString(36).substring(2, 10)
    );
  }

  var visitorId = getCookie("_hyd_v");
  if (!visitorId || visitorId.length < 8) {
    visitorId = genId();
    setCookie("_hyd_v", visitorId, 30);
  }

  // ===== Coleta UTM params da URL =====
  function getParam(name) {
    try {
      var v = new URLSearchParams(window.location.search).get(name);
      return v ? String(v).substring(0, 200) : null;
    } catch (_) {
      return null;
    }
  }

  // ===== Payload =====
  var payload = {
    visitor_id: visitorId,
    url_path: (window.location.pathname || "") + (window.location.search || ""),
    referer: document.referrer || null,
    utm_source: getParam("utm_source"),
    utm_campaign: getParam("utm_campaign"),
    utm_medium: getParam("utm_medium"),
    utm_content: getParam("utm_content"),
    utm_term: getParam("utm_term"),
    ttclid: getParam("ttclid"),
    fbclid: getParam("fbclid"),
    gclid: getParam("gclid")
  };

  var endpoint =
    HYDRA_URL + "/api/sites/" + encodeURIComponent(HYDRA_TOKEN) + "/visitor";

  // ===== Envio (fetch keepalive ou sendBeacon como fallback) =====
  function send() {
    try {
      if (typeof fetch === "function") {
        fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          keepalive: true,
          mode: "cors",
          credentials: "omit"
        }).catch(function () {
          /* silencioso */
        });
        return;
      }
    } catch (_) {
      /* fallback abaixo */
    }
    // sendBeacon fallback (limitado a payloads pequenos)
    try {
      if (
        navigator &&
        typeof navigator.sendBeacon === "function" &&
        window.Blob
      ) {
        var blob = new Blob([JSON.stringify(payload)], {
          type: "application/json"
        });
        navigator.sendBeacon(endpoint, blob);
      }
    } catch (_) {
      /* desiste */
    }
  }

  // ===== Dispara apos load (nao bloqueia render) =====
  if (document.readyState === "complete") {
    setTimeout(send, 50);
  } else {
    window.addEventListener("load", function () {
      setTimeout(send, 50);
    });
  }

  // ===== Onda 93.31: heartbeat a cada 30s pra manter visitor "vivo" no globo =====
  // Janela da API caiu pra 60s — sem heartbeat, cliente parado lendo a PDP sumiria
  // do globo apos 60s. Heartbeat re-envia o mesmo visitor_id e atualiza last_seen_at.
  // Pausa quando a aba fica em background pra economizar (visibility change).
  var HEARTBEAT_MS = 30000;
  var heartbeatTimer = null;

  function startHeartbeat() {
    if (heartbeatTimer) return;
    heartbeatTimer = setInterval(function () {
      if (document.visibilityState === "visible") send();
    }, HEARTBEAT_MS);
  }
  function stopHeartbeat() {
    if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
  }

  startHeartbeat();
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") {
      send(); // re-ativa rapido quando volta pra aba
      startHeartbeat();
    } else {
      stopHeartbeat();
    }
  });

  // ===== Onda 93.110: beacon de saida quando aba/app fecha =====
  // pagehide eh mais confiavel que beforeunload em mobile (iOS Safari nao
  // dispara beforeunload). sendBeacon eh o unico envio garantido no pagehide
  // — fetch keepalive pode ser cancelado, setTimeout/Promise nao executam.
  // Backend marca last_seen_at retroativo -> visitor some do globo em ~5s
  // (proximo polling), em vez de esperar 180s da janela "ao vivo".
  function sendLeftBeacon() {
    try {
      if (
        navigator &&
        typeof navigator.sendBeacon === "function" &&
        window.Blob
      ) {
        var leftPayload = JSON.stringify({
          visitor_id: visitorId,
          left: true
        });
        navigator.sendBeacon(
          endpoint,
          new Blob([leftPayload], { type: "application/json" })
        );
      }
    } catch (_) { /* desiste silencioso */ }
  }
  window.addEventListener("pagehide", sendLeftBeacon);

  // ===== Expose pra debug =====
  window.__hydra_tracker = {
    visitor_id: visitorId,
    token: HYDRA_TOKEN,
    endpoint: endpoint,
    sendNow: send,
    sendLeft: sendLeftBeacon
  };
})();
