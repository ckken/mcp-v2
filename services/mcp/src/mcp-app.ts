export const ORDERS_APP_URI = "ui://mcp-v2/orders-dashboard.html";
export const MCP_APP_MIME_TYPE = "text/html;profile=mcp-app";

const appBundleUrl = new URL("../../../apps/mcp-app/dist/index.html", import.meta.url);

export async function getOrdersAppHtml() {
  const bundle = Bun.file(appBundleUrl);
  if (!(await bundle.exists())) {
    throw new Error("MCP App bundle is missing; run `bun run --cwd apps/mcp-app build`");
  }
  const html = await bundle.text();
  if (!html.includes("ui/initialize") || !html.includes("orders.dashboard")) {
    throw new Error("MCP App bundle does not contain the required host bridge");
  }
  return html;
}
