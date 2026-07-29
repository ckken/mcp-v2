export const ORDERS_APP_URI = "ui://mcp-v2/orders-dashboard.html";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

export const ordersAppHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; background: #10121b; color: #e7e9f5; font: 14px system-ui, sans-serif; }
      main { min-height: 100vh; padding: 22px; display: grid; gap: 16px; align-content: start; }
      .eyebrow { color: #a5b4fc; font-size: 11px; font-weight: 800; letter-spacing: .14em; }
      h1 { margin: 0; font-size: 24px; }
      p { margin: 0; color: #9ca3b7; }
      .orders { display: grid; gap: 8px; }
      .order { display: flex; justify-content: space-between; gap: 12px; padding: 12px; border: 1px solid #2a2f45; border-radius: 10px; background: #171a28; }
      button { justify-self: start; border: 0; border-radius: 9px; padding: 10px 14px; color: #11152a; background: #a5b4fc; font-weight: 800; cursor: pointer; }
      #runtime { font-size: 12px; }
    </style>
  </head>
  <body>
    <main>
      <span class="eyebrow">LIVE MCP APP RESOURCE</span>
      <h1 id="headline">Orders dashboard</h1>
      <p id="summary">Waiting for the host tool result…</p>
      <div class="orders" id="orders"></div>
      <button id="refresh" type="button">Call orders.dashboard</button>
      <p id="runtime">Initializing MCP Apps bridge…</p>
    </main>
    <script type="module">
      let rpcId = 0;
      const pending = new Map();
      const headline = document.querySelector("#headline");
      const summary = document.querySelector("#summary");
      const orders = document.querySelector("#orders");
      const runtime = document.querySelector("#runtime");

      function render(value) {
        if (!value) return;
        headline.textContent = value.headline || "Orders dashboard";
        summary.textContent = value.summary || "No summary";
        orders.replaceChildren(...(value.orders || []).map((order) => {
          const row = document.createElement("div");
          row.className = "order";
          const name = document.createElement("span");
          name.textContent = order.customer + " · " + order.status;
          const amount = document.createElement("strong");
          amount.textContent = order.currency + " " + Number(order.total).toLocaleString();
          row.append(name, amount);
          return row;
        }));
      }

      function request(method, params) {
        return new Promise((resolve, reject) => {
          const id = ++rpcId;
          pending.set(id, { resolve, reject });
          window.parent.postMessage({ jsonrpc: "2.0", id, method, params }, "*");
        });
      }

      function notify(method, params) {
        window.parent.postMessage({ jsonrpc: "2.0", method, params }, "*");
      }

      window.addEventListener("message", (event) => {
        if (event.source !== window.parent) return;
        const message = event.data;
        if (!message || message.jsonrpc !== "2.0") return;
        if (message.id !== undefined) {
          const waiter = pending.get(message.id);
          if (!waiter) return;
          pending.delete(message.id);
          if (message.error) waiter.reject(message.error);
          else waiter.resolve(message.result);
          return;
        }
        if (message.method === "ui/notifications/tool-result") {
          render(message.params && message.params.structuredContent);
        }
      });

      const ready = request("ui/initialize", {
        appInfo: { name: "mcp-v2-orders-app", version: "0.1.0" },
        appCapabilities: {},
        protocolVersion: "2026-01-26"
      }).then(() => {
        runtime.textContent = "MCP Apps bridge connected";
        notify("ui/notifications/initialized", {});
      });

      document.querySelector("#refresh").addEventListener("click", async () => {
        await ready;
        const result = await request("tools/call", { name: "orders.dashboard", arguments: {} });
        render(result && result.structuredContent);
      });
    </script>
  </body>
</html>`;
