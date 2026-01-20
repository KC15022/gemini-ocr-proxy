// ========================================================================
//  手寫中文字辨識 API - 金鑰輪換版 (2025)
//  功能:
//  1. 接收前端傳來的圖片 Base64 字串。
//  2. 從 Vercel 環境變數讀取所有 API Keys。
//  3. 使用 Vercel KV (Upstash Redis) 讀寫當前金鑰的索引。
//  4. 如果 API Key 額度用盡 (HTTP 429)，自動切換至下一個並重試。
//  5. 將 Gemini API 的最終結果回傳給前端。
// ========================================================================

// 用於在 KV 數據庫中儲存 "當前金鑰索引" 的鍵名，這是一個固定常數。
const KEY_INDEX_NAME = 'current_gemini_key_index';

// 從 Vercel 自動為您設定好的環境變數中，讀取 KV 數據庫的連線資訊。
const KV_REST_API_URL = process.env.KV_REST_API_URL;
const KV_REST_API_TOKEN = process.env.KV_REST_API_TOKEN;

/**
 * 異步函式：從 Vercel KV 讀取當前的金鑰索引。
 * 使用 fetch 直接呼叫 Vercel KV 的 REST API，無需安裝額外套件。
 * @returns {Promise<number>} 返回儲存在數據庫中的索引值，如果不存在則預設為 0。
 */
async function getCurrentKeyIndex() {
  // 如果環境變數不存在，直接返回預設值 0，避免程式出錯。
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return 0;

  try {
    const response = await fetch(`${KV_REST_API_URL}/get/${KEY_INDEX_NAME}`, {
      headers: {
        'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
      }
    });
    const data = await response.json();
    // Vercel KV 的回傳格式是 { result: '"0"' }，需要解析兩次。
    // 如果 result 為 null (第一次使用)，則返回 0。
    return data.result ? JSON.parse(data.result) : 0;
  } catch (error) {
    console.error("從 Vercel KV 讀取索引時發生錯誤:", error);
    // 發生錯誤時，也返回預設值 0，以確保服務能繼續嘗試。
    return 0;
  }
}

/**
 * 異步函式：將新的金鑰索引寫入 Vercel KV。
 * @param {number} index - 要儲存的新的金鑰索引值。
 */
async function setCurrentKeyIndex(index) {
  if (!KV_REST_API_URL || !KV_REST_API_TOKEN) return;

  try {
    await fetch(`${KV_REST_API_URL}/set/${KEY_INDEX_NAME}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${KV_REST_API_TOKEN}`,
      },
      // 將數字轉換為字串存入。
      body: JSON.stringify(index),
    });
  } catch (error) {
    console.error("寫入索引至 Vercel KV 時發生錯誤:", error);
  }
}

// Vercel Serverless Function 的主處理函式
export default async function handler(request, response) {
  // 步驟 1: 基本請求驗證 (只接受 POST 請求)
  if (request.method !== 'POST') {
    return response.status(405).json({ message: 'Method Not Allowed' });
  }

  const { imageBase64 } = request.body;
  if (!imageBase64) {
    return response.status(400).json({ error: '請求中未包含圖片數據 (No image data provided.)' });
  }

  // 步驟 2: 從環境變數讀取所有 API Keys
  const apiKeysString = process.env.GEMINI_API_KEYS;
  if (!apiKeysString || !KV_REST_API_URL) {
    const errorMessage = '伺服器端未設定 API Keys 或未連接 KV 數據庫。';
    console.error(errorMessage);
    return response.status(500).json({ error: errorMessage });
  }
  // 將字串分割成金鑰陣列
  const apiKeys = apiKeysString.split(',').map(key => key.trim());
  const totalKeys = apiKeys.length;

  // 步驟 3: 從 KV 數據庫獲取當前應使用的金鑰索引
let keyIndex = await getCurrentKeyIndex();

  // 步驟 4: 準備發送給 Gemini API 的請求內容
  const MODEL_NAME = 'gemini-2.5-flash-lite';
  const promptText = "這是一份文件（可能是圖片或PDF的一頁）。請精確地辨識並提取其中的所有中文字，如文件中有簡體中文字，則請在轉換時全部轉為繁體中文字。請遵循原始文件的段落結構來組織文字，忽略單純因為排版而產生的換行，只在段落結束時才換行。請直接回傳純文字結果，不要包含任何標題、解釋或額外的格式。";
  const pureBase64 = imageBase64.split(',')[1];
  
  const requestBody = {
    contents: [{
      parts: [
        { text: promptText },
        { inline_data: { mime_type: "image/jpeg", data: pureBase64 } }
      ]
    }],
    generationConfig: { temperature: 0.5 }
  };

  // 步驟 5: 核心邏輯 - 迴圈嘗試所有金鑰，直到成功或全部失敗
  // 最多只會嘗試 totalKeys 的次數，避免無限迴圈。
  for (let i = 0; i < totalKeys; i++) {
    const currentKey = apiKeys[keyIndex];
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_NAME}:generateContent?key=${currentKey}`;

    try {
      console.log(`[資訊] 正在嘗試使用第 ${keyIndex + 1} 個 API Key (索引: ${keyIndex})`);

      const geminiResponse = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      // 如果請求成功 (HTTP 狀態碼 200)，表示辨識成功
      if (geminiResponse.ok) {
        const data = await geminiResponse.json();
        console.log(`[成功] 使用第 ${keyIndex + 1} 個 API Key 辨識成功。`);
        return response.status(200).json(data);
      }
      
      // 如果回傳「資源已耗盡/額度超限」(HTTP 狀態碼 429)
      if (geminiResponse.status === 429) {
        console.warn(`[警告] 第 ${keyIndex + 1} 個 API Key 已達每日額度上限。正在切換至下一個...`);
        
        // 將索引指向下一個金鑰，使用 % 運算符實現循環
        keyIndex = (keyIndex + 1) % totalKeys;
        await setCurrentKeyIndex(keyIndex); // 將新索引存回 Vercel KV
        
        // 使用 continue 關鍵字，直接進入迴圈的下一次迭代，用新的金鑰重試
        continue; 
      }
      
      // 如果是其他類型的 API 錯誤 (如 400 Bad Request)
      // 這種錯誤通常不是額度問題，重試也無效，應直接回報給前端
      const errorData = await geminiResponse.json();
      console.error(`[錯誤] Gemini API 回報錯誤 (狀態碼: ${geminiResponse.status})，金鑰索引: ${keyIndex}。錯誤內容:`, JSON.stringify(errorData));
      return response.status(geminiResponse.status).json(errorData);

    } catch (error) {
      // 如果是網路層面的錯誤 (例如 fetch 自身失敗、DNS 解析錯誤等)
      console.error(`[嚴重錯誤] 連接至 Gemini API 時發生網路層錯誤:`, error);
      // 這種情況下，也嘗試切換到下一個金鑰，或許是該金鑰對應的端點有暫時性問題
      keyIndex = (keyIndex + 1) % totalKeys;
      await setCurrentKeyIndex(keyIndex);
    }
  }

  // 步驟 6: 如果迴圈跑完，表示所有金鑰都嘗試過且都失敗了
  console.error('[緊急] 所有 API Keys 皆已達到額度上限或請求失敗。');
  response.status(429).json({ error: '所有可用的 API 金鑰皆已達到每日限額，請明天再試。(All available API keys have reached their daily limit. Please try again tomorrow.)' });
}
