// /netlify/functions/recognize.js

// 為了在 Node.js 環境中發送網路請求，我們需要一個類似 fetch 的工具。
// 'node-fetch' 是一個常用的選擇。請在部署前確保安裝了它。
const fetch = require('node-fetch');

// 這是您的後端函式的主要處理邏輯
exports.handler = async function(event, context) {
    // 從環境變數中安全地讀取您的 API 金鑰
    // 我們稍後會在 Netlify 的設定介面中設定這個變數
    const API_KEY = process.env.GEMINI_API_KEY;
    if (!API_KEY) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'API 金鑰未設定。' })
        };
    }
    
    // 檢查請求方法是否為 POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            body: '僅允許 POST 方法'
        };
    }

    try {
        // 解析從前端傳來的 JSON 資料
        const { imageData } = JSON.parse(event.body);
        if (!imageData) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: '缺少圖片資料。' })
            };
        }

        const MODEL_NAME = 'gemini-1.5-flash-latest';
        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${API_KEY}`;
        
        const promptText = "這是一張含有手寫文字的圖片。請精確地辨識並提取圖片中的所有繁體中文字。請只回傳辨識出的文字內容，不要添加任何解釋、標題或額外的格式。";

        // 建立要傳送給 Gemini API 的請求主體
        const requestBody = {
          "contents": [{
            "parts": [
              { "text": promptText },
              {
                "inline_data": {
                  "mime_type": "image/jpeg",
                  "data": imageData
                }
              }
            ]
          }],
          "generationConfig": {
            "temperature": 0.5
          }
        };

        // 呼叫 Gemini API
        const geminiResponse = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody)
        });

        // 處理 Gemini API 的回應
        if (!geminiResponse.ok) {
            const errorData = await geminiResponse.json();
            console.error('Gemini API 錯誤:', errorData);
            const errorMessage = errorData.error?.message || 'Gemini API 請求失敗';
            return {
                statusCode: geminiResponse.status,
                body: JSON.stringify({ error: errorMessage })
            };
        }

        const data = await geminiResponse.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
        
        // 將成功辨識的文字回傳給前端
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*' // 允許跨來源請求
            },
            body: JSON.stringify({ text: content || '無法辨識文字或回應為空。' })
        };

    } catch (error) {
        console.error('後端代理發生錯誤:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `伺服器內部錯誤: ${error.message}` })
        };
    }
};
