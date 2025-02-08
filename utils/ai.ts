import OpenAI from "openai";

export const ai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function getRecipeDetails(html: string) {
    const completion = await ai.chat.completions.create({
        messages: [
            {
                role: "system",
                content: "You are an assistant that extract recipes from websites. You will take the html of a website as an input, and answer with only this JSON format : {ingredients: <string[]>, instructions: <string[]>}. Ingredients represent the ingredients needed in the recipe, and instructions is an array containing the instructions of the recipe in chronological order. You only answer the json result of a recipe. If you can't find what you need, answer with an apology string."
            },
            {
                role: "user", content: `Here is the recipe: ${html}. Answer with provided JSON format`
            }
        ],
        model: "gpt-4o",
    });


    return completion.choices[0].message.content;
}
