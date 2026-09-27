export class LlmClient {
  constructor({ enabled = false, baseUrl = "https://api.deepseek.com/v1", apiKey = "", model = "deepseek-chat", temperature = 0.8, maxTokens = 600, timeoutSec = 40 } = {}) {
    this.enabled = Boolean(enabled && apiKey);
    this.baseUrl = String(baseUrl).replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.timeoutSec = timeoutSec;
  }

  isEnabled() {
    return this.enabled;
  }

  /** 控制台改 AI 配置后热重载（含 apiKey），不必重启 */
  applyConfig(cfg = {}) {
    const {
      enabled = this.enabled, baseUrl = this.baseUrl, apiKey = this.apiKey,
      model = this.model, temperature = this.temperature,
      maxTokens = this.maxTokens, timeoutSec = this.timeoutSec,
    } = cfg || {};
    this.enabled = Boolean(enabled && apiKey);
    this.baseUrl = String(baseUrl).replace(/\/+$/, "");
    this.apiKey = apiKey;
    this.model = model;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
    this.timeoutSec = timeoutSec;
    return this;
  }

  async chat(messages, systemPrompt) {
    if (!this.enabled) throw new Error("AI not enabled");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutSec * 1000);
    try {
      const resp = await fetch(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: this.temperature,
          max_tokens: this.maxTokens,
          messages: [{ role: "system", content: systemPrompt }, ...messages],
        }),
        signal: controller.signal,
      });
      if (!resp.ok) {
        const txt = await resp.text().catch(() => "");
        throw new Error(`AI api ${resp.status}: ${txt.slice(0, 120)}`);
      }
      const data = await resp.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text) throw new Error("AI api: empty reply");
      return String(text).trim();
    } finally {
      clearTimeout(timer);
    }
  }
}