import { JSDOM } from "jsdom";
import { getRecipeDetails, getRecipeImage } from "./utils/ai";
import { Hono } from "hono";
import { z } from "zod";
import { validator } from "hono/validator";
import { minioClient, recipeBucketName } from "./utils/minio";

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

async function uploadImageToMinIO(imageUrl: string, bucketName: string, objectName: string) {
    try {
        const response = await fetch(imageUrl);
        const imageBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(imageBuffer);
        console.log("uploading on ", bucketName)

        minioClient.putObject(bucketName, objectName, buffer);
    } catch (error) {
        console.error('Error fetching image:', error);
    }
}

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

        getRecipeImage(recipe).then((imgUrl) => {
            if (imgUrl) {
                // TODO use recipe title here
                uploadImageToMinIO(imgUrl, recipeBucketName, "test_minio_working.png")
            }

        });

        return c.json(recipe, 200);
    }
);

export default {
    port: 1171,
    fetch: app.fetch,
}
