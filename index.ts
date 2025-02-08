import { JSDOM } from "jsdom";
import { getRecipeDetails } from "./utils/ai";
import { Hono } from "hono";
import { z } from "zod";
import { validator } from "hono/validator";

interface Recipe {
    ingredients: string[],
    instructions: string[],
}

function removeTags(html: string) {
    const dom = new JSDOM(html);
    const document = dom.window.document;

    const tagsToRemove = ["script", "footer", "header", "style", "head", "link", "noscript"];
    tagsToRemove.forEach(tag => {
        const elements = document.querySelectorAll(tag);
        elements.forEach((element: any) => {
            element.remove();
        });
    });

    return dom.serialize();
}

function removeSpaces(str: string) {
    return str.replace(/\s+/g, "");
}

function parseAiResponse(txt: string): Recipe {
    const split = txt.split("\n");
    return JSON.parse(split.slice(1, split.length - 1).join("\n")) as Recipe;
}

const recipeReqSchema = z.object({
    recipeUrl: z.string().url(),
});

const app = new Hono();

app.post(
    "/recipe",
    validator("json", (value, c) => {
        const parsed = recipeReqSchema.safeParse(value);
        if (!parsed.success) {
            return c.text("invalid req body", 400);
        }
        return parsed.data;
    }),
    async (c) => {
        const { recipeUrl } = c.req.valid("json");

        const res = await fetch(recipeUrl);
        const html = await res.text();

        const parsed = removeSpaces(removeTags(html));

        const aiResponse = await getRecipeDetails(parsed);
        const recipe = parseAiResponse(aiResponse || "");

        return c.json(recipe, 200); 
    }
)

export default app;
