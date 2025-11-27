import { ChartData, Message } from "../types";

export const streamResponse = async (
  history: Message[],
  userPrompt: string,
  onChunk: (chunk: string) => void
): Promise<{ text: string; chartData?: ChartData }> => {
  
  try {
    const response = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userPrompt,
        // Send simplified history to backend
        history: history.filter(m => !m.isLoading && (m.role === 'user' || m.role === 'model'))
      })
    });

    if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
    }

    if (!response.body) throw new Error("No response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      const chunk = decoder.decode(value, { stream: true });
      fullText += chunk;
      onChunk(chunk);
    }

    // Post-processing for JSON Charts
    // Try to find JSON block in the full text for charts
    // We look for the specific pattern {"chart": ... }
    const jsonMatch = fullText.match(/\{[\s\S]*"chart"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const possibleJson = jsonMatch[0];
        const parsed = JSON.parse(possibleJson);
        if (parsed.chart) {
            // Remove the raw JSON from the displayed text to keep it clean
            const cleanText = fullText.replace(possibleJson, "").trim();
            return {
                text: cleanText || "Aqui está o gráfico solicitado:",
                chartData: parsed.chart
            };
        }
      } catch (e) {
        // If parsing fails, just return the text as is
      }
    }

    return { text: fullText };

  } catch (error: any) {
    console.error("Stream Error:", error);
    return { text: "\n⚠️ *Erro de conexão com o servidor. Verifique se o backend está rodando.*" };
  }
};
