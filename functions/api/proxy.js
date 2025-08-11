// functions/api/proxy.js


export async function onRequest(context) {
  // 只處理 POST 請求
  if (context.request.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    // 從原始請求中讀取 JSON 內容
    const requestBody = await context.request.json();

    // 檢查從前端發來的資料結構是否正確
    if (!requestBody || !requestBody.data || !requestBody.model) {
        return new Response('Invalid request body structure. Expected { model, data }.', { status: 400 });
    }
    
    const modelName = requestBody.model;

    // 從 Cloudflare 的環境變數中安全地讀取 API Key
    const API_KEY = context.env.GEMINI_API_KEY;

    // 如果環境變數沒有設定，回傳一個明確的錯誤
    if (!API_KEY) {
      return new Response('Server configuration error: API key is not set.', { status: 500 });
    }

    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;

    // 建立一個新的請求，將其轉發到 Google API
    // 注意：我們只將 requestBody 中的 "data" 部分轉發出去
    const proxyRequest = new Request(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody.data), 
    });

    // 執行請求並將 Google 的回應直接傳回給前端
    return await fetch(proxyRequest);

  } catch (error) {
    // 如果發生任何意外錯誤 (例如解析 JSON 失敗)，回傳錯誤訊息
    return new Response(`Proxy Error: ${error.message}`, { status: 500 });
  }
}
