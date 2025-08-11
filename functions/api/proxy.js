
export async function onRequest(context) {
  // 確保只處理 POST 請求
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // 從原始請求中讀取 JSON 內容
  const requestBody = await context.request.json();
  const modelName = requestBody.model || 'gemini-1.5-flash-latest'; // 從請求中獲取模型名稱，或使用預設值

  // 從 Cloudflare 的環境變數中安全地讀取 API Key
  const API_KEY = context.env.GEMINI_API_KEY;

  if (!API_KEY) {
    return new Response('API key is not configured', { status: 500 });
  }

  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;

  // 建立一個新的請求，將其轉發到 Google API
  const proxyRequest = new Request(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody.data), // 只轉發必要的資料部分
  });

  // 執行請求並等待回應
  const response = await fetch(proxyRequest);

  // 將 Google API 的原始回應直接傳回給前端
  return response;
}
