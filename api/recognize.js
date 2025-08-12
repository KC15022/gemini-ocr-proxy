// api/recognize.js

export default async function handler(request, response) {
  // 只接受 POST 請求
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  // 從環境變數中讀取 API Key，這樣更安全
  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return response.status(500).json({ error: 'API key is not configured.' });
  }

  const { imageBase64 } = request.body;

  if (!imageBase64) {
    return response.status(400).json({ error: 'No image data provided.' });
  }

  const MODEL_NAME = 'gemini-1.5-flash';
  const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;

  const promptText = "這是一份文件（可能是圖片或PDF的一頁）。請精確地辨識並提取其中的所有中文字，如文件中有簡體中文字，則請在轉換時全部轉為繁體中文字。請遵循原始文件的段落結構來組織文字，忽略單純因為排版而產生的換行，只在段落結束時才換行。請直接回傳純文字結果，不要包含任何標題、解釋或額外的格式。";
  const pureBase64 = imageBase64.split(',')[1];

  const requestBody = {
    "contents": [{
      "parts": [
        { "text": promptText },
        {
          "inline_data": {
            "mime_type": "image/jpeg",
            "data": pureBase64
          }
        }
      ]
    }],
    "generationConfig": {
      "temperature": 0.5
    }
  };

  try {
    const geminiResponse = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });
    
    // 將 Gemini API 的原始回應直接回傳給前端
    // 這樣前端就可以處理成功或失敗的各種情況
    const data = await geminiResponse.json();
    response.status(geminiResponse.status).json(data);

  } catch (error) {
    console.error('Error proxying to Gemini API:', error);
    response.status(500).json({ error: 'Failed to connect to the Gemini API.' });
  }
}
