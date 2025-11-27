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
        history: history.filter(m => m.role !== 'model' || !m.isLoading)
      })
    });

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
    // Try to find JSON block in the full text
    const jsonMatch = fullText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const cleanJson = jsonMatch[0].replace(/```json\s*/g, "").replace(/```\s*/g, "");
        const parsed = JSON.parse(cleanJson);
        if (parsed.chart) {
          // If pure JSON was returned, we might want to clean the text shown to user
          // Or just attach the chart data
          return {
            text: parsed.message || (fullText.includes("```") ? "Gráfico gerado:" : fullText),
            chartData: parsed.chart
          };
        }
      } catch (e) {
        // Ignore JSON parse errors
      }
    }

    return { text: fullText };

  } catch (error: any) {
    console.error("Stream Error:", error);
    return { text: "Erro de conexão com o servidor." };
  }
};