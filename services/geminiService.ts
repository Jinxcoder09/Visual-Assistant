import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.API_KEY;

if (!API_KEY) {
  // In a real app, you'd want to handle this more gracefully.
  // For this environment, we assume the key is present.
  console.warn("API_KEY environment variable not set. The app will not function correctly.");
}

const ai = new GoogleGenAI({ apiKey: API_KEY! });
const modelName = 'gemini-2.5-flash';

const fileToGenerativePart = (base64Data: string) => {
    const match = base64Data.match(/^data:(.+);base64,(.+)$/);
    if (!match) {
        throw new Error("Invalid base64 data URL format");
    }
    const mimeType = match[1];
    const data = match[2];

    return {
        inlineData: {
            mimeType,
            data
        },
    };
};

export const analyzeScene = async (base64ImageData: string): Promise<string> => {
    try {
        const imagePart = fileToGenerativePart(base64ImageData);
        const prompt = `You are an AI visual assistant for a blind user. Your primary goal is to provide immediate, concise, and actionable information to help them navigate.

**Rules:**
1. **Be Extremely Brief:** Use the fewest words possible. No filler words.
2. **Focus on Hazards First:** Immediately report any obstacles, steps, curbs, or people in their path.
3. **Use Direct Language:** Use simple, clear terms.
4. **Describe Proximity:** State where objects are relative to the user (e.g., 'Curb ahead', 'Door to your left', 'Person approaching').
5. **Announce Changes:** Mention if a door opens, a light changes, or a path clears.

**Examples:**
- **Good:** 'Stop. Curb ahead.'
- **Bad:** 'I see that there is a curb coming up in front of you, so you should probably stop.'
- **Good:** 'Clear path.'
- **Bad:** 'It looks like the area in front of you is clear of any obstacles.'
- **Good:** 'Chair, front right.'
- **Bad:** 'There is a chair located in front of you and to your right.'

Analyze the image and provide a description following these rules precisely.`;

        const response = await ai.models.generateContent({
            model: modelName,
            contents: { parts: [{ text: prompt }, imagePart] },
        });
        
        const text = response.text;

        if (!text) {
            return "No clear view.";
        }
        return text;
    } catch (error) {
        console.error("Error analyzing scene:", error);
        return "Error analyzing.";
    }
};